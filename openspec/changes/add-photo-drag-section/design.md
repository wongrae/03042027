# Design

## Context

The landing page is static HTML on GitHub Pages with ES-module scripts and no build step or dependencies. `site/js/swipe.js` already handles pointer, wheel and keyboard input for section 3, and has pure, unit-tested helpers for flick momentum (`releaseVelocity`, `decayVelocity`, `wheelPixels`). Tests run with `node --test` against pure functions and small fake-DOM objects. Python isn't installed on this machine, but the portable ffmpeg used for the videos is (`C:\Users\WongR\ffmpeg-portable`).

Reference behaviour (afterduskmedia.com, narrow layout, inspected in Chrome on 2026-11-28): about 45 image elements, mostly copies of one scattered set, are moved as a group by drag. The set repeats roughly every 1,060px, and copies jump by one repeat-width when they leave the view. After release the field glides about 100px and settles within about 0.5s. Per-photo travel varies by a few percent, which gives a slight depth effect. It uses no canvas.

Its narrow layout, measured again in a 400 × 800 frame after Rae found the first version too sparse and too overlapped: the repeating block is exactly 400 × 800, holding 11 photos scattered with no rows or columns (about 2½ photos across). Photos are 26–57% of the frame width (about 42% on average) and cover about 92% of the area. Overlaps are mostly edge strips, but its most-covered photo shows only about 15%, which Rae does not want. A second version used staggered masonry columns; Rae found that too structured, so the layout below scatters photos freely. That site's field is the whole page. Ours sits inside a scrolling page, which drives Decision 4.

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

### 2. Layout: afterdusk's own block, copied one to one
(Revised three times after Rae's reviews: a jittered grid left holes and piles; masonry columns looked too structured; a computer-packed scatter looked crowded and its gaps and overlaps felt accidental. Rae asked for the reference copied one to one.)

`BLOCK` holds the reference's narrow-screen block exactly as measured: 11 slots in a 400 × 800 frame, each with its left, top, width and height, so its deliberate gaps and overlaps are reproduced. Only the stacking order differs: on the reference two slots are 85% hidden behind a neighbour, so the layers were reordered (positions untouched) until every slot shows at least about 46%. The block is drawn at `u / 171` times its measured size (171 is the reference frame's `u`).

A pure `layoutField(aspects, seed)` fills it:
- **Blocks:** one block per 11 photos, stacked downwards (20 photos = 2 blocks, 22 slots). The tile is one block wide and `blocks` blocks tall.
- **Matching:** photos go to the slots closest to their shape (the k-th tallest photo to the k-th tallest slot). A photo keeps its own shape at its slot's centre and area, so a photo shaped like its slot fills it exactly, and other shapes stay close.
- **Spare slots** at the end of the last block show a second copy of the closest-shaped photo from another block (2 for 20 photos), `aria-hidden` like other copies.
- **Seed:** only the small per-photo depth lag is random (seeded mulberry32); the arrangement itself is fixed.

The placeholders are made in the three slot shapes (tall 2:3, portrait ~5:6, landscape ~5:4) so the field looks exactly like the reference until real photos arrive. About 92% of the area is covered, as on the reference.

Photo shapes are read before the layout is built (`new Image()`, once the section is within about a screen of the viewport).
- *Alternative:* a computer-packed scatter (the third version). It adapts to any shape, but its gaps and overlaps looked accidental. Rejected.
- *Alternative:* cropping photos to their slots (`object-fit: cover`). It would match the reference exactly for any photo, but it cuts off edges, including any Polaroid-style borders Rae adds. Rejected; the README says which shape each photo number fits best.

### 3. Endless repeat by wrapping each instance over a period
- **The tile** repeats `tileW` across and `tileH` down. Each repeat across is also shifted down by one block, so a photo's twin is never level with it, while every block still has the same neighbours as on the reference (so the seams between blocks are the reference's own).
- **Copy count:** `copies = ceil((sectionSize + 2 × margin) / span)` each way, at least 1, where the margin is half the largest photo plus `WRAP_PAD` (0.5u).
- **Accessibility:** copies beyond the first are `aria-hidden`, with empty `alt`.

