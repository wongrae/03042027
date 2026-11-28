import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, layoutField, columnCount, photoUnit, copiesNeeded, wrap, instancePosition,
  releaseVelocity2D, keyStep, catchUp, initPhotoField, U_MIN, U_MAX, COPY_SHIFT,
} from '../site/js/photo-field.js';

// The placeholder mix: portrait 4:5, landscape 3:2, square.
const SHAPES = 'plspslpplspslplspslp'.split('').map((c) => ({ p: 1.25, l: 2 / 3, s: 1 })[c]);

// ---------- layout ----------

test('the same seed and shapes always give the same layout, a different seed a different one', () => {
  assert.deepEqual(layoutField(SHAPES, 42), layoutField(SHAPES, 42));
  assert.notDeepEqual(layoutField(SHAPES, 42).items, layoutField(SHAPES, 43).items);
  const r = mulberry32(1);
  for (let i = 0; i < 100; i++) {
    const n = r();
    assert.ok(n >= 0 && n < 1);
  }
});

test('20 photos go into 3 balanced columns, keeping each photo\'s own shape', () => {
  const l = layoutField(SHAPES);
  assert.equal(l.cols, 3);
  assert.equal(l.items.length, 20);
  const perCol = l.columns.map((_, c) => l.items.filter((it) => it.col === c).length);
  assert.ok(perCol.every((n) => n >= 6 && n <= 8), `photos per column: ${perCol}`);
  l.items.forEach((it) => {
    assert.ok(Math.abs(it.h / it.w - SHAPES[it.index]) < 1e-9, 'shape kept');
    assert.ok(it.w >= 0.65 && it.w <= 1.1);
    assert.ok(Math.abs(it.x - (it.col + 0.5)) <= 0.1 + 1e-9, 'stays near its column');
  });
  assert.deepEqual(l.items.map((it) => it.z).sort((a, b) => a - b), l.items.map((_, i) => i + 1)); // unique stacking order
});

test('photos in a column stack top to bottom with only a small overlap or gap', () => {
  const l = layoutField(SHAPES);
  for (let c = 0; c < l.cols; c++) {
    const col = l.items.filter((it) => it.col === c).sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++) {
      const gap = (col[i].y - col[i].h / 2) - (col[i - 1].y + col[i - 1].h / 2);
      assert.ok(gap >= -0.1 - 1e-9 && gap <= 0.06 + 1e-9, `gap ${gap}`);
    }
    // the repeat seam is a normal join too: first photo's top, one period later, vs last photo's bottom
    const first = col[0], last = col[col.length - 1];
    const seam = (first.y - first.h / 2 + l.columns[c].height) - (last.y + last.h / 2);
    assert.ok(seam >= -0.1 - 1e-9 && seam <= 0.06 + 1e-9, `seam ${seam}`);
  }
});

// Samples the repeating layout on a grid: how much area is covered, and how much of each photo is visible.
function coverage(l) {
  const W = l.tileW, H = 5, step = 0.04, rects = [];
  for (const it of l.items) {
    const ph = l.columns[it.col].height;
    for (let cx = -1; cx <= 1; cx++) {
      for (let k = -2; k <= Math.ceil(H / ph) + 2; k++) {
        const y = it.y + k * ph + cx * COPY_SHIFT * ph; // sideways repeats are shifted down, as on the page
        rects.push({ key: `${it.index}:${cx}:${k}`, z: it.z, x0: it.x + cx * W - it.w / 2, x1: it.x + cx * W + it.w / 2, y0: y - it.h / 2, y1: y + it.h / 2 });
      }
    }
  }
  let covered = 0, total = 0;
  const area = {}, vis = {};
  for (let x = 0; x < W; x += step) {
    for (let y = 0; y < H; y += step) {
      total++;
      let top = null;
      for (const r of rects) {
        if (x < r.x0 || x >= r.x1 || y < r.y0 || y >= r.y1) continue;
        area[r.key] = (area[r.key] || 0) + 1;
        if (!top || r.z > top.z) top = r;
      }
      if (top) { covered++; vis[top.key] = (vis[top.key] || 0) + 1; }
    }
  }
  const inside = rects.filter((r) => r.x0 >= 0 && r.x1 <= W && r.y0 >= 0 && r.y1 <= H);
  return { covered: covered / total, minVisible: Math.min(...inside.map((r) => (vis[r.key] || 0) / area[r.key])) };
}

test('the field is densely filled, and overlapped photos stay mostly visible', () => {
  for (const seed of [20270403, 1, 2, 3, 4]) {
    const { covered, minVisible } = coverage(layoutField(SHAPES, seed));
    assert.ok(covered > 0.8 && covered < 0.97, `seed ${seed}: ${Math.round(covered * 100)}% covered`);
    assert.ok(minVisible >= 0.6, `seed ${seed}: a photo is only ${Math.round(minVisible * 100)}% visible`);
  }
});

