# Proposal

## Why

Rae wants a playful photo moment on the landing page, like the drag-around photo field on afterduskmedia.com (its narrow-screen and phone version). Guests grab the page and push a scattered wall of photos around in any direction, and the photos never run out. The page already has scroll and swipe videos. This adds a hands-on photo section to go with them.

## What Changes

- **New section 4: a drag-around photo field**, directly below the swipe video section and shown in all three phases (in Phase 3 the gallery teaser follows it).
  - About 20 photos are scattered loosely at different sizes on the site's paper background (`--bg`). There is no frame, caption, heading or wordmark. Each photo is shown as it is, in its own proportions, so Rae can upload photos that already have a Polaroid look if wanted.
  - Dragging with a finger or mouse moves the whole field in any direction. The layout repeats in both directions, so it never runs out.
  - After a flick the field keeps gliding and slows to a stop. Photos move at slightly different speeds (a subtle depth effect).
  - Works on every screen size. Photos scale to the screen so a phone shows roughly as many as a desktop.
  - The section is about 75% of the screen tall, so guests can always scroll the page by swiping on the page above or below it.
- **Placeholder photos:** 20 generated, numbered placeholder images in a new folder `site/img/photo-field/` (`01.jpg` … `20.jpg`), in a mix of portrait, landscape and square shapes. To replace one, Rae drops in a real photo with the same file name. The list lives in `site/js/config.js`, so adding or removing photos is a one-line edit.

## Capabilities

### New Capabilities
- `photo-field`: the drag-around photo section. Covers its placement, the endless repeating layout, the inputs (touch, mouse, trackpad, keyboard), momentum and depth, how it sits alongside page scrolling, reduced motion, and how the photos are supplied.

### Modified Capabilities
- `swipe-video`: the placement requirement currently says the gallery teaser renders directly below the swipe video in Phase 3. The photo field now sits between them.

## Impact

- **Code:** `site/index.html`, `site/css/base.css`, `site/js/main.js` and `site/js/config.js` change. New files are `site/js/photo-field.js` and `tests/photo-field.test.mjs`.
- **Media:** a new `site/img/photo-field/` folder with 20 placeholder JPGs, plus the script that generates them.
- **Docs:** a README section on swapping in real photos.
- **Out of scope:** the desktop mouse-follow effect from the reference site, Polaroid frames, a wordmark or text overlay, tapping a photo to open it, drifting on its own when nobody is touching it, and loading photos from a server or folder listing (GitHub Pages can't list a folder, so the photos are listed in config).
