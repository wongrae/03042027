// Drag-around photo field (the section below the swipe video): a dense wall of
// photos that visitors push around in any direction, repeating endlessly.
// After a flick it glides and slows to a stop; photos trail the drag by
// slightly different amounts for a subtle sense of depth, then settle back
// into the layout.
//
// Layout (modelled on the narrow-screen field of afterduskmedia.com): photos of
// different sizes scattered freely, with no rows or columns, packed so they
// cover most of the area and overlap only at their edges. Each keeps its own
// shape, so the field is densely filled and every photo stays mostly visible.
//
// How the endless repeat works: the photos fill one rectangular "tile" that
// repeats in both directions (each sideways repeat shifted half a tile down, so a
// photo's twin is never level with it). Each copy's position is wrapped, so a
// photo leaving one side re-enters from the other while it is off-screen.
//
// Touch: the section uses `touch-action: none`, so every drag on it moves the
// photos (the page is scrolled by swiping above or below the section, which is
// only ~75% of the screen tall). Vertical mouse-wheel scrolling is left to the page.
import { prefersReducedMotion } from './video-scrub.js';
import { releaseVelocity, decayVelocity, wheelPixels } from './swipe.js';

// The arrangement: same SEED = same layout on every visit. Change it to reshuffle.
export const SEED = 20270403;
// Photo unit ("u") = sqrt(section area) / DENSITY, kept between U_MIN and U_MAX px.
// An average photo has about the area of a u × u square. Lower DENSITY = bigger
// photos (fewer on screen). A phone shows about 2½ photos across.
export const DENSITY = 3.3;
export const U_MIN = 150;
export const U_MAX = 300;
// Photo size (the square root of its area, in u), picked at random in this range.
export const SIZE_MIN = 0.7;
export const SIZE_MAX = 1.25;
// How much photos may overlap: a strip this fraction of a photo's width (and
// height) along each edge may sit under or over a neighbour. Larger = more overlap
// and fewer gaps; the unit tests check every photo stays at least 60% visible.
export const EDGE = 0.05;
// Shape of the repeating tile (height / width): taller than wide, like a phone.
const TILE_SHAPE = 1.45;
// Stacking order: smaller photos mostly sit on top of bigger ones (so a big photo
// loses only edge strips); this much randomness mixes it up a little.
const Z_MIX = 0.15;
// Depth: each photo trails the drag by up to this many ms, then catches up.
const LAG_MAX_MS = 90;
// Glide after a flick: speed decays with this time constant (ms), like the swipe video.
const MOMENTUM_MS = 250;
const MIN_SPEED = 0.02; // px/ms
// One arrow-key press moves the field by this many u.
const KEY_STEP = 0.5;
// Each sideways repeat of the tile is shifted down by this fraction of its height,
// so a repeated photo never sits level with its twin.
export const COPY_SHIFT = 0.5;
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

/**
 * Offset from point a to the nearest repeat of point b. Tile copy m across sits
 * m tile widths right and m × shift down; copies down are a tile height apart.
 */
function nearestOffset(a, b, tileW, tileH, shift) {
  let best = null;
  for (let m = -1; m <= 1; m++) {
    const dx = b.x + m * tileW - a.x;
    let dy = b.y + m * shift - a.y;
    dy -= Math.round(dy / tileH) * tileH;
    if (!best || dx * dx + dy * dy < best.dx * best.dx + best.dy * best.dy) best = { dx, dy };
  }
  return best;
}

/**
 * Scattered layout, in units of u. `aspects[i]` is photo i's height / width.
 * Photos start at random spots in a tile that is too small for them, then are
 * pushed apart until only their edge strips (EDGE) overlap, the tile growing a
 * little whenever they don't fit. That leaves them tightly packed in no pattern.
 * @returns {{ tileW:number, tileH:number, shift:number,
 *   items: {index:number, x:number, y:number, w:number, h:number, z:number, lag:number}[] }}
 *   x, y are a photo's centre in the tile. The tile repeats every tileW across
 *   (each copy `shift` further down) and every tileH down.
 */