test('other photo counts still lay out (10 and 30), and an empty list gives an empty layout', () => {
  for (const n of [1, 2, 10, 30]) {
    const l = layoutField(Array.from({ length: n }, (_, i) => SHAPES[i % 20]));
    assert.equal(l.items.length, n);
    assert.ok(l.columns.every((c) => c.height > 0));
  }
  assert.equal(columnCount(10), 2);
  assert.equal(columnCount(20), 3);
  assert.equal(columnCount(30), 4);
  assert.equal(columnCount(3), 2);
  assert.equal(layoutField([]).items.length, 0);
  assert.equal(layoutField(null).items.length, 0);
  // a bad shape falls back to a default instead of breaking the layout
  assert.ok(layoutField([NaN, 0, 1]).items.every((it) => it.h > 0));
});

// ---------- sizing and wrapping ----------

test('column width scales with the screen and is clamped at both ends', () => {
  assert.equal(photoUnit(375, 500), U_MIN); // phone: ~131 → 150, so about 2½ columns show
  const ref = photoUnit(400, 800);
  assert.ok(ref > 165 && ref < 180, `400×800 column = ${ref}`); // afterdusk's ~170px photos
  assert.equal(photoUnit(1920, 810), U_MAX);
  assert.equal(photoUnit(0, 600), U_MIN);
  assert.equal(photoUnit(NaN, NaN), U_MIN);
});

