# Proposal

## Why

The landing page has one scroll-scrubbed video (the hero) with the couple's names and invitation text laid over it. Rae wants a second, different kind of video moment further down the page, and wants both videos to be pure footage with no text on top.

## What Changes

- **Hero: video only.** Remove the text overlay from the hero ("We are getting married", the names, the tagline, the date eyebrow) and the dark gradient that kept it legible. The hero keeps its vertical scroll-scrubbing exactly as it is now.
- **Info section: names move here.** The eyebrow, "Rae *and* Rayven" and "Would like to invite you to a lunch reception" go at the top of the info section, above Date / Time / Venue, with the same fade-in reveal. The separate "April 3, 2027" eyebrow is dropped, since the Date row already says it.
- **New section 3: a swipe-scrubbed video**, directly below the info section and shown in all three phases (in Phase 3 the gallery teaser follows it). Swiping **left** advances the video and swiping **right** rewinds it. Swiping or scrolling **up/down** over it scrolls the page normally, so it never traps the visitor. It is not pinned: it's an ordinary full-width block, as tall as the clip's own shape (at most one screen), that the page scrolls past.
- Until Rae supplies the real clip, section 3 uses a **placeholder** landscape clip she provided (`site/video/swipe.mp4`).
- Refactor: the video setup that both sections need (iPhone priming, frame gliding, still-image fallback) moves out of `hero.js` into a shared module.

## Capabilities

### New Capabilities
- `swipe-video`: the section 3 horizontal-swipe scrubbing, its inputs (touch, trackpad, mouse drag, keyboard), coexistence with vertical page scrolling, and its fallbacks.

### Modified Capabilities
- `hero-animation`: the hero carries no text overlay, and the "single uploaded asset" requirement now counts three manual media uploads instead of two.

## Impact

- **Code:** `site/index.html`, `site/css/base.css`, `site/js/hero.js`, `site/js/main.js` and `site/js/config.js` change. New files are `site/js/video-scrub.js`, `site/js/swipe.js` and `tests/swipe.test.mjs`. `tests/hero.test.mjs` is kept passing.
- **Media:** `site/video/swipe.mp4` and `site/img/swipe-still.jpg` (placeholder). The real section 3 clip needs the same encoding as the hero (short, silent, every frame a keyframe; see README).
- **Out of scope:** pinning section 3, and looping the clip. (Momentum after a swipe was first out of scope, then added after Rae tested on her phone; see design Decision 8.)
