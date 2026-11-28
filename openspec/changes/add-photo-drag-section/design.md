# Design

## Context

The landing page is static HTML on GitHub Pages with ES-module scripts and no build step or dependencies. `site/js/swipe.js` already handles pointer, wheel and keyboard input for section 3, and has pure, unit-tested helpers for flick momentum (`releaseVelocity`, `decayVelocity`, `wheelPixels`). Tests run with `node --test` against pure functions and small fake-DOM objects. Python isn't installed on this machine, but the portable ffmpeg used for the videos is (`C:\Users\WongR\ffmpeg-portable`).

Reference behaviour (afterduskmedia.com, narrow layout, inspected in Chrome on 2026-11-28): about 45 image elements, mostly copies of one scattered set, are moved as a group by drag. The set repeats roughly every 1,060px, and copies jump by one repeat-width when they leave the view. After release the field glides about 100px and settles within about 0.5s. Per-photo travel varies by a few percent, which gives a slight depth effect. It uses no canvas.

Its narrow layout, measured again in a 400 × 800 frame after Rae found the first version too sparse and too overlapped: the repeating block is exactly 400 × 800, holding 11 photos in about 2½ staggered columns. Photos are 26–57% of the frame width (about 42% on average) and cover about 92% of the area. Overlaps are mostly edge strips, but its most-covered photo shows only about 15%, which Rae does not want. That site's field is the whole page. Ours sits inside a scrolling page, which drives Decision 4.

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