test('enough copies are made to cover the view plus a margin on both sides', () => {
  for (const [view, span, margin] of [[375, 750, 120], [1920, 1500, 200], [500, 600, 150], [300, 100, 50]]) {
    const n = copiesNeeded(view, span, margin);
    assert.ok(n * span >= view + 2 * margin);
    assert.ok((n - 1) * span < view + 2 * margin); // and no more than needed
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
  const span = 800, copies = 2, margin = 150, view = 1200;
  const period = span * copies;
  let prev = instancePosition(100, 0, span, 0, copies, margin);
  for (let off = -1; off >= -5000; off -= 1) {
    const pos = instancePosition(100, 0, span, off, copies, margin);
    const step = pos - prev;
    if (Math.abs(step + 1) > 1e-9) {
      assert.ok(Math.abs(step - (period - 1)) < 1e-9, `jump of ${step}`);
      assert.ok(prev < -margin + 2 && pos > view, 'jump happens outside the view');
    }
    assert.ok(pos >= -margin && pos < period - margin);
    prev = pos;
  }
});

test('every column repeats with no visible jump at phone, tablet and desktop sizes', () => {
  const l = layoutField(SHAPES);
  for (const [W, H] of [[375, 500], [412, 686], [667, 281], [1541, 708], [2560, 1080]]) {
    const u = photoUnit(W, H);
    const mx = (1.1 / 2 + 0.1 + 0.5) * u; // same margins as the page
    const my = (Math.max(...l.items.map((it) => it.h)) / 2 + 0.5) * u;
    const cx = copiesNeeded(W, l.tileW * u, mx);
    let prev = null, minVisible = Infinity, jumps = 0;
    for (let s = 0; s <= 1500; s++) {
      const ox = -s * 40, oy = s * 27; // fast: ~60,000px left and ~40,000px down, 40px per frame
      const cur = [];
      for (const it of l.items) {
        const ph = l.columns[it.col].height * u;
        const cy = copiesNeeded(H, ph, my);
        for (let a = 0; a < cx; a++) {
          for (let b = 0; b < cy; b++) {
            const x = instancePosition(it.x * u, a, l.tileW * u, ox, cx, mx);
            const y = instancePosition(it.y * u + a * COPY_SHIFT * ph, b, ph, oy, cy, my);
            const hw = (it.w * u) / 2, hh = (it.h * u) / 2;
            cur.push({ x, y, vis: x + hw > 0 && x - hw < W && y + hh > 0 && y - hh < H });
          }
        }
      }
      if (prev) cur.forEach((p, k) => { if ((p.vis || prev[k].vis) && (Math.abs(p.x - prev[k].x) > 60 || Math.abs(p.y - prev[k].y) > 60)) jumps++; });
      minVisible = Math.min(minVisible, cur.filter((p) => p.vis).length);
      prev = cur;
    }
    assert.equal(jumps, 0, `${W}×${H}: a photo jumped while on screen`);
    assert.ok(minVisible >= 4, `${W}×${H}: only ${minVisible} photos on screen at one point`);
  }
});

// ---------- motion helpers ----------

test('release speed works on both axes, and is zero when the finger stopped', () => {
  const diag = [{ t: 0, x: 0, y: 0 }, { t: 50, x: -50, y: 25 }, { t: 100, x: -100, y: 50 }];
  assert.deepEqual(releaseVelocity2D(diag, 100), { x: -1, y: 0.5 });
  assert.deepEqual(releaseVelocity2D([{ t: 0, x: 0, y: 0 }, { t: 50, x: 80, y: 80 }], 500), { x: 0, y: 0 });
});

test('arrow keys move the field in the matching direction by half a column', () => {
  assert.deepEqual(keyStep('ArrowLeft', 200), { x: -100, y: 0 });
  assert.deepEqual(keyStep('ArrowRight', 200), { x: 100, y: 0 });
  assert.deepEqual(keyStep('ArrowUp', 200), { x: 0, y: -100 });
  assert.deepEqual(keyStep('ArrowDown', 200), { x: 0, y: 100 });
  assert.equal(keyStep('Enter', 200), null);
});

test('trailing columns catch up smoothly, and with no lag immediately', () => {
  assert.equal(catchUp(16, 0), 1);
  const k = catchUp(16, 80);
  assert.ok(k > 0 && k < 1);
  // two 16ms frames catch up exactly as much as one 32ms frame
  assert.ok(Math.abs((1 - (1 - k) * (1 - k)) - catchUp(32, 80)) < 1e-12);
  assert.ok(catchUp(1000, 80) > 0.999);
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

// Fake Image: "loads" asynchronously with the size for its file name; names containing "missing" fail.
const sizeFor = (src) => {
  const n = Number(src.match(/(\d+)\.jpg/)?.[1] || 1);
  return [[640, 800], [800, 534], [720, 720]][n % 3];
};
class FakeImage {
  set src(v) {
    queueMicrotask(() => {
      if (v.includes('missing')) return this.onerror?.();
      [this.naturalWidth, this.naturalHeight] = sizeFor(v);
      this.onload?.();
    });
  }
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
    Image: FakeImage,
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

test('it mounts the photos at their own shapes, unhides and labels the section; destroy() undoes it', async () => {
  const page = fakePage();
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  assert.equal(r.active, true);
  assert.equal(page.section.hidden, false); // takes its space straight away
  await r.ready;
  assert.equal(page.section.attrs.role, 'group');
  assert.match(page.section.attrs['aria-label'], /arrow keys/);
  const imgs = page.photos();
  assert.ok(imgs.length >= 20);
  assert.equal(new Set(imgs.map((i) => i.src)).size, 20);
  // only one copy of each photo is exposed to screen readers
  assert.equal(imgs.filter((img) => img.attrs['aria-hidden'] !== 'true').length, 20);
  assert.ok(imgs.every((img) => img.attrs.draggable === 'false' && img.alt === '' && img.style.width && img.style.zIndex));

  r.destroy();
  assert.equal(page.section.hidden, true);
  assert.equal(page.section.children.length, 0);
  assert.equal(page.section.attrs.role, undefined);
  assert.equal(page.section.attrs['aria-label'], undefined);
  const left = Object.values(page.section.listeners).reduce((n, s) => n + s.size, 0);
  assert.equal(left, 0, 'all section listeners removed');
  assert.equal(page.winListeners.resize.size, 0);
});

test('a photo that fails to load is left out of the layout, leaving no hole', async () => {
  const page = fakePage();
  const photos = PHOTOS.map((p, i) => (i === 6 ? './img/photo-field/missing.jpg' : p));
  const r = initPhotoField({ photos, section: page.section, win: page.win });
  await r.ready;
  const srcs = new Set(page.photos().map((i) => i.src));
  assert.equal(srcs.size, 19);
  assert.ok(!srcs.has('./img/photo-field/missing.jpg'));
});

test('a drag moves the photos with the pointer; a flick then glides further and stops', async () => {
  const page = fakePage();
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  await r.ready;
  // follow the right-most, lowest photo so neither the drag nor the glide wraps it around
  const img = page.photos().reduce((a, b) => (xy(b)[0] + xy(b)[1] > xy(a)[0] + xy(a)[1] ? b : a));
  const [x0, y0] = xy(img);
  page.section.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 300, timeStamp: 0 });
  for (let i = 1; i <= 5; i++) page.section.dispatch('pointermove', { pointerId: 1, clientX: 200 - i * 10, clientY: 300 - i * 6, timeStamp: i * 16 });
  page.section.dispatch('pointermove', { pointerId: 1, clientX: 150, clientY: 270, timeStamp: 400 }); // finger rests: no fling
  page.flush();
  const [x1, y1] = xy(img);
  assert.ok(Math.abs(x0 - x1 - 50) < 0.2 && Math.abs(y0 - y1 - 30) < 0.2, 'settles exactly where the finger moved it');
  page.section.dispatch('pointerup', { pointerId: 1, clientX: 150, clientY: 270, timeStamp: 600 });
  assert.equal(page.flush(), 0, 'a drag that stopped before release does not glide');

  page.section.dispatch('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 300, timeStamp: 1000 });
  for (let i = 1; i <= 5; i++) page.section.dispatch('pointermove', { pointerId: 2, clientX: 200 - i * 10, clientY: 300, timeStamp: 1000 + i * 16 });
  page.section.dispatch('pointerup', { pointerId: 2, clientX: 150, clientY: 300, timeStamp: 1080 });
  const frames = page.flush();
  assert.ok(frames > 3 && frames < 1000, `glide ran for ${frames} frames and stopped`);
  assert.ok(xy(img)[0] < x1 - 50, 'kept moving left after release');
});

test('columns trail the drag by different amounts, then all settle back into the layout', async () => {
  const page = fakePage();
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  await r.ready;
  page.flush();
  const imgs = page.photos();
  const before = imgs.map(xy);
  page.section.dispatch('keydown', { key: 'ArrowLeft' }); // moves the field 75px left (half a 150px column)
  page.flush(1); // one frame in: columns have moved different fractions of the way
  const mid = new Set(imgs.map((img, i) => (before[i][0] - xy(img)[0]).toFixed(1)));
  assert.ok(mid.size > 1, 'columns moved by different amounts mid-motion');
  page.flush();
  imgs.forEach((img, i) => {
    const d = before[i][0] - xy(img)[0];
    // every photo ends exactly 75px left, unless that copy wrapped around to the other side
    assert.ok(Math.abs(d - 75) < 0.2 || Math.abs(d) > 300, `photo ${i} moved ${d}`);
  });
});

test('a second finger is ignored, and touching a gliding field stops it', async () => {
  const page = fakePage();
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  await r.ready;
  const s = page.section;
  s.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 300, timeStamp: 0 });
  s.dispatch('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 100, timeStamp: 1 });
  s.dispatch('pointermove', { pointerId: 2, clientX: 0, clientY: 0, timeStamp: 10 });
  assert.deepEqual(r.offset(), { x: 0, y: 0 }, 'second finger did nothing');
  for (let i = 1; i <= 5; i++) s.dispatch('pointermove', { pointerId: 1, clientX: 200 - i * 20, clientY: 300, timeStamp: i * 16 });
  s.dispatch('pointerup', { pointerId: 1, clientX: 100, clientY: 300, timeStamp: 80 });
  page.flush(2); // glide a couple of frames
  s.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 300, timeStamp: 120 });
  const caught = r.offset().x;
  page.flush();
  assert.equal(r.offset().x, caught, 'no more movement after the field was caught');
});

