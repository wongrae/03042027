# Design

## Context

`site/js/hero.js` pins a full-viewport stage inside a tall scroll track and maps scroll progress (0..1) to `video.currentTime`, gliding toward the target each animation frame. It already solves the hard parts: iOS needing a play/pause "prime" before it shows frames, all-keyframe encoding for smooth reverse seeking, and falling back to the still on reduced motion or load errors. Section 3 needs the same video handling with a different input. Instead of page scroll position, it follows horizontal swipe distance.

## Goals / Non-Goals

**Goals:**
- Swipe left/right over section 3 to scrub its video forward/back, on phones, tablets and desktops.
- Vertical swipes and wheel scrolling over section 3 scroll the page as normal, with no trapping and no lag.
- One shared implementation of the video handling for both sections.

**Non-Goals:**
- No pinning or scroll-jacking of section 3.
- No looping. The clip holds on its first frame at the start and its last frame at the end.

## Decisions

### 1. Pointer Events + `touch-action: pan-y` for touch
On section 3, CSS `touch-action: pan-y` tells the browser to handle vertical pans itself (native page scroll, no JS delay) and to hand horizontal movement to the page's pointer events. JS tracks `pointerdown` / `pointermove` / `pointerup` and turns horizontal finger movement into scrub progress. If the browser decides a gesture is a vertical scroll, it sends `pointercancel` and the scrub stops where it is. This is the standard way to get "sideways in a section, vertical everywhere" without fighting the browser.
- *Alternative:* `touchmove` with `preventDefault()` and manual axis locking. This needs non-passive listeners, which hurt scroll performance, and it reimplements what `touch-action` gives for free. Rejected.

### 2. Swipe distance → video time
Progress changes by `-dx / (sectionWidth * SWIPE_WIDTHS_PER_CLIP)`, so a swipe to the left (negative `dx`) advances. The result is clamped to 0..1, and progress × duration is fed to the same glide loop the hero uses. `SWIPE_WIDTHS_PER_CLIP` (2.25, meaning about two and a quarter full-width swipes cover the whole clip; first 3, then made faster after Rae tested it on her phone) is a named constant like `SCROLL_VH_PER_SECOND`, so the pace is easy to tune. The math lives in a pure function (`swipeProgress(start, dx, width)`) so it can be unit tested.

### 3. Desktop inputs
- **Trackpad horizontal swipe** (`wheel` with `|deltaX| > |deltaY|`): scrubs, and calls `preventDefault()` only for those horizontal events, so Mac two-finger swipes don't trigger browser back/forward. Vertical wheel events are left alone, so the page scrolls. `overscroll-behavior-x: contain` on the section is a second guard against the history gesture.
- **Mouse drag**: the same pointer handlers (mouse is a pointer). Uses `cursor: grab` / `grabbing`, which is not an overlay.
- **Keyboard**: the section is focusable (`tabindex="0"`, `role="group"`, an `aria-label` that says to use the arrow keys). ←/→ step the video by 10% of the clip.

### 4. Shared module `video-scrub.js`
`createScrubVideo({ src, poster, win, progress, onMeta, onFail })` builds the muted/inline/no-PiP `<video>`, primes it for iOS (including the first-touch retry), fades it in on `loadeddata`, and returns `{ video, schedule(), destroy() }`. Each animation frame, the glide loop moves the video toward `progress()` × duration, and `schedule()` wakes the loop. `hero.js` keeps its tall-track and sticky logic, passes `scrollProgress(...)` as `progress`, and schedules on scroll. `swipe.js` keeps a progress value that pointer, wheel and key input update with `swipeProgress(...)`, then schedules. The existing exports `scrollProgress`, `trackVh`, `canScrub` and `initHero` and their tests stay the same.

### 5. Placeholder media
Rae supplied a landscape placeholder clip (`source-media/swipe/placeholder_horizontal.mp4`, 848×464, 7.6 s). It is encoded like the hero clip (silent, all-keyframe) to `site/video/swipe.mp4` (about 3.3 MB), and its first frame becomes `site/img/swipe-still.jpg`. `config.swipeVideo` points at it. The real clip replaces those two files later.

### 7. Section height follows the clip's shape
The section is full-bleed, and its height comes from the still image's own proportions (`width:100%; height:auto`), capped at the screen height (`100svh`). The video is layered over the still with `object-fit: cover`. A landscape clip is therefore never cropped into a narrow portrait slice on phones: at 375px wide it is about 205px tall. A taller or portrait clip grows the section, up to a full screen. This replaces the fixed 100svh height in the original plan.

### 6. Hero text into the info section
The hero markup becomes the still, then the video, with no gradient and no `.hero-pad`. The text block moves to the top of `.info-text`, recoloured for the blush background: names in `--ink` instead of white, "and" stays `--clay`, and the eyebrow and tagline use `--ink-muted`. The ≤680px font sizes carry over. Each group gets `data-reveal` with staggered delays, ahead of Date / Time / Venue.

### 8. Momentum after a swipe
Added after phone testing, so the swipe feels like the vertical page fling. While the finger or mouse is down, the last few `{time, x}` samples are kept. On `pointerup`, `releaseVelocity` measures the speed over the final 100ms (0 if the finger had stopped), capped at 3 px/ms. The video then keeps moving at that speed, which decays exponentially (`decayVelocity`, time constant `MOMENTUM_MS` = 250ms, so the coast is about speed × 250ms in pixels). It stops when the speed drops below 0.02 px/ms or the clip reaches either end. A new touch or drag, a horizontal wheel event or an arrow key stops the coast at once. `pointercancel` (the browser took the gesture as a page scroll) doesn't fling. The trackpad wheel path adds none, because the OS already sends momentum wheel events.

## Risks / Trade-offs

- **iPhone/Android edge-back gesture:** a swipe that *starts* within roughly 20px of the screen edge is taken by the OS as "back" and can't be blocked by a web page. Most swipes start mid-screen, and a right-swipe (rewind) from the left edge is the only real overlap. Accepted.
- **Diagonal swipes:** the browser decides the axis. A mostly vertical swipe scrolls the page and doesn't scrub, which is the intended trade.
- **Discoverability:** with no overlay, visitors may not know to swipe. Rae chose to keep the section clean for now (no swipe cue). A faint ← arrow that fades out after the first swipe can be added later if guests miss it.
- **Plain mouse wheel (no trackpad):** it scrolls the page past section 3. Scrubbing needs a drag or the arrow keys.
