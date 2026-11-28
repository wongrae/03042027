// Drag-around photo field (the section below the swipe video): a dense wall of
// photos that visitors push around in any direction, repeating endlessly.
// After a flick it glides and slows to a stop; photos trail the drag by
// slightly different amounts for a subtle sense of depth, then settle back
// into the layout.
//
// Layout: a copy of the narrow-screen field of afterduskmedia.com. That site
// repeats one hand-composed block of 11 photo slots (measured in a 400 × 800
// phone frame), with deliberate gaps and overlaps. We repeat the same block, once
// per 11 photos, stacked one under the other (20 photos = 2 blocks, with 2 photos
// shown twice to fill the 22 slots).
//
// How the endless repeat works: the blocks form one rectangular "tile" that
// repeats in both directions (each sideways repeat shifted one block down, so a
// photo's twin is never level with it). Each copy's position is wrapped, so a
// photo leaving one side re-enters from the other while it is off-screen.
//
// Touch: the section uses `touch-action: none`, so every drag on it moves the
// photos (the page is scrolled by swiping above or below the section, which is
// only ~75% of the screen tall). Vertical mouse-wheel scrolling is left to the page.
import { prefersReducedMotion } from './video-scrub.js';
import { releaseVelocity, decayVelocity, wheelPixels } from './swipe.js';

// Seed for the small per-photo depth lag (the arrangement itself is fixed).
export const SEED = 20270403;
// Photo unit ("u") = sqrt(section area) / DENSITY, kept between U_MIN and U_MAX px.
// The block is drawn at u / BLOCK.unit times its measured size, so a phone (u ≈ 160)
// shows it almost exactly as wide as the screen, as on afterdusk. Lower DENSITY =
// bigger photos.
export const DENSITY = 2.7;
export const U_MIN = 150;
export const U_MAX = 300;
// The afterdusk block, in px of its 400 × 800 frame: each slot's left, top, width,
// height and stacking layer (higher = on top). Positions and sizes are as measured;
// the layers are rearranged so no photo is mostly hidden (on afterdusk two slots
// show only ~15%; here every photo shows at least ~45%).
export const BLOCK = {
  w: 400,
  h: 800,
  unit: 171, // px of the frame per u (the frame's u at DENSITY 3.3)
  slots: [
    [200, 116, 138, 207, 11],
    [3, 271, 230, 278, 9],
    [-13, 684, 190, 154, 6],
    [-19, 47, 168, 252, 7],
    [218, 69, 172, 208, 8],
    [14, 482, 182, 220, 10],
    [177, 612, 104, 156, 4],
    [248, 285, 142, 213, 1],
    [242, 511, 167, 202, 2],
    [199, 725, 208, 168, 5],
    [209, 387, 145, 175, 3],
  ],
};
// Depth: each photo trails the drag by up to this many ms, then catches up.
const LAG_MAX_MS = 90;
// Glide after a flick: speed decays with this time constant (ms), like the swipe video.
const MOMENTUM_MS = 250;
const MIN_SPEED = 0.02; // px/ms
// One arrow-key press moves the field by this many u.
const KEY_STEP = 0.5;
// Extra room (in u) beyond a photo's edge before it wraps to the other side.
const WRAP_PAD = 0.5;
// Shape assumed for a photo whose size can't be read.
const DEFAULT_ASPECT = 1.25; // height / width

/** Small seeded random number generator (returns 0 ≤ n < 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each slot of the block in u: centre x, y (inside the block), width, height, shape, layer. */
export function blockSlots() {
  const k = BLOCK.unit;
  const wrapTo = (v, p) => ((v % p) + p) % p;
  return BLOCK.slots.map(([left, top, w, h, layer]) => ({
    x: wrapTo(left + w / 2, BLOCK.w) / k,
    y: wrapTo(top + h / 2, BLOCK.h) / k,
    w: w / k,
    h: h / k,
    aspect: h / w,
    layer,
  }));
}

