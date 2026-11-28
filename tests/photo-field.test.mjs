import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, layoutField, blockSlots, BLOCK, photoUnit, copiesNeeded, wrap, instancePosition, tilePosition,
  releaseVelocity2D, keyStep, catchUp, initPhotoField, U_MIN, U_MAX,
} from '../site/js/photo-field.js';

// The placeholder shapes, made to match the block's slots: tall 2:3, portrait ~5:6, landscape ~5:4.
const SHAPES = 'TPLTPPTTPLPTPLTPPTTP'.split('').map((c) => ({ T: 1.5, P: 774 / 640, L: 648 / 800 })[c]);

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

test('the block is the afterdusk phone layout: 11 slots in a 400 × 800 frame', () => {
  const slots = blockSlots();
  assert.equal(slots.length, 11);
  assert.equal(BLOCK.w, 400);
  assert.equal(BLOCK.h, 800);
  slots.forEach((s, i) => {
    const [left, top, w, h] = BLOCK.slots[i];
    assert.ok(Math.abs(s.w * BLOCK.unit - w) < 1e-9 && Math.abs(s.h * BLOCK.unit - h) < 1e-9, 'measured size kept');
    const cx = (((left + w / 2) % 400) + 400) % 400, cy = (((top + h / 2) % 800) + 800) % 800;
    assert.ok(Math.abs(s.x * BLOCK.unit - cx) < 1e-9 && Math.abs(s.y * BLOCK.unit - cy) < 1e-9, 'measured position kept');
  });
  assert.deepEqual(BLOCK.slots.map((s) => s[4]).sort((a, b) => a - b), slots.map((_, i) => i + 1)); // unique layers
});

test('20 photos fill two blocks exactly, with 2 photos shown a second time in the other block', () => {
  const l = layoutField(SHAPES);
  assert.equal(l.blocks, 2);
  assert.equal(l.items.length, 22);
  assert.ok(Math.abs(l.tileW - 400 / BLOCK.unit) < 1e-9 && Math.abs(l.tileH - 1600 / BLOCK.unit) < 1e-9);
  assert.ok(Math.abs(l.shift - 800 / BLOCK.unit) < 1e-9, 'sideways repeats are one block lower');
  const slots = blockSlots();
  l.items.forEach((it) => {
    // placeholders are made in the slot shapes, so each fills its slot exactly
    const s = slots[it.slot];
    assert.ok(Math.abs(it.w - s.w) < 0.01 && Math.abs(it.h - s.h) < 0.01, `photo ${it.index} fills slot ${it.slot}`);
    assert.ok(Math.abs(it.x - s.x) < 1e-9 && Math.abs(it.y - (s.y + it.block * 800 / BLOCK.unit)) < 1e-9);
    assert.ok(it.lag >= 0 && it.lag <= 90);
  });
  assert.deepEqual([...new Set(l.items.map((it) => it.index))].sort((a, b) => a - b), SHAPES.map((_, i) => i));
  const repeats = l.items.filter((it) => it.repeat);
  assert.equal(repeats.length, 2);
  for (const r of repeats) {
    const twin = l.items.find((it) => it.index === r.index && !it.repeat);
    assert.notEqual(twin.block, r.block, 'a repeated photo is in the other block');
  }
  assert.deepEqual(l.items.map((it) => it.z).sort((a, b) => a - b), l.items.map((_, i) => i + 1)); // unique stacking order
  assert.deepEqual(l.items.map((it) => it.key), l.items.map((_, i) => i));
});

test('a photo of a different shape keeps its own shape, at its slot\'s area and centre, in the closest-shaped slot', () => {
  const shapes = SHAPES.slice();
  shapes[0] = 0.5; // a wide panorama instead of a tall photo
  const l = layoutField(shapes);
  const slots = blockSlots();
  const it = l.items.find((i) => i.index === 0);
  assert.ok(Math.abs(it.h / it.w - 0.5) < 1e-9, 'shape kept');
  const s = slots[it.slot];
  assert.ok(Math.abs(it.w * it.h - s.w * s.h) < 1e-9, 'same area as its slot');
  assert.ok(s.aspect < 1, 'placed in a landscape slot');
});

