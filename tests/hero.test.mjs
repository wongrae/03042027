import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrollProgress, canScrub, initHero } from '../site/js/hero.js';

test('progress is 0 at the top of the hero and 1 once the pinned stage has been scrolled through', () => {
  // track 2250px tall, stage 900px → 1350px of scrubbing
  assert.equal(scrollProgress(0, 2250, 900), 0);
  assert.equal(scrollProgress(-675, 2250, 900), 0.5);
  assert.equal(scrollProgress(-1350, 2250, 900), 1);
});

test('progress is proportional to scroll position in both directions', () => {
  const at = (scrollY) => scrollProgress(-scrollY, 2250, 900);
  const down = [0, 270, 540, 810, 1080, 1350].map(at);
  assert.deepEqual(down.map((p) => Math.round(p * 100)), [0, 20, 40, 60, 80, 100]);
  const up = [1350, 1080, 810, 540, 270, 0].map(at);
  assert.deepEqual(up, [...down].reverse()); // reversible: same value at the same position
});

test('progress is clamped before and after the hero', () => {
  assert.equal(scrollProgress(300, 2250, 900), 0); // hero still below the viewport top
  assert.equal(scrollProgress(-5000, 2250, 900), 1); // scrolled well past
});

test('a track no taller than its stage cannot scrub (no divide by zero)', () => {
  assert.equal(scrollProgress(-100, 900, 900), 0);
  assert.equal(scrollProgress(-100, 500, 900), 0);
  assert.equal(scrollProgress(-100, NaN, 900), 0);
});

const fakeWin = ({ reduce = false, clip = true } = {}) => ({
  matchMedia: (q) => ({ matches: reduce && q.includes('prefers-reduced-motion') }),
  CSS: { supports: (prop, value) => clip && prop === 'overflow-x' && value === 'clip' },
});

test('scrubbing is allowed only without reduced-motion and with sticky-friendly overflow support', () => {
  assert.equal(canScrub(fakeWin()), true);
  assert.equal(canScrub(fakeWin({ reduce: true })), false);
  assert.equal(canScrub(fakeWin({ clip: false })), false);
  assert.equal(canScrub(undefined), false);
  assert.equal(canScrub({}), false);
});

test('without a video, or when scrubbing is not allowed, the hero is left untouched', () => {
  let touched = false;
  const hero = new Proxy({}, { get() { touched = true; return () => {}; } });
  for (const opts of [
    { src: null, hero, win: fakeWin() },
    { src: '', hero, win: fakeWin() },
    { src: './img/hero.mp4', hero, win: fakeWin({ reduce: true }) },
    { src: './img/hero.mp4', hero, win: fakeWin({ clip: false }) },
    { src: './img/hero.mp4', hero: null, win: fakeWin() },
  ]) {
    const h = initHero(opts);
    assert.equal(h.active, false);
    assert.equal(h.progress(), 0);
    h.destroy(); // safe to call
  }
  assert.equal(touched, false, 'inactive hero must not be modified');
});