/**
 * Fills the repeating afterdusk block with photos. `aspects[i]` is photo i's
 * height / width. There is one block per 11 photos, stacked downwards; spare slots
 * in the last block show a second copy of a photo from another block. Photos go to
 * the slots closest to their shape. Each photo keeps its own shape, at its slot's
 * area and centre, so a photo shaped like its slot fills it exactly.
 * @returns {{ tileW:number, tileH:number, shift:number, blocks:number,
 *   items: {index:number, slot:number, block:number, x:number, y:number, w:number, h:number, z:number, lag:number, key:number, repeat:boolean}[] }}
 *   All in u. The tile repeats every tileW across (each copy `shift` further down)
 *   and every tileH down.
 */
export function layoutField(aspects, seed = SEED) {
  const list = Array.isArray(aspects) ? aspects : [];
  if (!list.length) return { tileW: 0, tileH: 0, shift: 0, blocks: 0, items: [] };
  const shapes = list.map((a) => (a > 0 && Number.isFinite(a) ? a : DEFAULT_ASPECT));
  const slots = blockSlots();
  const per = slots.length;
  const blocks = Math.ceil(shapes.length / per);
  const blockH = BLOCK.h / BLOCK.unit;
  const all = []; // every slot of every block
  for (let b = 0; b < blocks; b++) slots.forEach((s, i) => all.push({ ...s, slot: i, block: b }));
  const spare = all.length - shapes.length; // the last slots of the last block
  const main = all.slice(0, all.length - spare);
  // Shape matching: the k-th tallest photo goes to the k-th tallest slot.
  const bySlot = main.map((_, i) => i).sort((p, q) => main[p].aspect - main[q].aspect || p - q);
  const byPhoto = shapes.map((_, i) => i).sort((p, q) => shapes[p] - shapes[q] || p - q);
  const photoOf = new Array(all.length);
  bySlot.forEach((slotIdx, k) => { photoOf[slotIdx] = byPhoto[k]; });
  // Spare slots: a second copy of the closest-shaped photo from another block.
  const repeated = new Set();
  for (let s = main.length; s < all.length; s++) {
    const candidates = main
      .map((m, i) => ({ photo: photoOf[i], block: m.block }))
      .filter((c) => c.block !== all[s].block && !repeated.has(c.photo));
    const pool = candidates.length ? candidates : main.map((_, i) => ({ photo: photoOf[i] }));
    pool.sort((p, q) => Math.abs(shapes[p.photo] - all[s].aspect) - Math.abs(shapes[q.photo] - all[s].aspect) || p.photo - q.photo);
    photoOf[s] = pool[0].photo;
    repeated.add(pool[0].photo);
  }
  const rand = mulberry32(seed);
  const items = all.map((s, i) => {
    const aspect = shapes[photoOf[i]];
    const w = Math.sqrt((s.w * s.h) / aspect); // same area as the slot, the photo's own shape
    return {
      index: photoOf[i],
      slot: s.slot,
      block: s.block,
      x: s.x,
      y: s.y + s.block * blockH,
      w,
      h: w * aspect,
      z: (s.layer - 1) * blocks + s.block + 1, // the block's layering, unique per photo
      lag: rand() * LAG_MAX_MS,
      key: i, // this photo copy's own slot in the tile
      repeat: i >= main.length, // a second copy of a photo shown elsewhere
    };
  });
  return {
    tileW: BLOCK.w / BLOCK.unit,
    tileH: blocks * blockH,
    shift: blocks > 1 ? blockH : 0,
    blocks,
    items,
  };
}

/** Photo unit u in px for a section of the given size. */
export function photoUnit(width, height) {
  const area = width * height;
  if (!(area > 0)) return U_MIN;
  return Math.min(U_MAX, Math.max(U_MIN, Math.sqrt(area) / DENSITY));
}

/** How many copies of a repeating span cover the view plus `margin` on both sides. */
export function copiesNeeded(view, span, margin) {
  if (!(span > 0)) return 1;
  const need = (Math.max(0, view || 0) + 2 * Math.max(0, margin || 0)) / span;
  return Math.max(1, Math.ceil(need));
}