// Every repeat of every photo near the tile (copy m across sits m tile widths right and m × shift down).
function repeats(l, reach = 3) {
  const out = [];
  for (const it of l.items) {
    for (let m = -reach; m <= reach; m++) {
      for (let n = -reach; n <= reach; n++) {
        out.push({ it, x: it.x + m * l.tileW, y: it.y + m * l.shift + n * l.tileH });
      }
    }
  }
  return out;
}

// Samples the repeating layout on a grid: how much area is covered, and how much of each photo is visible.
function coverage(l, RW = 6, RH = 10, step = 0.04) {
  const rects = repeats(l)
    .map((r) => ({ z: r.it.z, x0: r.x - r.it.w / 2, x1: r.x + r.it.w / 2, y0: r.y - r.it.h / 2, y1: r.y + r.it.h / 2 }))
    .filter((q) => q.x1 > 0 && q.x0 < RW && q.y1 > 0 && q.y0 < RH);
  let covered = 0, total = 0;
  const area = new Map(), vis = new Map();
  for (let x = 0; x < RW; x += step) {
    for (let y = 0; y < RH; y += step) {
      total++;
      let top = null;
      for (const q of rects) {
        if (x < q.x0 || x >= q.x1 || y < q.y0 || y >= q.y1) continue;
        area.set(q, (area.get(q) || 0) + 1);
        if (!top || q.z > top.z) top = q;
      }
      if (top) { covered++; vis.set(top, (vis.get(top) || 0) + 1); }
    }
  }
  const inside = rects.filter((q) => q.x0 >= 0 && q.x1 <= RW && q.y0 >= 0 && q.y1 <= RH);
  return { covered: covered / total, minVisible: Math.min(...inside.map((q) => (vis.get(q) || 0) / area.get(q))) };
}

test('the field is filled like afterdusk (about 92%), and no photo is mostly hidden', () => {
  const { covered, minVisible } = coverage(layoutField(SHAPES));
  assert.ok(covered > 0.9 && covered < 0.95, `${Math.round(covered * 100)}% covered`);
  assert.ok(minVisible >= 0.4, `a photo is only ${Math.round(minVisible * 100)}% visible`);
});

test('other photo counts use one block per 11 photos, showing every photo', () => {
  for (const n of [1, 2, 10, 11, 12, 30, 40]) {
    const l = layoutField(Array.from({ length: n }, (_, i) => SHAPES[i % 20]));
    const blocks = Math.ceil(n / 11);
    assert.equal(l.blocks, blocks);
    assert.equal(l.items.length, blocks * 11);
    assert.equal(new Set(l.items.map((it) => it.index)).size, n);
    assert.equal(l.items.filter((it) => !it.repeat).length, n);
    assert.equal(l.shift, blocks > 1 ? 800 / BLOCK.unit : 0);
  }
  assert.equal(layoutField([]).items.length, 0);
  assert.equal(layoutField(null).items.length, 0);
  // a bad shape falls back to a default instead of breaking the layout
  assert.ok(layoutField([NaN, 0, 1]).items.every((it) => it.h > 0));
});

// ---------- sizing and wrapping ----------