Each frame, `tilePosition` places every instance. Across, it is `wrap(base + copyIndex × span + offset, copies × span) − margin`, where `wrap(v, p) = ((v % p) + p) % p`. When a copy wraps across it becomes a different repeat of the tile, so its vertical position takes that repeat's shift; this happens while it is off-screen. Down, the same wrap applies over the tile height. The period is always at least the visible size plus the margin on both sides, so the jump from one edge to the other always happens off-screen. That holds even during a fast flick, which is what the `WRAP_PAD` is for. A unit test drags 60,000px at 40px per frame at five screen sizes and checks that no photo jumps while on screen and that every visible copy sits exactly where the endless layout puts it. Copies share URLs, so each file downloads once.

### 4. Touch: `touch-action: none` on a 75%-height section
The page can't tell a vertical drag of the field from a page scroll, so on the section itself all touch movement goes to the field (`touch-action: none`, pointer capture for every pointer type, a second finger ignored). To keep guests from getting trapped, the section is `height: 75svh` (fallback `75vh`, with a minimum of 280px). Whenever it's centred on screen, the page above or below it is visible to swipe on. Rae chose this over the swipe video's horizontal-only touch, so that dragging works in every direction on phones too.
- *Alternative:* `touch-action: pan-y` (vertical swipes scroll the page, sideways ones move the field). It never traps, but it loses vertical dragging on phones. Rae declined it.

### 5. Photo size scales with the screen
`u = clamp(U_MIN, sqrt(sectionWidth × sectionHeight) / DENSITY, U_MAX)` with `U_MIN = 150`, `U_MAX = 300` and `DENSITY = 2.7`. On a typical phone (375px wide, section 500px tall) that is about 160px, which draws the block almost exactly as wide as the screen, as on the reference; a large desktop gets 300px (the block at 1.75× size, repeated sideways). The drag offset is stored in units of `u`. On resize or rotation, `u`, the tile and the copies are recomputed, and image elements are only rebuilt if the copy count changes. The field keeps its relative position.

### 6. Input
- **Drag:** pointer down/move/up on the section moves the offset by the pointer delta, 1:1. `draggable="false"` on images, `user-select: none`, and `preventDefault` on `dragstart` stop image dragging and text selection. `cursor: grab` / `grabbing` show it can be dragged.
- **Momentum:** release speed per axis comes from the recent `{t, x}` and `{t, y}` samples via `releaseVelocity` from `swipe.js`. The glide decays with `decayVelocity` (`MOMENTUM_MS` = 250), the same feel as section 3. It stops below 0.02 px/ms. A new pointerdown, wheel or key stops the glide.
- **Wheel:** only sideways-dominant wheel events (`|deltaX| > |deltaY|`) move the field, with `preventDefault` so trackpad back/forward doesn't fire. Vertical wheel events are untouched, so the page scrolls. `overscroll-behavior: contain` on the section is a second guard.
- **Keyboard:** the section has `tabindex="0"`, `role="group"` and an `aria-label` ("Photos. Drag, or use the arrow keys, to move around."). Arrow keys move the field by `0.5u` per press, with `preventDefault` so the page doesn't scroll.

### 7. Depth and reduced motion
Depth is a lag, not a speed difference. Each photo eases toward the drag position with its own time constant (0–90ms, `catchUp(dt, lag) = 1 − e^(−dt/lag)`). While moving, photos shift slightly against each other. When the drag stops they settle back into the exact layout, so the arrangement never drifts out of shape however much it is dragged. The first version gave each photo a different speed, which slowly scrambled the layout over long drags.

With `prefersReducedMotion()` from `video-scrub.js`, drag still works 1:1 (it is motion the visitor makes directly), but there's no lag and no glide after release.

### 8. Configuration and placeholders
`config.photoField` is an explicit array of image paths (`./img/photo-field/01.jpg` … `20.jpg`). GitHub Pages can't list a folder, so the list lives in config. An empty or missing list leaves the section `hidden`, which is also its initial state in the markup until `photo-field.js` mounts. Without JS there is no blank 75% band. The section is unhidden as soon as `photo-field.js` starts, so it takes its space immediately and nothing below it jumps. A photo that fails to load is left out of the layout entirely, so it leaves no hole.

