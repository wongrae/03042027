// Drag-around photo field (the section below the swipe video): a dense wall of
// photos that visitors push around in any direction, repeating endlessly.
// After a flick it glides and slows to a stop; columns trail the drag by
// slightly different amounts for a subtle sense of depth, then settle back
// into the layout.
//
// Layout (modelled on the narrow-screen field of afterduskmedia.com): staggered
// masonry columns of big photos. Photos are about as wide as their column, stack
// with a small overlap, poke a little into the neighbouring column, and keep
// their own shape, so the field is densely filled and every photo stays mostly
// visible.
//
// How the endless repeat works: the columns form one horizontal "tile" that is
// copied sideways, and each column also repeats on its own vertically (its period
// is its own height, so there is never a seam). Each copy's position is wrapped,
// so a photo leaving one side re-enters from the other while it is off-screen.
//
// Touch: the section uses `touch-action: none`, so every drag on it moves the
// photos (the page is scrolled by swiping above or below the section, which is
// only ~75% of the screen tall). Vertical mouse-wheel scrolling is left to the page.
import { prefersReducedMotion } from './video-scrub.js';
import { releaseVelocity, decayVelocity, wheelPixels } from './swipe.js';

// The arrangement: same SEED = same layout on every visit. Change it to reshuffle.
export const SEED = 20270403;
// Column width ("u") = sqrt(section area) / DENSITY, kept between U_MIN and U_MAX px.
// Lower DENSITY = bigger photos (fewer on screen). A phone shows about 2½ columns.
export const DENSITY = 3.3;
export const U_MIN = 150;
export const U_MAX = 300;
// Photo width as a fraction of its column, and how far it may sit off the column
// centre (fraction of a column). Together they set how much photos poke into the
// next column (at most ~(WIDTH_MAX - 1) / 2 + X_JITTER of a column on each side).
const WIDTH_MIN = 0.65;
const WIDTH_MAX = 1.1;
const X_JITTER = 0.1;
// Vertical space between stacked photos, in columns: negative = overlap.
const GAP_MIN = -0.1;
const GAP_MAX = 0.06;
// Depth: each column trails the drag by up to this many ms, then catches up.
const LAG_MAX_MS = 90;
// Glide after a flick: speed decays with this time constant (ms), like the swipe video.
const MOMENTUM_MS = 250;
const MIN_SPEED = 0.02; // px/ms
// One arrow-key press moves the field by this many columns.
const KEY_STEP = 0.5;
// Each sideways repeat of the columns is shifted down by this fraction of a
// column's height, so a repeated photo never sits level with its twin.
export const COPY_SHIFT = 0.5;
// Extra room (in columns) beyond a photo's edge before it wraps to the other side.
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

/**
 * How many columns the repeating tile has for `count` photos: about 7 photos per
 * column (20 → 3), so a column is taller than a phone screen and the same photo
 * doesn't show twice in one column on screen.
 */
export function columnCount(count) {
  return Math.max(2, Math.round(count / 7));
}

/**
 * Masonry layout, in units of one column width. `aspects[i]` is photo i's
 * height / width. Each photo goes to the currently shortest column, so columns
 * end up about equally tall.
 * @returns {{ cols:number, tileW:number,
 *   columns: {height:number, lag:number}[],
 *   items: {index:number, col:number, x:number, y:number, w:number, h:number, z:number}[] }}
 *   x, y are the photo's centre; a column's photos repeat every `height` vertically.
 */