/** v wrapped into [0, p). */
export function wrap(v, p) {
  if (!(p > 0) || !Number.isFinite(v)) return 0;
  return ((v % p) + p) % p;
}

/**
 * On-screen centre (px, along one axis) of one photo copy. `base` is its place in
 * the repeating span, `copy` which copy it is, `offset` the field's drag offset.
 * The result lies in [-margin, copies × span − margin), so it jumps sides only off-screen.
 */
export function instancePosition(base, copy, span, offset, copies, margin) {
  return wrap(base + copy * span + offset, copies * span) - margin;
}

/**
 * On-screen centre (px) of one copy of a photo. `cx`, `cy` say which copy
 * (across, down), `offset` is the drag offset in u, `copies` how many tile copies
 * there are each way and `margin` the wrap margins (px). A copy that wraps
 * across becomes a different repeat of the tile, so its vertical position follows
 * that repeat's shift (it happens off-screen, so nothing visibly jumps).
 */
export function tilePosition(item, cx, cy, layout, u, offset, copies, margin) {
  const spanX = layout.tileW * u;
  const periodX = copies.x * spanX;
  const rawX = item.x * u + cx * spanX + offset.x * u;
  const turns = Math.floor(rawX / periodX);
  const across = cx - turns * copies.x; // which repeat of the tile this copy is showing
  const spanY = layout.tileH * u;
  const y = item.y * u + across * layout.shift * u + cy * spanY + offset.y * u;
  return { x: rawX - turns * periodX - margin.x, y: wrap(y, copies.y * spanY) - margin.y };
}

/** Release speed {x, y} in px/ms from recent {t, x, y} pointer samples (0 if the finger had stopped). */
export function releaseVelocity2D(samples, now) {
  return {
    x: releaseVelocity(samples.map((s) => ({ t: s.t, x: s.x })), now),
    y: releaseVelocity(samples.map((s) => ({ t: s.t, x: s.y })), now),
  };
}

/** Field movement in px for an arrow key, or null for any other key. */
export function keyStep(key, u) {
  const d = KEY_STEP * u;
  switch (key) {
    case 'ArrowLeft': return { x: -d, y: 0 };
    case 'ArrowRight': return { x: d, y: 0 };
    case 'ArrowUp': return { x: 0, y: -d };
    case 'ArrowDown': return { x: 0, y: d };
    default: return null;
  }
}

/** Fraction of the way a trailing photo catches up in dt ms (0 lag = all the way). */
export function catchUp(dt, lag) {
  if (!(lag > 0)) return 1;
  return 1 - Math.exp(-Math.max(0, dt) / lag);
}

/** Reads each photo's height / width (NaN for one that fails to load). */
function loadAspects(list, win) {
  const Img = win.Image;
  if (typeof Img !== 'function') return Promise.resolve(list.map(() => DEFAULT_ASPECT));
  return Promise.all(list.map((src) => new Promise((resolve) => {
    const img = new Img();
    img.onload = () => resolve(img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : DEFAULT_ASPECT);
    img.onerror = () => resolve(NaN);
    img.src = src;
  })));
}

/** Resolves once the section is within about a screen of the viewport. */
function whenNear(section, win) {
  const IO = win.IntersectionObserver;
  if (typeof IO !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    const io = new IO((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        resolve();
      }
    }, { rootMargin: '100% 0px' });
    io.observe(section);
  });
}

/**
 * @param {{ photos?: string[]|null, section?: HTMLElement|null, win?: Window }} options
 * @returns {{ active: boolean, ready: Promise<void>, offset: () => {x:number, y:number}, destroy: () => void }}
 */