test('the photo unit scales with the screen and is clamped at both ends', () => {
  const phone = photoUnit(375, 500);
  const blockW = (400 / BLOCK.unit) * phone;
  assert.ok(Math.abs(blockW - 375) < 20, `on a phone the block is ${Math.round(blockW)}px wide`); // as wide as the screen, like afterdusk
  assert.equal(photoUnit(300, 300), U_MIN);
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

test('the field repeats with no visible jump or overlap change at phone, tablet and desktop sizes', () => {
  const l = layoutField(SHAPES);
  const maxW = Math.max(...l.items.map((it) => it.w)), maxH = Math.max(...l.items.map((it) => it.h));
  for (const [W, H] of [[375, 500], [412, 686], [667, 281], [1541, 708], [2560, 1080]]) {
    const u = photoUnit(W, H);
    const margin = { x: (maxW / 2 + 0.5) * u, y: (maxH / 2 + 0.5) * u }; // same margins as the page
    const copies = { x: copiesNeeded(W, l.tileW * u, margin.x), y: copiesNeeded(H, l.tileH * u, margin.y) };
    let prev = null, minVisible = Infinity, jumps = 0, misplaced = 0;
    for (let s = 0; s <= 1500; s++) {
      const off = { x: (-s * 40) / u, y: (s * 27) / u }; // fast: ~60,000px left and ~40,000px down, 40px per frame
      const cur = [];
      for (let a = 0; a < copies.x; a++) {
        for (let b = 0; b < copies.y; b++) {
          for (const it of l.items) {
            const { x, y } = tilePosition(it, a, b, l, u, off, copies, margin);
            const hw = (it.w * u) / 2, hh = (it.h * u) / 2;
            cur.push({ it, x, y, vis: x + hw > 0 && x - hw < W && y + hh > 0 && y - hh < H });
          }
        }
      }
      if (prev) cur.forEach((p, k) => { if ((p.vis || prev[k].vis) && (Math.abs(p.x - prev[k].x) > 60 || Math.abs(p.y - prev[k].y) > 60)) jumps++; });
      // Every visible copy sits exactly where the endless layout puts that photo.
      if (s % 50 === 0) {
        for (const p of cur.filter((q) => q.vis)) {
          const gx = (p.x + margin.x) / u - off.x - p.it.x; // whole tile repeats across
          const m = Math.round(gx / l.tileW);
          const gy = ((p.y + margin.y) / u - off.y - p.it.y - m * l.shift) / l.tileH;
          if (Math.abs(gx - m * l.tileW) > 1e-6 || Math.abs(gy - Math.round(gy)) > 1e-6) misplaced++;
        }
      }
      minVisible = Math.min(minVisible, cur.filter((p) => p.vis).length);
      prev = cur;
    }
    assert.equal(jumps, 0, `${W}×${H}: a photo jumped while on screen`);
    assert.equal(misplaced, 0, `${W}×${H}: a photo showed out of place`);
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

test('trailing photos catch up smoothly, and with no lag immediately', () => {
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

test('photos trail the drag by different amounts, then all settle back into the layout', async () => {
  const page = fakePage();
  const r = initPhotoField({ photos: PHOTOS, section: page.section, win: page.win });
  await r.ready;
  page.flush();
  const imgs = page.photos();
  const before = imgs.map(xy);
  page.section.dispatch('keydown', { key: 'ArrowLeft' }); // moves the field half a photo unit left
  page.flush(1); // one frame in: photos have moved different fractions of the way
  const mid = new Set(imgs.map((img, i) => (before[i][0] - xy(img)[0]).toFixed(1)));
  assert.ok(mid.size > 1, 'photos moved by different amounts mid-motion');
  page.flush();
  imgs.forEach((img, i) => {
    const d = before[i][0] - xy(img)[0];
    // every photo ends exactly half a unit left, unless that copy wrapped around to the other side
    assert.ok(Math.abs(d - photoUnit(400, 600) / 2) < 0.2 || Math.abs(d) > 300, `photo ${i} moved ${d}`);
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
  imgs.forEach((img, i) => {
    const d = before[i][0] - xy(img)[0];
    // exactly 20px at once, unless that copy wrapped around to the other side
    assert.ok(Math.abs(d - 20) < 0.11 || Math.abs(d) > 300, `photo ${i} moved ${d}px`);
  });
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