export function layoutField(aspects, seed = SEED) {
  const list = Array.isArray(aspects) ? aspects : [];
  if (!list.length) return { cols: 0, tileW: 0, columns: [], items: [] };
  const rand = mulberry32(seed);
  const cols = Math.min(list.length, columnCount(list.length));
  // Columns start at different heights (stagger), and each trails the drag differently.
  const columns = Array.from({ length: cols }, () => {
    const start = rand() * 0.6;
    return { start, top: start, lag: rand() * LAG_MAX_MS, items: [] };
  });
  const items = list.map((a, index) => {
    const aspect = a > 0 && Number.isFinite(a) ? a : DEFAULT_ASPECT;
    const w = WIDTH_MIN + rand() * (WIDTH_MAX - WIDTH_MIN);
    const h = w * aspect;
    const col = columns.reduce((best, c, i) => (c.top < columns[best].top ? i : best), 0);
    const c = columns[col];
    const gap = GAP_MIN + rand() * (GAP_MAX - GAP_MIN);
    const item = { index, col, x: col + 0.5 + (rand() * 2 - 1) * X_JITTER, y: c.top + h / 2, w, h, z: 0 };
    c.top += h + gap;
    c.items.push(item);
    return item;
  });
  // A column repeats after its own stacked height (photos plus gaps), so the join
  // between its last photo and the next copy of its first is just another gap.
  const out = columns.map((c) => ({ height: c.top - c.start, lag: c.lag }));
  // Stacking order: shuffled (fixed by the seed), like the reference.
  const order = items.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((idx, z) => { items[idx].z = z + 1; });
  return { cols, tileW: cols, columns: out, items };
}

/** Column width in px for a section of the given size. */
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

/** Fraction of the way a trailing column catches up in dt ms (0 lag = all the way). */
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
  // Drag offset in columns, so a resize/rotation keeps the field where it was.
  const target = { x: 0, y: 0 };
  let shown = []; // per column: where it is drawn now (trails `target` by its lag)
  let u = U_MIN;
  let copiesX = 0;
  let copiesY = []; // per column
  let instances = []; // { img, item, cx, cy }
  let destroyed = false;

  const layer = doc.createElement('div');
  layer.className = 'photo-field-layer';
  section.append(layer);

  // How far outside the section a photo's centre may go before it wraps to the other
  // side: half its size plus WRAP_PAD columns, so it wraps well out of view even
  // during a fast flick (up to ~50px per frame).
  const marginX = () => (WIDTH_MAX / 2 + X_JITTER + WRAP_PAD) * u;
  const marginY = () => (Math.max(0, ...layout.items.map((it) => it.h)) / 2 + WRAP_PAD) * u;

  const build = () => {
    layer.replaceChildren();
    instances = [];
    for (let cx = 0; cx < copiesX; cx++) {
      for (const item of layout.items) {
        for (let cy = 0; cy < copiesY[item.col]; cy++) {
          const img = doc.createElement('img');
          img.className = 'photo-field-photo';
          img.src = list[item.index];
          img.alt = '';
          img.draggable = false;
          img.setAttribute('draggable', 'false');
          img.setAttribute('decoding', 'async');
          if (cx || cy) img.setAttribute('aria-hidden', 'true');
          img.style.zIndex = String(item.z);
          layer.append(img);
          instances.push({ img, item, cx, cy });
        }
      }
    }
  };

  const render = () => {
    const mx = marginX();
    const my = marginY();
    for (const { img, item, cx, cy } of instances) {
      const s = shown[item.col] || target;
      const x = instancePosition(item.x * u, cx, layout.tileW * u, s.x * u, copiesX, mx);
      const colH = layout.columns[item.col].height * u;
      const y = instancePosition(item.y * u + cx * COPY_SHIFT * colH, cy, colH, s.y * u, copiesY[item.col], my);
      img.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  };

  const measure = () => {
    if (!layout.items.length) return;
    const w = section.clientWidth;
    const h = section.clientHeight;
    u = photoUnit(w, h);
    const nextX = copiesNeeded(w, layout.tileW * u, marginX());
    const nextY = layout.columns.map((c) => copiesNeeded(h, c.height * u, marginY()));
    if (nextX !== copiesX || nextY.some((n, i) => n !== copiesY[i])) {
      copiesX = nextX;
      copiesY = nextY;
      build();
    }
    for (const { img, item } of instances) img.style.width = `${(item.w * u).toFixed(1)}px`;
    render();
  };

  // ---- Animation: columns ease toward the drag target; flicks glide ----
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
    layout.columns.forEach((c, i) => {
      const k = reduced ? 1 : catchUp(dt, c.lag);
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
      shown = layout.columns.map(() => ({ x: target.x, y: target.y }));
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
