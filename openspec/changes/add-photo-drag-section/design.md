# Design

## Context

The landing page is static HTML on GitHub Pages with ES-module scripts and no build step or dependencies. `site/js/swipe.js` already handles pointer, wheel and keyboard input for section 3, and has pure, unit-tested helpers for flick momentum (`releaseVelocity`, `decayVelocity`, `wheelPixels`). Tests run with `node --test` against pure functions and small fake-DOM objects. Python isn't installed on this machine, but the portable ffmpeg used for the videos is (`C:\Users\WongR\ffmpeg-portable`).

Reference behaviour (afterduskmedia.com, narrow layout, inspected in Chrome on 2026-11-28): about 45 image elements, mostly copies of one scattered set, are moved as a group by drag. The set repeats roughly every 1,060px, and copies jump by one repeat-width when they leave the view. After release the field glides about 100px and settles within about 0.5s. Per-photo travel varies by a few percent, which gives a slight depth effect. It uses no canvas. That site's field is the whole page. Ours sits inside a scrolling page, which drives Decision 4.

## Goals / Non-Goals

**Goals:**
- Smooth 60fps dragging on mid-range phones with about 20 photos (80 on large screens once copied).
- A layout that stays the same on every visit and is easy to reason about. It must not reshuffle on reload or resize.
- Swapping a photo is just a file replacement. Changing the count is a config edit.

**Non-Goals:**
- No new libraries, canvas or WebGL.
- No idle drift, no tap-to-open, no lazy fetching of photos beyond the browser's own `loading="lazy"`.
- No sharing the drag engine with `swipe.js` beyond importing its pure momentum helpers. The two sections stay independent.

## Decisions

### 1. DOM images moved with transforms, one animation loop while moving
Each photo instance is an absolutely positioned `<img>` at the section's top-left, placed with `transform: translate3d(x, y, 0)` (`will-change: transform`). A single `requestAnimationFrame` loop runs only while a drag or glide is active. When the field is idle nothing runs, so there's no need for an IntersectionObserver pause.
- *Alternative:* `<canvas>` drawing. It's faster with hundreds of images, but it's overkill for 20–80. It loses native image decoding, alt and accessibility, and makes it harder for photos to keep their own aspect ratio. Rejected.

### 2. Scattered layout: a seeded, jittered grid in "photo units"
A pure `layoutField(count, seed)` returns, for each photo, its position, width and depth in units of `u` (the base photo width). Photos fill a `cols × rows` grid (`cols = ceil(sqrt(count × 1.25))`, `rows = ceil(count / cols)`, so 20 photos give a 5 × 4 grid). Each cell is `CELL = 1.35u`. Each photo is offset randomly within its cell by up to ±30% of a cell. Its width is `u × 0.7–1.25`, and its depth factor is 0.9–1.1. All randomness comes from a small seeded PRNG (mulberry32) with a fixed `SEED`, so the arrangement is identical on every visit and testable. Height is `auto` from the image's own shape, so a photo is centred on its anchor point and a portrait or landscape swap grows evenly around that point. The repeating tile is `cols × CELL` by `rows × CELL`. Adjacent photos may overlap a little, as in the reference. A later photo sits on top.
- *Alternative:* hand-placed coordinates per photo. These break whenever the count changes. Rejected.
- *Alternative:* random at load time. The field would look different on every visit, and layout bugs would be hard to reproduce. Rejected.

### 3. Endless repeat by wrapping each instance over a period
The tile is copied `copiesX × copiesY` times, where `copies = ceil((sectionSize + 2 × maxPhotoSize) / tileSize)`, at least 1. Copies beyond the first are `aria-hidden` with empty `alt`. Each frame, each instance's position along each axis is
`wrap(base + copyIndex × tile + offset × depth, period) − maxPhotoSize`, where `period = copies × tile` and `wrap(v, p) = ((v % p) + p) % p`.
Because the period is always at least the visible size plus a photo's width on both sides, the jump from one edge to the other always happens off-screen, so there's no visible snap (spec: *The field never runs out*). This holds even with depth, since depth changes speed but not the range. On phones this is usually 1 × 1 copies (20 images). On a 1920px desktop it's 2 × 2 (80 images). Copies share URLs, so each file downloads once. `wrap`, `copiesNeeded` and `instancePosition` are pure and unit tested.

### 4. Touch: `touch-action: none` on a 75%-height section
The page can't tell a vertical drag of the field from a page scroll, so on the section itself all touch movement goes to the field (`touch-action: none`, pointer capture for every pointer type, a second finger ignored). To keep guests from getting trapped, the section is `height: 75svh` (fallback `75vh`, with a minimum of 280px). Whenever it's centred on screen, the page above or below it is visible to swipe on. Rae chose this over the swipe video's horizontal-only touch, so that dragging works in every direction on phones too.
- *Alternative:* `touch-action: pan-y` (vertical swipes scroll the page, sideways ones move the field). It never traps, but it loses vertical dragging on phones. Rae declined it.