### 2. Layout: staggered masonry columns, in "column units"
(Revised after Rae's first look. The original jittered grid of small photos left big holes and let some photos pile up.)

A pure `layoutField(aspects, seed)` takes each photo's real shape (height / width) and returns everything in units of `u`, the column width:
- **Columns:** `cols = max(2, round(count / 7))`, so about 7 photos go in each column and 20 photos make 3 columns. A column is then taller than a phone screen, so a photo never appears twice in one column on screen.
- **Placing photos:** each photo, in list order, goes to the currently shortest column (classic masonry). Its width is `0.65–1.1u`, and it is nudged up to ±0.1u off the column centre, so it may poke a little into the next column. It stacks below the previous photo with a gap of `−0.1u` (overlap) to `+0.06u`.
- **Stagger:** each column starts at a random height (0–0.6u), so the rows don't line up.
- **Stacking order:** shuffled, like the reference.

All randomness comes from a seeded PRNG (mulberry32) with a fixed `SEED`, so the arrangement is the same on every visit and testable. The settings were tuned with a sampling script against the reference: about 82–94% of the area is covered (the reference covers 92%), and every photo stays at least about 70% visible (the unit test requires at least 60%). The reference's worst photo shows only 15%.

Photo shapes are read before the layout is built (`new Image()`, once the section is within about a screen of the viewport). A photo of any shape stacks without leaving a gap.
- *Alternative:* hand-placed coordinates per photo. These break whenever the count changes. Rejected.
- *Alternative:* random at load time. The field would look different on every visit, and layout bugs would be hard to reproduce. Rejected.

### 3. Endless repeat by wrapping each instance over a period
- **Sideways:** the columns form a tile `cols × u` wide, copied `copiesX` times.
- **Downwards:** each column repeats on its own, with its own stacked height as the period, so there is never a seam. Its copy count is `copiesY[col]`.
- **Copy count:** `copies = ceil((sectionSize + 2 × margin) / span)`, at least 1, where the margin is half the largest photo plus `WRAP_PAD` (0.5u).
- **Staggered repeats:** each sideways copy is shifted down by `COPY_SHIFT` (half a column height), so a repeated photo never sits level with its twin. This matters on wide screens, where 20 photos must repeat across the width.
- **Accessibility:** copies beyond the first are `aria-hidden`, with empty `alt`.

Each frame, an instance's position along each axis is `wrap(base + copyIndex × span + offset, copies × span) − margin`, where `wrap(v, p) = ((v % p) + p) % p`. The period is always at least the visible size plus the margin on both sides, so the jump from one edge to the other always happens off-screen. That holds even during a fast flick, which is what the `WRAP_PAD` is for. A unit test drags 60,000px at 40px per frame at five screen sizes and checks that no photo jumps while on screen. Copies share URLs, so each file downloads once.

### 4. Touch: `touch-action: none` on a 75%-height section
The page can't tell a vertical drag of the field from a page scroll, so on the section itself all touch movement goes to the field (`touch-action: none`, pointer capture for every pointer type, a second finger ignored). To keep guests from getting trapped, the section is `height: 75svh` (fallback `75vh`, with a minimum of 280px). Whenever it's centred on screen, the page above or below it is visible to swipe on. Rae chose this over the swipe video's horizontal-only touch, so that dragging works in every direction on phones too.
- *Alternative:* `touch-action: pan-y` (vertical swipes scroll the page, sideways ones move the field). It never traps, but it loses vertical dragging on phones. Rae declined it.

### 5. Photo size scales with the screen
`u = clamp(U_MIN, sqrt(sectionWidth × sectionHeight) / DENSITY, U_MAX)` with `U_MIN = 150`, `U_MAX = 300` and `DENSITY = 3.3` px. That is a 150px column on a phone (about 2½ columns across, like the reference's ~170px photos at 400 × 800) and a 300px column on a large desktop. The drag offset is stored in units of `u`. On resize or rotation, `u`, the tile and the copies are recomputed, and image elements are only rebuilt if the copy count changes. The field keeps its relative position.

### 6. Input
- **Drag:** pointer down/move/up on the section moves the offset by the pointer delta, 1:1. `draggable="false"` on images, `user-select: none`, and `preventDefault` on `dragstart` stop image dragging and text selection. `cursor: grab` / `grabbing` show it can be dragged.
- **Momentum:** release speed per axis comes from the recent `{t, x}` and `{t, y}` samples via `releaseVelocity` from `swipe.js`. The glide decays with `decayVelocity` (`MOMENTUM_MS` = 250), the same feel as section 3. It stops below 0.02 px/ms. A new pointerdown, wheel or key stops the glide.
- **Wheel:** only sideways-dominant wheel events (`|deltaX| > |deltaY|`) move the field, with `preventDefault` so trackpad back/forward doesn't fire. Vertical wheel events are untouched, so the page scrolls. `overscroll-behavior: contain` on the section is a second guard.
- **Keyboard:** the section has `tabindex="0"`, `role="group"` and an `aria-label` ("Photos. Drag, or use the arrow keys, to move around."). Arrow keys move the field by `0.5u` per press, with `preventDefault` so the page doesn't scroll.

### 7. Depth and reduced motion
Depth is a lag, not a speed difference. Each column eases toward the drag position with its own time constant (0–90ms, `catchUp(dt, lag) = 1 − e^(−dt/lag)`). While moving, columns spread slightly. When the drag stops they settle back into the exact layout, so the arrangement never drifts out of shape however much it is dragged. The first version gave each photo a different speed, which slowly scrambled the layout over long drags.

With `prefersReducedMotion()` from `video-scrub.js`, drag still works 1:1 (it is motion the visitor makes directly), but there's no lag and no glide after release.

### 8. Configuration and placeholders
`config.photoField` is an explicit array of image paths (`./img/photo-field/01.jpg` … `20.jpg`). GitHub Pages can't list a folder, so the list lives in config. An empty or missing list leaves the section `hidden`, which is also its initial state in the markup until `photo-field.js` mounts. Without JS there is no blank 75% band. The section is unhidden as soon as `photo-field.js` starts, so it takes its space immediately and nothing below it jumps. A photo that fails to load is left out of the layout entirely, so it leaves no hole.

Placeholders come from a new `scripts/gen-photo-field-placeholders.mjs`. It's a dependency-free Node script that calls ffmpeg (path from the `FFMPEG` environment variable, defaulting to `ffmpeg`). It writes 20 JPGs in Warm Muted palette gradients with a large centred number (`01`–`20`, using `drawtext` and a Windows system font), in a fixed mix of shapes: 8 portrait (4:5), 6 landscape (3:2) and 6 square. Each is about 800px on its long side and under about 40 KB. If this ffmpeg build lacks `drawtext`, the script writes the gradients without numbers and says so.

### 9. Files
- `site/js/photo-field.js`: pure helpers (`mulberry32`, `columnCount`, `layoutField`, `photoUnit`, `copiesNeeded`, `wrap`, `instancePosition`, `catchUp`) plus `initPhotoField({ photos, section, win })`, which returns `{ active, destroy }` like `initSwipe`.
- `site/index.html`: `<section class="photo-field-shell" id="photo-field" hidden>` after `#swipe-video`, before `#gallery-slot`.
- `site/css/base.css`: full-bleed shell (`width:100vw; margin-left:calc(50% - 50vw)`), `background: var(--bg)`, `overflow: hidden`, height rules, the `.photo-field-active` interaction rules, and focus outline.
- `site/js/main.js`: `initPhotoField({ photos: config.photoField })`.

## Risks / Trade-offs

- [A guest whose screen is filled by the section can't scroll by swiping on it] → The 75svh height always leaves page visible above or below when centred. If it's mid-transition, a guest can also swipe on the swipe-video section or the info section. Rae can lower the height constant if testing shows it still feels trapping.
- [80 images on large desktops] → All copies reuse the same 20 cached files. Transforms are GPU-composited, and the loop only runs while moving. If it stutters on an older laptop, `copiesNeeded` can be capped and `DENSITY` raised (bigger photos, fewer copies).
- [Very large original photos uploaded by Rae (5 MB phone shots)] → The README tells Rae to resize to about 1200px on the long side and JPEG-compress before dropping them in. `loading="lazy"` and `decoding="async"` keep them off the first paint.
- [Columns briefly spread apart while dragging] → The lag is at most 90ms, so at normal drag speeds the spread is a few dozen px, and the columns settle back together as soon as the drag stops.
- [Photos are fetched once the section is near, before it is shown] → Only when it is within about a screen of the viewport. The 20 placeholders total about 330 KB, and real photos should be resized first (see the README).
- [Phone OS edge-back gesture] → As with section 3, a drag that starts within about 20px of the screen edge may be taken as "back". Accepted.
- [Placeholder script depends on ffmpeg drawtext] → Falls back to unnumbered gradients. These are placeholders only.

## Migration Plan

This only adds a section. Rollback is removing the section markup (or emptying `config.photoField`, which leaves it hidden). Deployment is the usual push to `main` (GitHub Pages workflow).
