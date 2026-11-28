import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, layoutField, photoUnit, copiesNeeded, wrap, instancePosition,
  releaseVelocity2D, keyStep, initPhotoField, U_MIN, U_MAX,
} from '../site/js/photo-field.js';

// ---------- pure helpers ----------

test('the same seed always gives the same layout, a different seed a different one', () => {
  assert.deepEqual(layoutField(20, 42), layoutField(20, 42));
  assert.notDeepEqual(layoutField(20, 42).items, layoutField(20, 43).items);
  const r = mulberry32(1);
  for (let i = 0; i < 100; i++) {
    const n = r();
    assert.ok(n >= 0 && n < 1);
  }
});

test('20 photos make a 5 × 4 grid, one photo per cell, with sizes and depths in range', () => {
  const l = layoutField(20);
  assert.equal(l.cols, 5);
  assert.equal(l.rows, 4);
  assert.equal(l.items.length, 20);
  const cell = l.tileW / l.cols;
  const cells = new Set(l.items.map((it) => `${Math.floor(it.x / cell)},${Math.floor(it.y / cell)}`));
  assert.equal(cells.size, 20); // jitter never pushes a photo out of its own cell
  for (const it of l.items) {
    assert.ok(it.x > 0 && it.x < l.tileW && it.y > 0 && it.y < l.tileH);
    assert.ok(it.w >= 0.7 && it.w <= 1.25);
    assert.ok(it.depth >= 0.9 && it.depth <= 1.1);
  }
});

test('other photo counts still lay out (10 and 30), and zero or NaN gives an empty layout', () => {
  assert.equal(layoutField(10).items.length, 10);
  assert.equal(layoutField(30).items.length, 30);
  assert.ok(layoutField(30).cols * layoutField(30).rows >= 30);
  assert.equal(layoutField(0).items.length, 0);
  assert.equal(layoutField(NaN).items.length, 0);
});

test('photo size scales with the screen and is clamped at both ends', () => {
  assert.equal(photoUnit(375, 609), U_MIN); // phone: ~106 → clamped to 110
  const desktop = photoUnit(1920, 810);
  assert.ok(desktop > 270 && desktop < 285, `desktop u = ${desktop}`);
  assert.equal(photoUnit(5000, 4000), U_MAX);
  assert.equal(photoUnit(0, 600), U_MIN);
  assert.equal(photoUnit(NaN, NaN), U_MIN);
});

test('enough tile copies are made to cover the view plus a margin on both sides', () => {
  for (const [view, tile, margin] of [[375, 742, 137], [1920, 1870, 346], [810, 1496, 346], [300, 100, 50]]) {
    const n = copiesNeeded(view, tile, margin);
    assert.ok(n * tile >= view + 2 * margin, `${n} copies of ${tile} for ${view}+2×${margin}`);
    assert.ok((n - 1) * tile < view + 2 * margin); // and no more than needed
  }
  assert.equal(copiesNeeded(500, 0, 10), 1);
  assert.equal(copiesNeeded(NaN, 100, NaN), 1);
});

test('wrap handles negatives and bad input', () => {
  assert.equal(wrap(5, 10), 5);
  assert.equal(wrap(15, 10), 5);
  assert.equal(wrap(-3, 10), 7);
  assert.equal(wrap(-30, 10), 0);
  assert.equal(wrap(5, 0), 0);
  assert.equal(wrap(NaN, 10), 0);
});

test('a photo copy moves 1:1 with the drag and re-enters exactly one period away, off-screen', () => {
  const tile = 800, copies = 2, margin = 150, view = 1200;
  const period = tile * copies;
  assert.ok(period >= view + 2 * margin);
  let prev = instancePosition(100, 0, tile, 0, 1, copies, margin);
  for (let off = -1; off >= -5000; off -= 1) {
    const pos = instancePosition(100, 0, tile, off, 1, copies, margin);
    const step = pos - prev;
    if (Math.abs(step + 1) > 1e-9) {
      // the only discontinuity: a jump of one whole period, from the left margin to the right
      assert.ok(Math.abs(step - (period - 1)) < 1e-9, `jump of ${step}`);
      assert.ok(prev < 0 - margin + 2 && pos > view, 'jump happens outside the view');
    }
    assert.ok(pos >= -margin && pos < period - margin);
    prev = pos;
  }
  // depth scales how far the drag moves it
  assert.equal(instancePosition(400, 0, tile, 100, 1.1, copies, margin) - instancePosition(400, 0, tile, 0, 1.1, copies, margin), 110);
});