### 5. Photo size scales with the screen
`u = clamp(U_MIN, sqrt(sectionWidth × sectionHeight) / DENSITY, U_MAX)` with `U_MIN = 110`, `U_MAX = 300` and `DENSITY = 4.5` px. This gives about 110px photos on a 375px phone and about 280px on a 1920 × 1080 desktop, so both show a similarly dense field. The drag offset is stored in units of `u`. On resize or rotation, `u`, the tile and the copies are recomputed, and image elements are only rebuilt if the copy count changes. The field keeps its relative position.

### 6. Input
- **Drag:** pointer down/move/up on the section moves the offset by the pointer delta, 1:1. `draggable="false"` on images, `user-select: none`, and `preventDefault` on `dragstart` stop image dragging and text selection. `cursor: grab` / `grabbing` show it can be dragged.
- **Momentum:** release speed per axis comes from the recent `{t, x}` and `{t, y}` samples via `releaseVelocity` from `swipe.js`. The glide decays with `decayVelocity` (`MOMENTUM_MS` = 250), the same feel as section 3. It stops below 0.02 px/ms. A new pointerdown, wheel or key stops the glide.
- **Wheel:** only sideways-dominant wheel events (`|deltaX| > |deltaY|`) move the field, with `preventDefault` so trackpad back/forward doesn't fire. Vertical wheel events are untouched, so the page scrolls. `overscroll-behavior: contain` on the section is a second guard.
- **Keyboard:** the section has `tabindex="0"`, `role="group"` and an `aria-label` ("Photos. Drag, or use the arrow keys, to move around."). Arrow keys move the field by `0.5u` per press, with `preventDefault` so the page doesn't scroll.

### 7. Reduced motion
`prefersReducedMotion()` from `video-scrub.js`: drag still works 1:1 (it's motion the visitor makes directly), but every depth factor is set to 1 and there's no glide after release.

### 8. Configuration and placeholders
`config.photoField` is an explicit array of image paths (`./img/photo-field/01.jpg` … `20.jpg`). GitHub Pages can't list a folder, so the list lives in config. An empty or missing list leaves the section `hidden`, which is also its initial state in the markup until `photo-field.js` mounts. Without JS there is no blank 75% band. A photo that fails to load (`error`) has all its instances hidden. Its cell stays empty, and the field keeps working.

Placeholders come from a new `scripts/gen-photo-field-placeholders.mjs`. It's a dependency-free Node script that calls ffmpeg (path from the `FFMPEG` environment variable, defaulting to `ffmpeg`). It writes 20 JPGs in Warm Muted palette gradients with a large centred number (`01`–`20`, using `drawtext` and a Windows system font), in a fixed mix of shapes: 8 portrait (4:5), 6 landscape (3:2) and 6 square. Each is about 800px on its long side and under about 40 KB. If this ffmpeg build lacks `drawtext`, the script writes the gradients without numbers and says so.

### 9. Files
- `site/js/photo-field.js`: pure helpers (`mulberry32`, `layoutField`, `photoUnit`, `copiesNeeded`, `wrap`, `instancePosition`) plus `initPhotoField({ photos, section, win })`, which returns `{ active, destroy }` like `initSwipe`.
- `site/index.html`: `<section class="photo-field-shell" id="photo-field" hidden>` after `#swipe-video`, before `#gallery-slot`.
- `site/css/base.css`: full-bleed shell (`width:100vw; margin-left:calc(50% - 50vw)`), `background: var(--bg)`, `overflow: hidden`, height rules, the `.photo-field-active` interaction rules, and focus outline.
- `site/js/main.js`: `initPhotoField({ photos: config.photoField })`.

## Risks / Trade-offs

- [A guest whose screen is filled by the section can't scroll by swiping on it] → The 75svh height always leaves page visible above or below when centred. If it's mid-transition, a guest can also swipe on the swipe-video section or the info section. Rae can lower the height constant if testing shows it still feels trapping.
- [80 images on large desktops] → All copies reuse the same 20 cached files. Transforms are GPU-composited, and the loop only runs while moving. If it stutters on an older laptop, `copiesNeeded` can be capped and `DENSITY` raised (bigger photos, fewer copies).
- [Very large original photos uploaded by Rae (5 MB phone shots)] → The README tells Rae to resize to about 1200px on the long side and JPEG-compress before dropping them in. `loading="lazy"` and `decoding="async"` keep them off the first paint.
- [Depth plus wrap could let two photos briefly drift onto each other] → The depth range is kept to ±10%, so over one screen-width of drag the relative shift is at most about 0.2 × screen. Wrapping happens off-screen, and overlap is acceptable in this style.
- [Phone OS edge-back gesture] → As with section 3, a drag that starts within about 20px of the screen edge may be taken as "back". Accepted.
- [Placeholder script depends on ffmpeg drawtext] → Falls back to unnumbered gradients. These are placeholders only.

## Migration Plan

This only adds a section. Rollback is removing the section markup (or emptying `config.photoField`, which leaves it hidden). Deployment is the usual push to `main` (GitHub Pages workflow).
