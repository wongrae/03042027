// Drag-around photo field (the section below the swipe video): a scattered wall
// of photos that visitors push around in any direction, repeating endlessly.
// After a flick it glides and slows to a stop, and photos move at slightly
// different speeds for a subtle sense of depth.
//
// How the endless repeat works: the scattered layout is one rectangular "tile".
// Enough copies of it are made to cover the section plus a margin, and each photo
// copy's position is wrapped over (copies × tile), so a photo leaving one side
// re-enters from the other while it is off-screen.
//
// Touch: the section uses `touch-action: none`, so every drag on it moves the
// photos (the page is scrolled by swiping above or below the section, which is
// only ~75% of the screen tall). Vertical mouse-wheel scrolling is left to the page.
import { prefersReducedMotion } from './video-scrub.js';
import { releaseVelocity, decayVelocity, wheelPixels } from './swipe.js';

// The arrangement: same SEED = same layout on every visit. Change it to reshuffle.
export const SEED = 20270403;
// Photo base width ("u") = sqrt(section area) / DENSITY, kept between U_MIN and U_MAX px.
// Lower DENSITY = bigger photos (fewer on screen).
export const DENSITY = 4.5;
export const U_MIN = 110;
export const U_MAX = 300;
// Grid cell size, in u. Larger = more space between photos.
const CELL = 1.35;
// How far a photo may sit from its cell centre (fraction of a cell), its width range (in u),
// and its depth range (how much faster/slower than the drag it moves).
const JITTER = 0.3;
const SIZE_MIN = 0.7;
const SIZE_MAX = 1.25;
const DEPTH_SPREAD = 0.1;
// Photos are centred on their anchor; allow shapes up to 1:2 when working out the margin.
const MAX_ASPECT = 2;
// Glide after a flick: speed decays with this time constant (ms), like the swipe video.
const MOMENTUM_MS = 250;
const MIN_SPEED = 0.02; // px/ms
// One arrow-key press moves the field by this many u.
const KEY_STEP = 0.5;

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

/**
 * Scattered layout for `count` photos, in units of u (base photo width).
 * Photo i sits in grid cell i, jittered, with its own width and depth.
 * @returns {{ cols:number, rows:number, tileW:number, tileH:number, maxW:number,
 *   items: {x:number, y:number, w:number, depth:number}[] }}
 */
export function layoutField(count, seed = SEED) {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (!n) return { cols: 0, rows: 0, tileW: 0, tileH: 0, maxW: 0, items: [] };
  const cols = Math.ceil(Math.sqrt(n * 1.25));
  const rows = Math.ceil(n / cols);
  const rand = mulberry32(seed);
  const items = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    items.push({
      x: (col + 0.5 + (rand() * 2 - 1) * JITTER) * CELL,
      y: (row + 0.5 + (rand() * 2 - 1) * JITTER) * CELL,
      w: SIZE_MIN + rand() * (SIZE_MAX - SIZE_MIN),
      depth: 1 + (rand() * 2 - 1) * DEPTH_SPREAD,
    });
  }
  return { cols, rows, tileW: cols * CELL, tileH: rows * CELL, maxW: SIZE_MAX, items };
}

/** Base photo width in px for a section of the given size. */
export function photoUnit(width, height) {
  const area = width * height;
  if (!(area > 0)) return U_MIN;
  return Math.min(U_MAX, Math.max(U_MIN, Math.sqrt(area) / DENSITY));
}

/** How many tile copies along one axis cover the view plus `margin` on both sides. */
export function copiesNeeded(view, tile, margin) {
  if (!(tile > 0)) return 1;
  const need = (Math.max(0, view || 0) + 2 * Math.max(0, margin || 0)) / tile;
  return Math.max(1, Math.ceil(need));
}

/** v wrapped into [0, p). */
export function wrap(v, p) {
  if (!(p > 0) || !Number.isFinite(v)) return 0;
  return ((v % p) + p) % p;
}

/**
 * On-screen centre (px, along one axis) of one photo copy. `base` is its place in the
 * tile, `copy` which tile copy it belongs to, `offset` the field's drag offset.
 * The result lies in [-margin, copies × tile − margin), so it jumps sides only off-screen.
 */