test('release speed works on both axes, and is zero when the finger stopped', () => {
  const diag = [{ t: 0, x: 0, y: 0 }, { t: 50, x: -50, y: 25 }, { t: 100, x: -100, y: 50 }];
  assert.deepEqual(releaseVelocity2D(diag, 100), { x: -1, y: 0.5 });
  assert.deepEqual(releaseVelocity2D([{ t: 0, x: 0, y: 0 }, { t: 50, x: 80, y: 80 }], 500), { x: 0, y: 0 });
});

test('arrow keys move the field in the matching direction by half a photo unit', () => {
  assert.deepEqual(keyStep('ArrowLeft', 200), { x: -100, y: 0 });
  assert.deepEqual(keyStep('ArrowRight', 200), { x: 100, y: 0 });
  assert.deepEqual(keyStep('ArrowUp', 200), { x: 0, y: -100 });
  assert.deepEqual(keyStep('ArrowDown', 200), { x: 0, y: 100 });
  assert.equal(keyStep('Enter', 200), null);
});

// ---------- initPhotoField with a tiny fake DOM ----------

function fakeEl(tag) {
  const listeners = {};
  const attrs = {};
  const classes = new Set();
  const el = {
    tag, children: [], parent: null, style: {}, hidden: false,
    attrs, listeners,
    classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: (k) => { delete attrs[k]; if (k === 'tabindex') delete el.tabIndex; },
    addEventListener: (t, fn) => { (listeners[t] ||= new Set()).add(fn); },
    removeEventListener: (t, fn) => { listeners[t]?.delete(fn); },
    dispatch: (t, e = {}) => { for (const fn of listeners[t] || []) fn({ type: t, preventDefault() { e.prevented = true; }, ...e }); return e; },
    append: (...kids) => kids.forEach((k) => { k.parent = el; el.children.push(k); }),
    replaceChildren: () => { el.children = []; },
    remove: () => { if (el.parent) el.parent.children = el.parent.children.filter((k) => k !== el); },
    setPointerCapture() {},
  };
  return el;
}

function fakePage({ reduce = false, w = 400, h = 600 } = {}) {
  const doc = { createElement: fakeEl };
  const section = fakeEl('section');
  section.ownerDocument = doc;
  section.hidden = true;
  section.clientWidth = w;
  section.clientHeight = h;
  const frames = [];
  let clock = 0;
  const winListeners = {};
  const win = {
    matchMedia: (q) => ({ matches: reduce && q.includes('prefers-reduced-motion') }),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: (id) => { frames[id - 1] = null; },
    performance: { now: () => clock },
    addEventListener: (t, fn) => { (winListeners[t] ||= new Set()).add(fn); },
    removeEventListener: (t, fn) => { winListeners[t]?.delete(fn); },
  };
  // Run queued animation frames, 16ms apart, until none are left (or a cap is hit).
  const flush = (max = 1000) => {
    let n = 0;
    while (frames.some(Boolean) && n++ < max) {
      clock += 16;
      const batch = frames.splice(0);
      for (const fn of batch) fn?.(clock);
    }
    return n;
  };
  return { section, win, flush, winListeners, photos: () => section.children[0]?.children || [] };
}

const PHOTOS = Array.from({ length: 20 }, (_, i) => `./img/photo-field/${String(i + 1).padStart(2, '0')}.jpg`);
const xy = (img) => img.style.transform.match(/-?[\d.]+/g).slice(1, 3).map(Number); // skip the "3d" digit

test('an empty or missing photo list, or no section, leaves the section hidden and untouched', () => {
  for (const photos of [[], null, undefined, ['']]) {
    const page = fakePage();
    const r = initPhotoField({ photos, section: page.section, win: page.win });
    assert.equal(r.active, false);
    assert.equal(page.section.hidden, true);
    assert.equal(page.section.children.length, 0);
  }
  assert.equal(initPhotoField({ photos: PHOTOS, section: null, win: fakePage().win }).active, false);
});

test('it mounts the photos, unhides the section and labels it; destroy() undoes all of that', () => {
  const page = fakePage();
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  assert.equal(r.active, true);
  assert.equal(page.section.hidden, false);
  assert.equal(page.section.attrs.role, 'group');
  assert.match(page.section.attrs['aria-label'], /arrow keys/);
  assert.ok(page.photos().length >= 20 && page.photos().length % 20 === 0);
  // only the first copy is exposed to screen readers
  assert.equal(page.photos().filter((img) => img.attrs['aria-hidden'] !== 'true').length, 20);
  assert.ok(page.photos().every((img) => img.attrs.draggable === 'false' && img.alt === ''));

  r.destroy();
  assert.equal(page.section.hidden, true);
  assert.equal(page.section.children.length, 0);
  assert.equal(page.section.attrs.role, undefined);
  assert.equal(page.section.attrs['aria-label'], undefined);
  const left = Object.values(page.section.listeners).reduce((n, s) => n + s.size, 0);
  assert.equal(left, 0, 'all section listeners removed');
  assert.equal(page.winListeners.resize.size, 0);
});

