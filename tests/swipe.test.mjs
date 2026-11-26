import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeProgress, wheelPixels, initSwipe } from '../site/js/swipe.js';

// 400px-wide section, 3 widths per clip → 1200px of swiping covers the whole video.
const W = 400;

test('a left swipe (negative dx) advances in proportion to distance', () => {
  assert.equal(swipeProgress(0, -600, W), 0.5);
  assert.equal(swipeProgress(0, -1200, W), 1);
  assert.equal(swipeProgress(0.25, -120, W), 0.35);
});

test('a right swipe rewinds, and the same distance back returns to the same frame', () => {
  assert.equal(swipeProgress(0.5, 600, W), 0);
  const there = swipeProgress(0.2, -300, W);
  assert.equal(swipeProgress(there, 300, W), 0.2);
});

test('progress holds at the first and last frame (no looping)', () => {
  assert.equal(swipeProgress(0, 500, W), 0); // swiping right at the start
  assert.equal(swipeProgress(1, -500, W), 1); // swiping left at the end
  assert.equal(swipeProgress(0.9, -5000, W), 1);
});

test('a zero, missing or NaN width / distance is safe and leaves progress where it was', () => {
  assert.equal(swipeProgress(0.4, -100, 0), 0.4);
  assert.equal(swipeProgress(0.4, -100, NaN), 0.4);
  assert.equal(swipeProgress(0.4, NaN, W), 0.4);
  assert.equal(swipeProgress(NaN, -100, NaN), 0);
  assert.equal(swipeProgress(7, 0, W), 1); // out-of-range start is clamped
});

test('wheel deltas in lines or pages are converted to pixels', () => {
  assert.equal(wheelPixels(30, 0, W), 30);
  assert.equal(wheelPixels(3, 1, W), 48);
  assert.equal(wheelPixels(1, 2, W), W);
});

const fakeWin = ({ reduce = false } = {}) => ({
  matchMedia: (q) => ({ matches: reduce && q.includes('prefers-reduced-motion') }),
});

test('without a video, without the section, or with reduced motion, the section is left untouched', () => {
  let touched = false;
  const section = new Proxy({}, { get() { touched = true; return () => {}; } });
  for (const opts of [
    { src: null, section, win: fakeWin() },
    { src: '', section, win: fakeWin() },
    { src: './video/swipe.mp4', section, win: fakeWin({ reduce: true }) },
    { src: './video/swipe.mp4', section: null, win: fakeWin() },
  ]) {
    const s = initSwipe(opts);
    assert.equal(s.active, false);
    assert.equal(s.progress(), 0);
    s.destroy(); // safe to call
  }
  assert.equal(touched, false, 'inactive section must not be modified');
});