export function instancePosition(base, copy, tile, offset, depth, copies, margin) {
  return wrap(base + copy * tile + offset * depth, copies * tile) - margin;
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

/**
 * @param {{ photos?: string[]|null, section?: HTMLElement|null, win?: Window }} options
 * @returns {{ active: boolean, offset: () => {x:number, y:number}, destroy: () => void }}
 */
export function initPhotoField({ photos, section = globalThis.document?.getElementById('photo-field'), win = globalThis.window } = {}) {
  const inactive = { active: false, offset: () => ({ x: 0, y: 0 }), destroy() {} };
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (!list.length || !section || !win) return inactive;

  const doc = section.ownerDocument;
  const reduced = prefersReducedMotion(win);
  const layout = layoutField(list.length);
  const depthOf = (item) => (reduced ? 1 : item.depth);

  // Drag offset in units of u, so a resize/rotation keeps the field where it was.
  const off = { x: 0, y: 0 };
  let u = U_MIN;
  let copies = { x: 0, y: 0 };
  let instances = []; // { img, item, cx, cy, index }
  const failed = new Set();

  const layer = doc.createElement('div');
  layer.className = 'photo-field-layer';
  section.append(layer);

  const build = () => {
    layer.replaceChildren();
    instances = [];
    for (let cy = 0; cy < copies.y; cy++) {
      for (let cx = 0; cx < copies.x; cx++) {
        const first = cx === 0 && cy === 0;
        layout.items.forEach((item, index) => {
          const img = doc.createElement('img');
          img.className = 'photo-field-photo';
          img.src = list[index];
          img.alt = '';
          img.draggable = false;
          img.setAttribute('draggable', 'false');
          img.setAttribute('loading', 'lazy');
          img.setAttribute('decoding', 'async');
          if (!first) img.setAttribute('aria-hidden', 'true');
          if (failed.has(index)) img.hidden = true;
          img.addEventListener('error', () => {
            failed.add(index);
            for (const inst of instances) if (inst.index === index) inst.img.hidden = true;
          });
          layer.append(img);
          instances.push({ img, item, cx, cy, index });
        });
      }
    }
  };

  const render = () => {
    const tileW = layout.tileW * u;
    const tileH = layout.tileH * u;
    const margin = (layout.maxW * u * MAX_ASPECT) / 2;
    for (const { img, item, cx, cy } of instances) {
      const x = instancePosition(item.x * u, cx, tileW, off.x * u, depthOf(item), copies.x, margin);
      const y = instancePosition(item.y * u, cy, tileH, off.y * u, depthOf(item), copies.y, margin);
      img.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  };

  const measure = () => {
    const w = section.clientWidth;
    const h = section.clientHeight;
    u = photoUnit(w, h);
    const margin = (layout.maxW * u * MAX_ASPECT) / 2;
    const next = { x: copiesNeeded(w, layout.tileW * u, margin), y: copiesNeeded(h, layout.tileH * u, margin) };
    if (next.x !== copies.x || next.y !== copies.y) {
      copies = next;
      build();
    }
    for (const { img, item } of instances) img.style.width = `${(item.w * u).toFixed(1)}px`;
    render();
  };

  let renderRaf = 0;
  const schedule = () => {
    if (!renderRaf) renderRaf = win.requestAnimationFrame(() => { renderRaf = 0; render(); });
  };
  const moveBy = (dx, dy) => {
    off.x += dx / u;
    off.y += dy / u;
    schedule();
  };

  // ---- Glide after a flick ----
  let coastRaf = 0;
  let coastV = { x: 0, y: 0 };
  let coastT = 0;
  const now = () => win.performance?.now?.() ?? Date.now();
  const stopCoast = () => {
    if (coastRaf) win.cancelAnimationFrame(coastRaf);
    coastRaf = 0;
  };
  const coast = (t) => {
    coastRaf = 0;
    const dt = Math.min(64, t - coastT); // don't jump after a dropped/backgrounded frame
    coastT = t;
    moveBy(coastV.x * dt, coastV.y * dt);
    coastV = { x: decayVelocity(coastV.x, dt), y: decayVelocity(coastV.y, dt) };
    if (Math.hypot(coastV.x, coastV.y) >= MIN_SPEED) coastRaf = win.requestAnimationFrame(coast);
  };
  const startCoast = (v) => {
    stopCoast();
    if (reduced || Math.hypot(v.x, v.y) < MIN_SPEED) return;
    coastV = v;
    coastT = now();
    coastRaf = win.requestAnimationFrame(coast);
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

  section.hidden = false;
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
  measure();

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopCoast();
    if (renderRaf) win.cancelAnimationFrame(renderRaf);
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

  return { active: true, offset: () => ({ x: off.x * u, y: off.y * u }), destroy };
}