test('reduced motion: drag still works, but every photo moves the same and nothing glides', async () => {
  const page = fakePage({ reduce: true });
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  await r.ready;
  page.flush();
  const imgs = page.photos();
  const before = imgs.map(xy);
  page.section.dispatch('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 300, clientY: 300, timeStamp: 0 });
  for (let i = 1; i <= 5; i++) page.section.dispatch('pointermove', { pointerId: 1, clientX: 300 - i * 4, clientY: 300, timeStamp: i * 16 });
  page.flush(1); // a single frame is enough: no trailing
  imgs.forEach((img, i) => assert.ok(Math.abs(before[i][0] - xy(img)[0] - 20) < 0.11, 'each photo moved exactly 20px at once'));
  page.section.dispatch('pointerup', { pointerId: 1, clientX: 280, clientY: 300, timeStamp: 80 });
  assert.equal(page.flush(), 0, 'no glide frames');
});

test('vertical wheel is left to the page; sideways wheel and arrow keys move the field', async () => {
  const page = fakePage();
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  await r.ready;
  const vertical = page.section.dispatch('wheel', { deltaX: 0, deltaY: 100, deltaMode: 0 });
  assert.equal(vertical.prevented, undefined);
  assert.deepEqual(r.offset(), { x: 0, y: 0 });
  const sideways = page.section.dispatch('wheel', { deltaX: 40, deltaY: 5, deltaMode: 0 });
  assert.equal(sideways.prevented, true);
  assert.ok(r.offset().x < 0, 'swiping sideways moves the field left');
  const key = page.section.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(key.prevented, true);
  assert.ok(r.offset().y > 0, 'down arrow moves the field down');
  assert.equal(page.section.dispatch('keydown', { key: 'Tab' }).prevented, undefined);
});
