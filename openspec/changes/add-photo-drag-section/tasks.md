# Tasks

## 1. Placeholder photos

- [x] 1.1 Add `scripts/gen-photo-field-placeholders.mjs` (dependency-free Node script calling ffmpeg from `FFMPEG` or `PATH`). It writes `site/img/photo-field/01.jpg`–`20.jpg` in Warm Muted gradients with a large centred number: 8 portrait 4:5, 6 landscape 3:2, 6 square, about 800px on the long side. If `drawtext` is unavailable it falls back to unnumbered images. Run it with the portable ffmpeg. Verify there are 20 files, each under about 40 KB, the shapes are mixed, and the numbers are legible when opened
- [x] 1.2 Add `photoField` to `site/js/config.js` as an explicit list of the 20 paths, with a comment saying they're placeholders and how to swap them. Verify `node -e "import('./site/js/config.js').then(m=>console.log(m.config.photoField.length))"` prints 20

## 2. Layout and wrap logic (pure)

- [x] 2.1 In a new `site/js/photo-field.js`, implement the pure helpers `mulberry32`, `layoutField(count, seed)`, `photoUnit(w, h)`, `copiesNeeded(view, tile, maxPhoto)`, `wrap(v, p)` and `instancePosition(...)` per design Decisions 2, 3 and 5. Add `tests/photo-field.test.mjs` covering:
  - the same seed gives the same layout
  - 20 photos make a 5 × 4 grid with one photo per cell and widths in range
  - `photoUnit` clamps at both ends and gives about 110 at 375 × 609 and about 280 at 1920 × 810
  - `copiesNeeded` always covers view plus 2 × max photo
  - `wrap` handles negatives and stays continuous, and an instance re-enters on the opposite side exactly one period away
  - zero or NaN sizes are safe
  
  Verify `npm test` passes

## 3. Section and interaction

- [x] 3.1 Add `<section class="photo-field-shell" id="photo-field" hidden>` after `#swipe-video` and before `#gallery-slot` in `site/index.html`. Add the CSS in `site/css/base.css`: full-bleed, `background: var(--bg)`, `height: 75vh; height: 75svh; min-height: 280px`, `overflow: hidden`, and the `.photo-field-active` rules (`touch-action: none`, `overscroll-behavior: contain`, grab and grabbing cursors, no user-select or callout, a focus-visible outline in `--clay-dark`). Verify via `?now=` in all three phases that the section sits below the swipe video, with the gallery teaser after it in Phase 3
- [x] 3.2 Implement `initPhotoField({ photos, section, win })`:
  - Build the `<img>` instances: `draggable=false`, `loading=lazy`, `decoding=async`, with copies `aria-hidden` and empty `alt`. Place them with `translate3d`.
  - Unhide the section and add the focus/role/aria-label attributes.
  - Pointer drag in any direction with pointer capture, ignoring a second pointer.
  - Run one `requestAnimationFrame` loop only while moving.
  - On resize/rotate, recompute and keep the offset in `u` units.
  - Hide every instance of a photo that fails to load.
  - Return `{ active, destroy }`. With empty `photos` it leaves the section hidden.
  
  Wire it up in `main.js`. Add tests: empty list stays hidden, `destroy()` removes listeners and attributes. Verify `npm test` passes, and in Chrome at 375px and 1280px that dragging in all four directions and diagonally moves the field with no gaps or visible snap, even after a drag of more than 10 screen-widths
- [x] 3.3 Add momentum and depth: per-axis release speed via `releaseVelocity` (imported from `swipe.js`), glide with `decayVelocity`, catch-on-touch, per-photo depth from the layout. Add tests for the 2D release speed (a stopped finger gives zero, a diagonal flick gives both axes). Verify in Chrome that a quick flick glides and settles, a drag that stopped before release stays put, and touching a gliding field stops it
- [x] 3.4 Add wheel and keyboard input: only sideways-dominant wheel events move the field (`preventDefault`), vertical wheel scrolls the page, arrow keys move by `0.5u` with `preventDefault`. Reduced motion means no glide and a depth of 1. Add tests: reduced motion turns off glide and depth, and the arrow-key step direction is right. Verify in desktop Chrome that a mouse wheel over the section scrolls the page, a trackpad sideways swipe moves the field without going back in history, Tab plus the arrows work, and the DevTools reduced-motion emulation behaves as in the spec
- [x] 3.5 Document the section in `README.md`: what it does, how to swap photos (same file name, resize to about 1200px on the long side first, Polaroid-style images are fine), how to add or remove photos in `config.photoField`, how to rerun the placeholder script, and the tuning constants (`SEED`, `DENSITY`, `U_MIN`/`U_MAX`, `MOMENTUM_MS`, section height). Verify the documented placeholder command runs as written

## 4. Integration checks

- [ ] 4.1 Check phone emulation in Chrome DevTools (iPhone SE and a Pixel at about 412 × 915, portrait and landscape): the section is about 75% of the screen tall, the page scrolls when swiping just above or below it, dragging works in all directions, rotating keeps the field filled, and there are no console errors. Check that the hero and swipe video still scrub as before, and that `npm test` passes
- [ ] 4.2 **(Rae)** On a real iPhone and an Android phone: drag the field around in every direction, flick it, scroll the page past the section by swiping above or below it, and confirm it doesn't feel trapping. Adjust the section height if it does

## Workflow follow-up

- After Rae's phone check, sync the `photo-field` spec and the `swipe-video` placement change, then archive the change.