Placeholders come from a new `scripts/gen-photo-field-placeholders.mjs`. It's a dependency-free Node script that calls ffmpeg (path from the `FFMPEG` environment variable, defaulting to `ffmpeg`). It writes 20 JPGs in Warm Muted palette gradients with a large centred number (`01`–`20`, using `drawtext` and a Windows system font), in the shapes of the block's slots, in slot order (8 tall 2:3, 9 portrait ~5:6, 3 landscape ~5:4). Each is about 800px on its long side and under about 40 KB. If this ffmpeg build lacks `drawtext`, the script writes the gradients without numbers and says so.

### 9. Hand-made layouts and the layout editor
Rae asked to arrange the photos by hand. `site/js/photo-layout.js` exports `photoLayout`: `null` (use the automatic arrangement) or `{ width, height, shift, photos: [{ src, x, y, w, z }] }` in px of a phone-width frame (x, y = centre, w = width; height from the photo's own shape, so nothing is cropped). `handLayout()` turns it into the same shape of layout as `layoutField()`, so wrapping, depth and input are shared. While it places any photos, the field shows exactly those (a photo may be placed more than once; later copies are `aria-hidden`).

The editor is `tools/photo-layout-editor/` (outside `site/`, so never published), served by `scripts/serve.mjs` at `/__layout-editor/`. It imports the site's own `config.js`, `photo-layout.js` and `photo-field.js`, starts from the saved or automatic layout, and shows the repeats around the frame, a movable phone-screen outline, coverage, and a warning for any photo under 40% visible. Save POSTs to `/__layout-editor/save`; the server accepts it only from the loopback address, checks it with `cleanLayout()` (`scripts/photo-layout-file.mjs`: numeric ranges, photo paths limited to `./img/…` image files), and writes the module with `layoutModule()`.
- *Alternative:* editing numbers in `config.js` by hand. Rae chose the visual editor.

### 10. Files
- `site/js/photo-field.js`: pure helpers (`mulberry32`, `blockSlots`, `layoutField`, `photoUnit`, `copiesNeeded`, `wrap`, `instancePosition`, `tilePosition`, `catchUp`) plus `initPhotoField({ photos, section, win })`, which returns `{ active, destroy }` like `initSwipe`.
- `site/index.html`: `<section class="photo-field-shell" id="photo-field" hidden>` after `#swipe-video`, before `#gallery-slot`.
- `site/css/base.css`: full-bleed shell (`width:100vw; margin-left:calc(50% - 50vw)`), `background: var(--bg)`, `overflow: hidden`, height rules, the `.photo-field-active` interaction rules, and focus outline.
- `site/js/main.js`: `initPhotoField({ photos: config.photoField, layout: photoLayout })`.
- `site/js/photo-layout.js`, `tools/photo-layout-editor/`, `scripts/photo-layout-file.mjs` and the editor routes in `scripts/serve.mjs` (Decision 9).

## Risks / Trade-offs

- [A guest whose screen is filled by the section can't scroll by swiping on it] → The 75svh height always leaves page visible above or below when centred. If it's mid-transition, a guest can also swipe on the swipe-video section or the info section. Rae can lower the height constant if testing shows it still feels trapping.
- [80 images on large desktops] → All copies reuse the same 20 cached files. Transforms are GPU-composited, and the loop only runs while moving. If it stutters on an older laptop, `copiesNeeded` can be capped and `DENSITY` raised (bigger photos, fewer copies).
- [Very large original photos uploaded by Rae (5 MB phone shots)] → The README tells Rae to resize to about 1200px on the long side and JPEG-compress before dropping them in. `loading="lazy"` and `decoding="async"` keep them off the first paint.
- [Photos briefly shift against each other while dragging] → The lag is at most 90ms, so at normal drag speeds the shift is a few dozen px, and the photos settle back into place as soon as the drag stops.
- [Photos are fetched once the section is near, before it is shown] → Only when it is within about a screen of the viewport. The 20 placeholders total about 330 KB, and real photos should be resized first (see the README).
- [Phone OS edge-back gesture] → As with section 3, a drag that starts within about 20px of the screen edge may be taken as "back". Accepted.
- [Placeholder script depends on ffmpeg drawtext] → Falls back to unnumbered gradients. These are placeholders only.

## Migration Plan

This only adds a section. Rollback is removing the section markup (or emptying `config.photoField`, which leaves it hidden). Deployment is the usual push to `main` (GitHub Pages workflow).