export function initPhotoField({ photos, section = globalThis.document?.getElementById('photo-field'), win = globalThis.window } = {}) {
  const inactive = { active: false, ready: Promise.resolve(), offset: () => ({ x: 0, y: 0 }), destroy() {} };
  const all = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (!all.length || !section || !win) return inactive;

  const doc = section.ownerDocument;
  const reduced = prefersReducedMotion(win);

  let list = [];
  let layout = layoutField([]);
  // Drag offset in u, so a resize/rotation keeps the field where it was.
  const target = { x: 0, y: 0 };
  let shown = []; // per photo: where it is drawn now (trails `target` by its lag)
  let u = U_MIN;
  let copies = { x: 0, y: 0 };
  let instances = []; // { img, item, cx, cy }
  let destroyed = false;

  const layer = doc.createElement('div');
  layer.className = 'photo-field-layer';
  section.append(layer);

  // How far outside the section a photo's centre may go before it wraps to the other
  // side: half the biggest photo plus WRAP_PAD u, so it wraps well out of view even
  // during a fast flick (up to ~50px per frame).
  const margins = () => ({
    x: (Math.max(0, ...layout.items.map((it) => it.w)) / 2 + WRAP_PAD) * u,
    y: (Math.max(0, ...layout.items.map((it) => it.h)) / 2 + WRAP_PAD) * u,
  });

  const build = () => {
    layer.replaceChildren();
    instances = [];
    for (let cx = 0; cx < copies.x; cx++) {
      for (let cy = 0; cy < copies.y; cy++) {
        for (const item of layout.items) {
          const img = doc.createElement('img');
          img.className = 'photo-field-photo';
          img.src = list[item.index];
          img.alt = '';
          img.draggable = false;
          img.setAttribute('draggable', 'false');
          img.setAttribute('decoding', 'async');
          if (cx || cy || item.repeat) img.setAttribute('aria-hidden', 'true');
          img.style.zIndex = String(item.z);
          layer.append(img);
          instances.push({ img, item, cx, cy });
        }
      }
    }
  };

  const render = () => {
    const margin = margins();
    for (const { img, item, cx, cy } of instances) {
      const { x, y } = tilePosition(item, cx, cy, layout, u, shown[item.key] || target, copies, margin);
      img.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  };

  const measure = () => {
    if (!layout.items.length) return;
    const w = section.clientWidth;
    const h = section.clientHeight;
    u = photoUnit(w, h);
    const margin = margins();
    const next = { x: copiesNeeded(w, layout.tileW * u, margin.x), y: copiesNeeded(h, layout.tileH * u, margin.y) };
    if (next.x !== copies.x || next.y !== copies.y) {
      copies = next;
      build();
    }
    for (const { img, item } of instances) img.style.width = `${(item.w * u).toFixed(1)}px`;
    render();
  };

  // ---- Animation: photos ease toward the drag target; flicks glide ----
  let raf = 0;
  let lastT = 0;
  let coastV = null; // px/ms while gliding
  const now = () => win.performance?.now?.() ?? Date.now();
  const settled = () => shown.every((s) => Math.abs(s.x - target.x) < 0.002 && Math.abs(s.y - target.y) < 0.002);
  const frame = (t) => {
    raf = 0;
    const dt = Math.min(64, Math.max(0, t - lastT)); // don't jump after a dropped/backgrounded frame
    lastT = t;
    if (coastV) {
      target.x += (coastV.x * dt) / u;
      target.y += (coastV.y * dt) / u;
      coastV = { x: decayVelocity(coastV.x, dt), y: decayVelocity(coastV.y, dt) };
      if (Math.hypot(coastV.x, coastV.y) < MIN_SPEED) coastV = null;
    }
    layout.items.forEach((it, i) => {
      const k = reduced ? 1 : catchUp(dt, it.lag);
      shown[i].x += (target.x - shown[i].x) * k;
      shown[i].y += (target.y - shown[i].y) * k;
    });
    if (!coastV && settled()) shown.forEach((s) => { s.x = target.x; s.y = target.y; });
    render();
    if (coastV || !settled()) raf = win.requestAnimationFrame(frame);
  };
  const wake = () => {
    if (raf || destroyed) return;
    lastT = now();
    raf = win.requestAnimationFrame(frame);
  };
  const moveBy = (dx, dy) => {
    target.x += dx / u;
    target.y += dy / u;
    wake();
  };
  const stopCoast = () => { coastV = null; };
  const startCoast = (v) => {
    if (reduced || Math.hypot(v.x, v.y) < MIN_SPEED) return;
    coastV = v;
    wake();
  };

  // ---- Input ----
  let drag = null; // { id, x, y, samples } while a finger/mouse is down
  const onPointerDown = (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopCoast(); // touching a gliding field catches it
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
    section.setPointerCapture?.(e.pointerId);
    section.classList.add('dragging');
    if (e.pointerType === 'mouse') e.preventDefault(); // no text selection
  };
  const onPointerMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    moveBy(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (drag.samples.length > 20) drag.samples.shift();
  };
  const onPointerEnd = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const v = e.type === 'pointerup' ? releaseVelocity2D(drag.samples, e.timeStamp) : { x: 0, y: 0 };
    drag = null;
    section.classList.remove('dragging');
    startCoast(v);
  };
  const onWheel = (e) => {
    // Only mostly-sideways wheel/trackpad gestures move the field; vertical ones scroll the page.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault(); // stops the trackpad back/forward history swipe
    stopCoast(); // trackpads send their own momentum
    moveBy(-wheelPixels(e.deltaX, e.deltaMode, section.clientWidth), 0);
  };
  const onKey = (e) => {
    const step = keyStep(e.key, u);
    if (!step) return;
    e.preventDefault();
    stopCoast();
    moveBy(step.x, step.y);
  };
  const onDragStart = (e) => e.preventDefault();

  section.hidden = false; // takes its space straight away, so nothing below jumps later
  section.classList.add('photo-field-active');
  section.tabIndex = 0;
  section.setAttribute('role', 'group');
  section.setAttribute('aria-label', 'Photos. Drag, or use the arrow keys, to move around.');
  section.addEventListener('pointerdown', onPointerDown);
  section.addEventListener('pointermove', onPointerMove);
  section.addEventListener('pointerup', onPointerEnd);
  section.addEventListener('pointercancel', onPointerEnd);
  section.addEventListener('lostpointercapture', onPointerEnd);
  section.addEventListener('wheel', onWheel, { passive: false });
  section.addEventListener('keydown', onKey);
  section.addEventListener('dragstart', onDragStart);
  win.addEventListener('resize', measure);

  // Photo shapes are needed for the layout, so read them first (once the section is near).
  const ready = whenNear(section, win)
    .then(() => (destroyed ? [] : loadAspects(all, win)))
    .then((aspects) => {
      if (destroyed) return;
      // A photo that fails to load is left out, so it leaves no hole.
      const ok = all.map((src, i) => ({ src, a: aspects[i] })).filter((p) => Number.isFinite(p.a));
      list = ok.map((p) => p.src);
      layout = layoutField(ok.map((p) => p.a));
      shown = layout.items.map(() => ({ x: target.x, y: target.y }));
      measure();
    });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    section.removeEventListener('pointerdown', onPointerDown);
    section.removeEventListener('pointermove', onPointerMove);
    section.removeEventListener('pointerup', onPointerEnd);
    section.removeEventListener('pointercancel', onPointerEnd);
    section.removeEventListener('lostpointercapture', onPointerEnd);
    section.removeEventListener('wheel', onWheel);
    section.removeEventListener('keydown', onKey);
    section.removeEventListener('dragstart', onDragStart);
    win.removeEventListener('resize', measure);
    layer.remove();
    section.classList.remove('photo-field-active', 'dragging');
    section.removeAttribute('tabindex');
    section.removeAttribute('role');
    section.removeAttribute('aria-label');
    section.hidden = true;
  }

  return { active: true, ready, offset: () => ({ x: target.x * u, y: target.y * u }), destroy };
}
