import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeProgress, wheelPixels, releaseVelocity, decayVelocity, initSwipe } from '../site/js/swipe.js';

// 400px-wide section, 2.25 widths per clip → 900px of swiping covers the whole video.
const W = 400;

test('a left swipe (negative dx) advances in proportion to distance', () => {
  assert.equal(swipeProgress(0, -450, W), 0.5);
  assert.equal(swipeProgress(0, -900, W), 1);
  assert.equal(swipeProgress(0.25, -90, W), 0.35);
});

test('a right swipe rewinds, and the same distance back returns to the same frame', () => {
  assert.equal(swipeProgress(0.5, 450, W), 0);
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

test('release speed comes from the last moment of the swipe, with its direction', () => {
  const left = [{ t: 0, x: 300 }, { t: 50, x: 250 }, { t: 100, x: 200 }];
  assert.equal(releaseVelocity(left, 100), -1); // 100px left in 100ms
  const right = [{ t: 0, x: 0 }, { t: 40, x: 20 }];
  assert.equal(releaseVelocity(right, 40), 0.5);
  // only the last 100ms counts: an early fast part followed by a slow finish is slow
  const slowFinish = [{ t: 0, x: 0 }, { t: 100, x: -400 }, { t: 200, x: -410 }];
  assert.equal(releaseVelocity(slowFinish, 200), -0.1);
});

test('no fling when the finger stopped before lifting, or with too few samples', () => {
  assert.equal(releaseVelocity([{ t: 0, x: 0 }, { t: 50, x: -100 }], 400), 0); // held still for 350ms
  assert.equal(releaseVelocity([{ t: 0, x: 0 }], 0), 0);
  assert.equal(releaseVelocity([], 0), 0);
  assert.equal(releaseVelocity([{ t: 10, x: 0 }, { t: 10, x: -50 }], 10), 0); // same timestamp
});

test('a very fast flick is capped so it cannot throw the whole clip', () => {
  assert.equal(releaseVelocity([{ t: 0, x: 1000 }, { t: 10, x: 0 }], 10), -3);
});

test('momentum slows down smoothly and the same in any frame rate', () => {
  assert.ok(decayVelocity(-1, 16) > -1 && decayVelocity(-1, 16) < 0);
  // two 16ms frames slow it down exactly as much as one 32ms frame
  assert.ok(Math.abs(decayVelocity(decayVelocity(1, 16), 16) - decayVelocity(1, 32)) < 1e-12);
  assert.ok(decayVelocity(1, 2000) < 0.001); // gone after a couple of seconds
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
