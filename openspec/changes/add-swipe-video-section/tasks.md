# Tasks

## 1. Hero text moves to the info section

- [x] 1.1 Remove the gradient and `.hero-pad` text block from the hero in `site/index.html`, and drop the now-unused `.hero-pad` / `.hero-name` sizing that only applied over the video; verify the hero shows only the still/video at 1280px and 375px
- [x] 1.2 Add the eyebrow, "Rae *and* Rayven" and the tagline at the top of `.info-text`, recoloured for the blush background, with staggered `data-reveal`; drop the duplicate "April 3, 2027" eyebrow; verify the reveal order and the ≤680px sizes

## 2. Shared video module

- [x] 2.1 Extract `site/js/video-scrub.js` (`createScrubVideo`: video element, iOS prime and first-touch retry, glide loop, ready fade, destroy) from `hero.js`; make `hero.js` use it; verify `npm test` still passes and the hero scrubs forwards and backwards in the browser as before

## 3. Swipe video section

- [x] 3.1 Move Rae's placeholder clip to `source-media/swipe/`, encode it to `site/video/swipe.mp4` plus `site/img/swipe-still.jpg`, and set `swipeVideo` in `site/js/config.js`; add a full-bleed `#swipe-video` section after the info section, sized by the clip's shape (capped at 100svh); verify it renders in all three phases via `?now=`, with the gallery teaser after it in Phase 3
- [x] 3.2 Implement `site/js/swipe.js`: a pure `swipeProgress(start, dx, width)`; pointer handlers with `touch-action: pan-y`, `pointercancel` handling and `cursor: grab`; horizontal-dominant `wheel` with `preventDefault` plus `overscroll-behavior-x: contain`; focusable ←/→ keys; still fallback on reduced motion or error. Wire it up in `main.js`. Verify in desktop Chrome with a trackpad and with mouse drag
- [x] 3.3 Add `tests/swipe.test.mjs` covering: a left swipe advances, a right swipe rewinds, clamping at both ends, a zero/NaN width is safe, reduced motion leaves the still; verify `npm test` passes
- [x] 3.5 After phone testing: make swiping faster (`SWIPE_WIDTHS_PER_CLIP` 3 → 2.25) and add momentum after a flick (`releaseVelocity` / `decayVelocity`, `MOMENTUM_MS`), with unit tests; verify in Chrome that a quick drag coasts after release and a drag that stops before release doesn't
- [ ] 3.4 **(Rae)** On a real iPhone and an Android phone: swipe left/right over section 3 (the frame follows in both directions), swipe up/down over it (the page scrolls and the frame doesn't change), and check the hero still scrubs

## 4. Docs

- [x] 4.1 Update the README's video section: how to swap in the real section 3 clip, its encoding, and the `SWIPE_WIDTHS_PER_CLIP` pace setting
