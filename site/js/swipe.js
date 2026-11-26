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
const SWIPE_WIDTHS_PER_CLIP = 2.25;
// How far one Left/Right arrow key press moves through the clip.
const KEY_STEP = 0.1;
// Momentum after a swipe is let go: the speed decays with this time constant (ms),
// so a fling coasts about speed × MOMENTUM_MS pixels further. Larger = longer coast.
const MOMENTUM_MS = 250;
// Only the finger's movement in the last moment before release counts toward its speed.
const VELOCITY_WINDOW_MS = 100;
const MAX_FLING = 3; // px/ms
const MIN_SPEED = 0.02; // px/ms; slower than this and the coast stops

/** Progress 0..1 after moving `dx` pixels from `start` (negative dx = swipe left = forward). */
export function swipeProgress(start, dx, width) {
  const from = Math.min(1, Math.max(0, Number.isFinite(start) ? start : 0));
  if (!(width > 0) || !Number.isFinite(dx)) return from;
  return Math.min(1, Math.max(0, from - dx / (width * SWIPE_WIDTHS_PER_CLIP)));
}

/**
 * Release speed in px/ms (negative = moving left) from recent {t, x} pointer samples.
 * 0 if the finger had stopped (no movement in the last VELOCITY_WINDOW_MS).
 */
export function releaseVelocity(samples, now) {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  if (!(dt > 0)) return 0;
  return Math.min(MAX_FLING, Math.max(-MAX_FLING, (last.x - first.x) / dt));
}

/** Speed after coasting for dt ms (exponential slow-down). */
export function decayVelocity(v, dt) {
  return v * Math.exp(-dt / MOMENTUM_MS);
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
  let drag = null; // { id, x, start, samples } while a finger/mouse is down
  let coastRaf = 0;
  let coastV = 0;
  let coastT = 0;

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

  // After a fling: keep moving at the release speed, slowing down, until it stops or hits an end.
  const stopCoast = () => {
    if (coastRaf) win.cancelAnimationFrame(coastRaf);
    coastRaf = 0;
  };
  const coast = (t) => {
    coastRaf = 0;
    const dt = Math.min(64, t - coastT); // don't jump after a dropped/backgrounded frame
    coastT = t;
    const next = swipeProgress(p, coastV * dt, section.clientWidth);
    coastV = decayVelocity(coastV, dt);
    moveTo(next);
    if (Math.abs(coastV) >= MIN_SPEED && next > 0 && next < 1) coastRaf = win.requestAnimationFrame(coast);
  };
  const startCoast = (v) => {
    stopCoast();
    if (Math.abs(v) < MIN_SPEED) return;
    coastV = v;
    coastT = win.performance?.now?.() ?? Date.now();
    coastRaf = win.requestAnimationFrame(coast);
  };

  const onPointerDown = (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopCoast(); // touching the video catches it
    drag = { id: e.pointerId, x: e.clientX, start: p, samples: [{ t: e.timeStamp, x: e.clientX }] };
    // Mouse drags keep tracking outside the section; touch stays free for the browser's own scrolling.
    if (e.pointerType === 'mouse') {
      section.setPointerCapture?.(e.pointerId);
      section.classList.add('dragging');
      e.preventDefault();
    }
  };
  const onPointerMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.samples.push({ t: e.timeStamp, x: e.clientX });
    if (drag.samples.length > 20) drag.samples.shift();
    moveTo(swipeProgress(drag.start, e.clientX - drag.x, section.clientWidth));
  };
  const onPointerEnd = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // Lifting the finger flings; a cancel (the browser took the gesture as a page scroll) doesn't.
    const v = e.type === 'pointerup' ? releaseVelocity(drag.samples, e.timeStamp) : 0;
    drag = null;
    section.classList.remove('dragging');
    startCoast(v);
  };
  const onWheel = (e) => {
    // Only mostly-sideways wheel/trackpad gestures scrub; vertical ones scroll the page.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault(); // stops the trackpad back/forward history swipe
    stopCoast(); // trackpads send their own momentum
    moveTo(swipeProgress(p, -wheelPixels(e.deltaX, e.deltaMode, section.clientWidth), section.clientWidth));
  };
  const onKey = (e) => {
    const step = e.key === 'ArrowRight' ? KEY_STEP : e.key === 'ArrowLeft' ? -KEY_STEP : 0;
    if (!step) return;
    e.preventDefault();
    stopCoast();
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
    stopCoast();
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
