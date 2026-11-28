import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLayout, layoutModule } from '../scripts/photo-layout-file.mjs';
import { handLayout, handLayoutPhotos, BLOCK } from '../site/js/photo-field.js';

const HAND = {
  width: 400,
  height: 900,
  shift: 450,
  photos: [
    { src: './img/photo-field/01.jpg', x: 100, y: 120, w: 160, z: 2 },
    { src: './img/photo-field/02.jpg', x: 300, y: 400, w: 200, z: 1 },
    { src: './img/photo-field/01.jpg', x: 450, y: 950, w: 120, z: 3 }, // a second copy, centre outside the frame
  ],
};
const SHAPE = { './img/photo-field/01.jpg': 1.5, './img/photo-field/02.jpg': 0.8 };

// ---------- the layout the site uses ----------

test('a hand layout places each photo where it was put, at its own shape', () => {
  const l = handLayout(HAND, (src) => SHAPE[src]);
  const k = BLOCK.unit;
  assert.equal(l.tileW, 400 / k);
  assert.equal(l.tileH, 900 / k);
  assert.equal(l.shift, 450 / k);
  assert.equal(l.items.length, 3);
  const [a, b, c] = l.items;
  assert.deepEqual([a.x, a.y, a.w, a.h].map((v) => Math.round(v * k * 10) / 10), [100, 120, 160, 240]);
  assert.deepEqual([b.x * k, b.y * k, b.w * k], [300, 400, 200]);
  assert.ok(Math.abs(b.h / b.w - 0.8) < 1e-9);
  // centre (450, 950) is one frame right: back into the frame, moved up by the shift and wrapped
  assert.ok(Math.abs(c.x * k - 50) < 1e-9 && Math.abs(c.y * k - 500) < 1e-9);
  assert.deepEqual([a.index, b.index, c.index], [0, 1, 0]);
  assert.deepEqual([a.repeat, b.repeat, c.repeat], [false, false, true]);
  assert.deepEqual([a.z, b.z, c.z], [2, 1, 3]);
  assert.deepEqual(handLayoutPhotos(HAND), ['./img/photo-field/01.jpg', './img/photo-field/02.jpg']);
});

test('a photo that fails to load is left out of a hand layout; a missing or broken layout is empty', () => {
  const l = handLayout(HAND, (src) => (src.endsWith('02.jpg') ? NaN : SHAPE[src]));
  assert.equal(l.items.length, 2);
  assert.ok(l.items.every((it) => it.index === 0));
  for (const bad of [null, undefined, {}, { width: 0, height: 10, photos: [] }, { width: 400, height: 800 }]) {
    assert.equal(handLayout(bad, () => 1).items.length, 0);
    assert.deepEqual(handLayoutPhotos(bad), []);
  }
});

// ---------- the editor's Save ----------

test('cleanLayout accepts a good layout, tidies numbers, and allows null', () => {
  const c = cleanLayout({ ...HAND, photos: [{ ...HAND.photos[0], x: 100.04, z: 2.4 }] });
  assert.deepEqual(c.photos[0], { src: './img/photo-field/01.jpg', x: 100, y: 120, w: 160, z: 2 });
  assert.equal(c.shift, 450);
  assert.equal(cleanLayout(null), null);
  assert.equal(cleanLayout({ width: 400, height: 800, photos: [] }).shift, 0);
});

test('cleanLayout refuses odd paths and out-of-range values', () => {
  const bad = [
    'nope',
    [],
    { width: 400, height: 800 },
    { width: 50, height: 800, photos: [] },
    { width: 400, height: 800, photos: [{ src: '../secrets.jpg', x: 0, y: 0, w: 10 }] },
    { width: 400, height: 800, photos: [{ src: './img/../js/config.js', x: 0, y: 0, w: 10 }] },
    { width: 400, height: 800, photos: [{ src: 'https://example.com/a.jpg', x: 0, y: 0, w: 10 }] },
    { width: 400, height: 800, photos: [{ src: './img/a.jpg";alert(1)//.jpg', x: 0, y: 0, w: 10 }] },
    { width: 400, height: 800, photos: [{ src: './img/a.jpg', x: 'x', y: 0, w: 10 }] },
    { width: 400, height: 800, photos: [{ src: './img/a.jpg', x: 0, y: 0, w: 1 }] },
  ];
  for (const b of bad) assert.throws(() => cleanLayout(b), Error, JSON.stringify(b));
});

test('the saved file is a module the site can import, giving back the same layout', async () => {
  for (const layout of [cleanLayout(HAND), null]) {
    const src = layoutModule(layout);
    const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
    assert.deepEqual(mod.photoLayout, layout);
  }
});