export function layoutField(aspects, seed = SEED) {
  const list = Array.isArray(aspects) ? aspects : [];
  if (!list.length) return { tileW: 0, tileH: 0, shift: 0, items: [] };
  const rand = mulberry32(seed);
  const items = list.map((a, index) => {
    const aspect = a > 0 && Number.isFinite(a) ? a : DEFAULT_ASPECT;
    const size = SIZE_MIN + rand() * (SIZE_MAX - SIZE_MIN);
    const w = size / Math.sqrt(aspect);
    const h = size * Math.sqrt(aspect);
    // cw, ch: the photo's core, which no other photo may cover
    return { index, x: 0, y: 0, w, h, z: 0, lag: rand() * LAG_MAX_MS, cw: w * (1 - 2 * EDGE), ch: h * (1 - 2 * EDGE) };
  });
  // Start with a tile only as big as the cores put together.
  const coreArea = items.reduce((t, it) => t + it.cw * it.ch, 0);
  let tileW = Math.sqrt(coreArea / TILE_SHAPE);
  let tileH = tileW * TILE_SHAPE;
  items.forEach((it) => { it.x = rand() * tileW; it.y = rand() * tileH; });
  const GROW = 1.004;
  for (let round = 0; round < 2000; round++) {
    let worst = 0;
    let stuck = null; // the smaller photo of the deepest overlap
    for (let pass = 0; pass < 80; pass++) {
      worst = 0;
      const shift = COPY_SHIFT * tileH;
      for (let a = 0; a < items.length; a++) {
        for (let b = a + 1; b < items.length; b++) {
          const i = items[a];
          const j = items[b];
          const { dx, dy } = nearestOffset(i, j, tileW, tileH, shift);
          const ox = (i.cw + j.cw) / 2 - Math.abs(dx);
          const oy = (i.ch + j.ch) / 2 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          if (Math.min(ox, oy) > worst) {
            worst = Math.min(ox, oy);
            stuck = i.cw * i.ch < j.cw * j.ch ? i : j;
          }
          // Push the two cores apart along the shorter overlap; the smaller photo moves more.
          const ai = i.cw * i.ch;
          const aj = j.cw * j.ch;
          const ki = aj / (ai + aj);
          const kj = ai / (ai + aj);
          if (ox < oy) {
            const sx = Math.sign(dx) || 1;
            i.x -= sx * ox * ki;
            j.x += sx * ox * kj;
          } else {
            const sy = Math.sign(dy) || 1;
            i.y -= sy * oy * ki;
            j.y += sy * oy * kj;
          }
        }
      }
      for (const it of items) { // back into the tile
        const m = Math.floor(it.x / tileW);
        it.x -= m * tileW;
        it.y -= m * shift;
        it.y -= Math.floor(it.y / tileH) * tileH;
      }
      if (worst < 1e-4) break;
    }
    if (worst < 1e-4) break;
    // Still overlapping: a photo wedged between others can't be pushed free, so
    // move it somewhere else, and make the tile a little bigger.
    stuck.x = rand() * tileW;
    stuck.y = rand() * tileH;
    tileW *= GROW;
    tileH *= GROW;
    items.forEach((it) => { it.x *= GROW; it.y *= GROW; });
  }
  // Stacking: bigger photos lower, smaller ones on top, mixed up a little.
  items
    .map((it) => ({ it, k: it.w * it.h * (1 - Z_MIX + rand() * 2 * Z_MIX) }))
    .sort((p, q) => q.k - p.k)
    .forEach(({ it }, z) => { it.z = z + 1; });
  return {
    tileW,
    tileH,
    shift: COPY_SHIFT * tileH,
    items: items.map(({ index, x, y, w, h, z, lag }) => ({ index, x, y, w, h, z, lag })),
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
          if (cx || cy) img.setAttribute('aria-hidden', 'true');
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
      const { x, y } = tilePosition(item, cx, cy, layout, u, shown[item.index] || target, copies, margin);
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
