// Swipe-scrubbed video (the section below the info text): swiping left advances
// the video and swiping right rewinds it, while vertical swipes and wheel
// scrolling over it still scroll the page. The section isn't pinned. Does nothing,
// leaving the still image, when no video is configured, the visitor asked for
// reduced motion, or the video fails to load.
//
// Touch: CSS `touch-action: pan-y` lets the browser keep vertical pans (page
// scroll) and hands horizontal movement to the pointer events below; if the
// browser takes a gesture as a scroll it sends `pointercancel` and we stop.
import { createScrubVideo, prefersReducedMotion } from './video-scrub.js';

// How many full section-widths of swiping cover the whole clip.
const SWIPE_WIDTHS_PER_CLIP = 3;
// How far one Left/Right arrow key press moves through the clip.
const KEY_STEP = 0.1;

/** Progress 0..1 after moving `dx` pixels from `start` (negative dx = swipe left = forward). */
export function swipeProgress(start, dx, width) {
  const from = Math.min(1, Math.max(0, Number.isFinite(start) ? start : 0));
  if (!(width > 0) || !Number.isFinite(dx)) return from;
  return Math.min(1, Math.max(0, from - dx / (width * SWIPE_WIDTHS_PER_CLIP)));
}

/** Wheel delta in pixels (some browsers report lines or pages). */
export function wheelPixels(delta, deltaMode, pageWidth) {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageWidth;
  return delta;
}

/**
 * @param {{ src: string|null, section?: HTMLElement|null, win?: Window }} options
 * @returns {{ active: boolean, progress: () => number, destroy: () => void }}
 */
export function initSwipe({ src, section = document.getElementById('swipe-video'), win = window } = {}) {
  const inactive = { active: false, progress: () => 0, destroy() {} };
  if (!src || !section || prefersReducedMotion(win)) return inactive;

  const stillImg = section.querySelector('#swipe-still');
  let p = 0;
  let drag = null; // { id, x, start } while a finger/mouse is down

  const scrub = createScrubVideo({
    src,
    poster: stillImg?.getAttribute('src'),
    win,
    progress: () => p,
    onFail: () => destroy(), // fall back to the static still
  });
  (stillImg ? stillImg.after.bind(stillImg) : section.prepend.bind(section))(scrub.video);

  section.classList.add('swipe-active');
  section.tabIndex = 0;
  section.setAttribute('role', 'group');
  section.setAttribute('aria-label', 'Video. Swipe left or right, or use the arrow keys, to move through it.');

  const moveTo = (next) => {
    if (next === p) return;
    p = next;
    scrub.schedule();
  };

  const onPointerDown = (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, x: e.clientX, start: p };
    // Mouse drags keep tracking outside the section; touch stays free for the browser's own scrolling.
    if (e.pointerType === 'mouse') {
      section.setPointerCapture?.(e.pointerId);
      section.classList.add('dragging');
      e.preventDefault();
    }
  };
  const onPointerMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    moveTo(swipeProgress(drag.start, e.clientX - drag.x, section.clientWidth));
  };
  const onPointerEnd = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    section.classList.remove('dragging');
  };
  const onWheel = (e) => {
    // Only mostly-sideways wheel/trackpad gestures scrub; vertical ones scroll the page.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault(); // stops the trackpad back/forward history swipe
    moveTo(swipeProgress(p, -wheelPixels(e.deltaX, e.deltaMode, section.clientWidth), section.clientWidth));
  };
  const onKey = (e) => {
    const step = e.key === 'ArrowRight' ? KEY_STEP : e.key === 'ArrowLeft' ? -KEY_STEP : 0;
    if (!step) return;
    e.preventDefault();
    moveTo(Math.min(1, Math.max(0, p + step)));
  };

  section.addEventListener('pointerdown', onPointerDown);
  section.addEventListener('pointermove', onPointerMove);
  section.addEventListener('pointerup', onPointerEnd);
  section.addEventListener('pointercancel', onPointerEnd);
  section.addEventListener('lostpointercapture', onPointerEnd);
  section.addEventListener('wheel', onWheel, { passive: false });
  section.addEventListener('keydown', onKey);
  win.addEventListener('resize', scrub.schedule);
  scrub.schedule();

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    scrub.destroy();
    section.removeEventListener('pointerdown', onPointerDown);
    section.removeEventListener('pointermove', onPointerMove);
    section.removeEventListener('pointerup', onPointerEnd);
    section.removeEventListener('pointercancel', onPointerEnd);
    section.removeEventListener('lostpointercapture', onPointerEnd);
    section.removeEventListener('wheel', onWheel);
    section.removeEventListener('keydown', onKey);
    win.removeEventListener('resize', scrub.schedule);
    section.classList.remove('swipe-active', 'dragging');
    section.removeAttribute('tabindex');
    section.removeAttribute('role');
    section.removeAttribute('aria-label');
  }

  return { active: true, progress: () => p, destroy };
}