test('a drag moves the photos with the pointer; a flick then glides further and stops', () => {
  const page = fakePage();
  initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  page.flush();
  // follow the right-most, lowest photo so neither the drag nor the glide wraps it around
  const img = page.photos().reduce((a, b) => (xy(b)[0] + xy(b)[1] > xy(a)[0] + xy(a)[1] ? b : a));
  const [x0, y0] = xy(img);
  page.section.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 300, timeStamp: 0 });
  for (let i = 1; i <= 5; i++) page.section.dispatch('pointermove', { pointerId: 1, clientX: 200 - i * 10, clientY: 300 - i * 6, timeStamp: i * 16 });
  page.flush();
  const [x1, y1] = xy(img);
  const depthMove = (x0 - x1) / 50;
  assert.ok(depthMove > 0.85 && depthMove < 1.15, 'moved left by about the drag distance');
  assert.ok(Math.abs((y0 - y1) / 30 - depthMove) < 0.01, 'and up, by the same depth factor'); // positions are rounded to 0.1px
  page.section.dispatch('pointerup', { pointerId: 1, clientX: 150, clientY: 270, timeStamp: 80 });
  const frames = page.flush();
  assert.ok(frames > 3 && frames < 1000, `glide ran for ${frames} frames and stopped`);
  const [x2] = xy(img);
  assert.ok(x2 < x1, 'kept moving left after release');
});

test('a second finger is ignored, and touching a gliding field stops it', () => {
  const page = fakePage();
  initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  page.flush();
  const s = page.section;
  s.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 300, timeStamp: 0 });
  s.dispatch('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 100, timeStamp: 1 });
  s.dispatch('pointermove', { pointerId: 2, clientX: 0, clientY: 0, timeStamp: 10 });
  page.flush();
  const img = page.photos()[0];
  const before = xy(img);
  for (let i = 1; i <= 5; i++) s.dispatch('pointermove', { pointerId: 1, clientX: 200 - i * 20, clientY: 300, timeStamp: i * 16 });
  s.dispatch('pointerup', { pointerId: 1, clientX: 100, clientY: 300, timeStamp: 80 });
  page.win.requestAnimationFrame(() => {}); // let one glide frame run, then catch it
  s.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 300, timeStamp: 100 });
  const frames = page.flush();
  assert.ok(frames <= 2, 'no glide after the field was caught');
  assert.ok(xy(img)[0] < before[0]);
});

test('reduced motion: drag still works, but every photo moves the same and nothing glides', () => {
  const page = fakePage({ reduce: true });
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  assert.equal(r.active, true);
  page.flush();
  const imgs = page.photos();
  const before = imgs.map(xy);
  page.section.dispatch('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 300, clientY: 300, timeStamp: 0 });
  for (let i = 1; i <= 5; i++) page.section.dispatch('pointermove', { pointerId: 1, clientX: 300 - i * 4, clientY: 300, timeStamp: i * 16 });
  page.flush();
  page.section.dispatch('pointerup', { pointerId: 1, clientX: 280, clientY: 300, timeStamp: 80 });
  assert.equal(page.flush(), 0, 'no glide frames');
  imgs.forEach((img, i) => assert.ok(Math.abs(before[i][0] - xy(img)[0] - 20) < 0.11, 'each photo moved exactly 20px'));
});

test('vertical wheel is left to the page; sideways wheel and arrow keys move the field', () => {
  const page = fakePage();
  initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  page.flush();
  const img = page.photos()[0];
  const start = xy(img);
  const vertical = page.section.dispatch('wheel', { deltaX: 0, deltaY: 100, deltaMode: 0 });
  assert.equal(vertical.prevented, undefined);
  page.flush();
  assert.deepEqual(xy(img), start);
  const sideways = page.section.dispatch('wheel', { deltaX: 40, deltaY: 5, deltaMode: 0 });
  assert.equal(sideways.prevented, true);
  page.flush();
  assert.ok(xy(img)[0] < start[0], 'swiping sideways moves the field left');
  const key = page.section.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(key.prevented, true);
  page.flush();
  assert.ok(xy(img)[1] > start[1], 'down arrow moves the field down');
  assert.equal(page.section.dispatch('keydown', { key: 'Tab' }).prevented, undefined);
});

test('a photo that fails to load is hidden in every copy', () => {
  const page = fakePage({ w: 1920, h: 810 });
  initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  const copies = page.photos().filter((img) => img.src === PHOTOS[6]);
  assert.ok(copies.length > 1);
  copies[0].dispatch('error');
  assert.ok(copies.every((img) => img.hidden));
  assert.ok(page.photos().filter((img) => img.hidden).length === copies.length);
});
