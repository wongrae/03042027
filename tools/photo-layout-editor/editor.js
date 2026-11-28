// Photo field layout editor (local only; served by scripts/serve.mjs at /__layout-editor/).
// Arrange the photos by hand in one repeating "pattern" frame, then Save, which
// writes site/js/photo-layout.js. The site then shows this layout instead of the
// automatic one.
import { config } from '/js/config.js';
import { photoLayout } from '/js/photo-layout.js';
import { layoutField, BLOCK } from '/js/photo-field.js';

const M = 240; // stage margin around the pattern frame, px (shows the repeats around it)
const MIN_W = 20;
const DEFAULT_W = 160; // a new photo's width, about an average afterdusk photo on a phone
const PHONE = { w: 375, h: 500 }; // the section on a typical phone (75% of the screen height)
const LOW_VISIBLE = 0.4;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const main = $('main');
const siteUrl = (src) => new URL(src, `${location.origin}/`).href;
const mod = (v, p) => ((v % p) + p) % p;
const round = (v) => Math.round(v * 10) / 10;

let state = { width: 400, height: 1600, shift: 800, photos: [] };
let nextId = 1;
let selected = null; // photo id
let zoom = 1;
let dirty = false;
let history = [];
let low = new Set(); // ids of photos that are mostly hidden
const phone = { x: 0, y: 0 };
const aspects = new Map(); // src → height / width

// ---------- loading ----------

const allPhotos = [...new Set([...(config.photoField || []), ...((photoLayout?.photos || []).map((p) => p.src))])];

function loadAspect(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight / img.naturalWidth);
    img.onerror = () => resolve(NaN);
    img.src = siteUrl(src);
  });
}

function fromAutomatic() {
  const list = (config.photoField || []).filter((src) => aspects.get(src) > 0);
  const l = layoutField(list.map((src) => aspects.get(src)));
  const k = BLOCK.unit;
  return {
    width: round(l.tileW * k),
    height: round(l.tileH * k),
    shift: round(l.shift * k),
    photos: l.items.map((it) => ({ id: nextId++, src: list[it.index], x: round(it.x * k), y: round(it.y * k), w: round(it.w * k), z: it.z })),
  };
}

function fromSaved(saved) {
  return {
    width: saved.width,
    height: saved.height,
    shift: saved.shift || 0,
    photos: saved.photos.map((p) => ({ id: nextId++, src: p.src, x: p.x, y: p.y, w: p.w, z: p.z || 0 })),
  };
}

// ---------- history ----------

const snapshot = () => JSON.stringify(state);
function commit() {
  normaliseAll();
  history.push(snapshot());
  if (history.length > 200) history.shift();
  dirty = true;
  setStatus('');
  render();
  scheduleStats();
}
function undo() {
  if (history.length < 2) return;
  history.pop();
  state = JSON.parse(history[history.length - 1]);
  if (!state.photos.some((p) => p.id === selected)) selected = null;
  dirty = true;
  render();
  scheduleStats();
}

// ---------- geometry ----------

const aspectOf = (p) => aspects.get(p.src) || 1.25;
const heightOf = (p) => p.w * aspectOf(p);

/** Moves a photo's centre back into the frame (across whole frames), keeping how it looks. */
function normalise(p) {
  const turns = Math.floor(p.x / state.width);
  p.x = round(p.x - turns * state.width);
  p.y = round(mod(p.y - turns * state.shift, state.height));
  p.w = round(Math.max(MIN_W, p.w));
}
function normaliseAll() { state.photos.forEach(normalise); }

/** Stacking order: by layer, then list order. Renumbers z as 1..n. */
function ordered() {
  return state.photos.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z || a.i - b.i).map((o) => o.p);
}
function renumber(list = ordered()) { list.forEach((p, i) => { p.z = i + 1; }); }

/** Every copy of every photo that can show on the stage: {p, m, n, left, top, w, h}. */
function copies() {
  const W = state.width, H = state.height, S = state.shift;
  const out = [];
  const nMax = Math.ceil((M * 2) / H) + 2;
  for (const p of state.photos) {
    const w = p.w, h = heightOf(p);
    for (let m = -1; m <= 1; m++) {
      for (let n = -nMax; n <= nMax; n++) {
        const left = M + p.x + m * W - w / 2;
        const top = M + p.y + m * S + n * H - h / 2;
        if (left > W + 2 * M || left + w < 0 || top > H + 2 * M || top + h < 0) continue;
        out.push({ p, m, n, left, top, w, h });
      }
    }
  }
  return out;
}

// ---------- rendering ----------

const els = new Map(); // key → img
let frameEl, handleEl, phoneEl, sizer;

function setupStage() {
  sizer = document.createElement('div');
  stage.parentNode.insertBefore(sizer, stage);
  sizer.append(stage);
  frameEl = document.createElement('div');
  frameEl.className = 'frame';
  handleEl = document.createElement('div');
  handleEl.className = 'handle';
  handleEl.title = 'Drag to resize';
  phoneEl = document.createElement('div');
  phoneEl.className = 'phone';
  phoneEl.innerHTML = '<div class="grip" title="Drag to move the phone screen">Phone screen ✥</div>';
  stage.append(frameEl, handleEl, phoneEl);
}

function render() {
  const W = state.width, H = state.height;
  stage.style.width = `${W + 2 * M}px`;
  stage.style.height = `${H + 2 * M}px`;
  stage.style.transform = `scale(${zoom})`;
  sizer.style.width = `${(W + 2 * M) * zoom}px`;
  sizer.style.height = `${(H + 2 * M) * zoom}px`;
  frameEl.style.cssText = `left:${M - 2}px; top:${M - 2}px; width:${W + 4}px; height:${H + 4}px;`;

  const layer = new Map(ordered().map((p, i) => [p.id, i + 1]));
  const keep = new Set();
  for (const c of copies()) {
    const live = c.m === 0 && c.n === 0;
    const key = `${c.p.id}:${c.m}:${c.n}`;
    keep.add(key);
    let img = els.get(key);
    if (!img) {
      img = document.createElement('img');
      img.draggable = false;
      img.alt = '';
      els.set(key, img);
      stage.append(img);
    }
    if (img.dataset.src !== c.p.src) { img.src = siteUrl(c.p.src); img.dataset.src = c.p.src; }
    img.dataset.id = c.p.id;
    img.className = live ? `live${c.p.id === selected ? ' sel' : ''}${low.has(c.p.id) && c.p.id !== selected ? ' low' : ''}` : 'ghost';
    img.title = live ? `${c.p.src.split('/').pop()}${low.has(c.p.id) ? ' (mostly hidden)' : ''}` : '';
    img.style.cssText = `left:${c.left}px; top:${c.top}px; width:${c.w}px; height:${c.h}px; z-index:${layer.get(c.p.id)};`;
  }
  for (const [key, img] of els) if (!keep.has(key)) { img.remove(); els.delete(key); }

  const sel = state.photos.find((p) => p.id === selected);
  handleEl.hidden = !sel;
  if (sel) {
    handleEl.style.left = `${M + sel.x + sel.w / 2}px`;
    handleEl.style.top = `${M + sel.y + heightOf(sel) / 2}px`;
  }
  phoneEl.hidden = !$('showPhone').checked;
  Object.assign(phoneEl.style, { left: `${M + phone.x}px`, top: `${M + phone.y}px`, width: `${PHONE.w}px`, height: `${PHONE.h}px` });
  stage.classList.toggle('solid', $('solid').checked);

  renderPanel(sel);
  renderTray();
}

function renderPanel(sel) {
  $('selNone').hidden = !!sel;
  $('selTools').hidden = !sel;
  if (sel && document.activeElement !== $('selW')) $('selW').value = Math.round(sel.w);
  for (const [id, key] of [['frameW', 'width'], ['frameH', 'height'], ['frameShift', 'shift']]) {
    if (document.activeElement !== $(id)) $(id).value = state[key];
  }
  $('undo').disabled = history.length < 2;
}

function renderTray() {
  const tray = $('tray');
  if (!tray.children.length) {
    for (const src of allPhotos) {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = `Add ${src.split('/').pop()}`;
      b.dataset.src = src;
      b.innerHTML = `<img alt="" src="${siteUrl(src)}"><span class="count"></span>`;
      b.addEventListener('click', () => addPhoto(src));
      tray.append(b);
    }
  }
  for (const b of tray.children) {
    const n = state.photos.filter((p) => p.src === b.dataset.src).length;
    const badge = b.querySelector('.count');
    badge.textContent = n;
    badge.dataset.n = n;
  }
}

// ---------- check (coverage and visibility) ----------

let statsTimer = 0;
function scheduleStats() {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(stats, 250);
}
function stats() {
  const W = state.width, H = state.height, step = 4;
  const rank = new Map(ordered().map((p, i) => [p.id, i]));
  const rects = copies().map((c) => ({ id: c.p.id, z: rank.get(c.p.id), x0: c.left - M, x1: c.left - M + c.w, y0: c.top - M, y1: c.top - M + c.h }));
  const top = new Map(), area = new Map();
  let covered = 0, total = 0;
  for (let x = step / 2; x < W; x += step) {
    for (let y = step / 2; y < H; y += step) {
      total++;
      let best = null;
      for (const r of rects) {
        if (x < r.x0 || x >= r.x1 || y < r.y0 || y >= r.y1) continue;
        area.set(r.id, (area.get(r.id) || 0) + 1);
        if (!best || r.z > best.z) best = r;
      }
      if (best) { covered++; top.set(best.id, (top.get(best.id) || 0) + 1); }
    }
  }
  low = new Set();
  let worst = null;
  for (const p of state.photos) {
    const v = (top.get(p.id) || 0) / (area.get(p.id) || 1);
    if (v < LOW_VISIBLE) low.add(p.id);
    if (!worst || v < worst.v) worst = { p, v };
  }
  const unplaced = allPhotos.filter((src) => !state.photos.some((p) => p.src === src)).length;
  $('stats').innerHTML = [
    `${state.photos.length} photos placed${unplaced ? `, <span class="warn">${unplaced} not placed</span>` : ''}`,
    `${total ? Math.round((covered / total) * 100) : 0}% of the area covered (afterdusk: about 92%)`,
    worst ? `Least visible: ${worst.p.src.split('/').pop()}, ${Math.round(worst.v * 100)}% showing${worst.v < LOW_VISIBLE ? ' <span class="warn">(mostly hidden: red dashed outline)</span>' : ''}` : '',
  ].filter(Boolean).join('<br>');
  render();
}

// ---------- editing ----------

function viewCentre() {
  const r = stage.getBoundingClientRect();
  const m = main.getBoundingClientRect();
  return { x: ((m.left + m.width / 2) - r.left) / zoom - M, y: ((m.top + m.height / 2) - r.top) / zoom - M };
}

function addPhoto(src) {
  const c = viewCentre();
  const p = { id: nextId++, src, x: c.x, y: c.y, w: DEFAULT_W, z: Math.max(0, ...state.photos.map((q) => q.z)) + 1 };
  state.photos.push(p);
  selected = p.id;
  commit();
}

function selectedPhoto() { return state.photos.find((p) => p.id === selected); }

function moveLayer(how) {
  const p = selectedPhoto();
  if (!p) return;
  const list = ordered();
  const i = list.indexOf(p);
  list.splice(i, 1);
  const to = { back: 0, backward: Math.max(0, i - 1), forward: Math.min(list.length, i + 1), front: list.length }[how];
  list.splice(to, 0, p);
  renumber(list);
  commit();
}

function duplicate() {
  const p = selectedPhoto();
  if (!p) return;
  const q = { ...p, id: nextId++, x: p.x + 24, y: p.y + 24, z: Math.max(...state.photos.map((r) => r.z)) + 1 };
  state.photos.push(q);
  selected = q.id;
  commit();
}

function removeSelected() {
  const i = state.photos.findIndex((p) => p.id === selected);
  if (i < 0) return;
  state.photos.splice(i, 1);
  selected = null;
  commit();
}

// ---------- pointer ----------

let drag = null;
const toFrame = (e) => {
  const r = stage.getBoundingClientRect();
  return { x: (e.clientX - r.left) / zoom - M, y: (e.clientY - r.top) / zoom - M };
};
let raf = 0;
const renderSoon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const at = toFrame(e);
  if (e.target.classList.contains('grip')) {
    drag = { kind: 'phone', start: at, from: { ...phone } };
  } else if (e.target === handleEl && selectedPhoto()) {
    const p = selectedPhoto();
    drag = { kind: 'resize', p, start: at, from: p.w };
  } else if (e.target.classList.contains('live')) {
    const p = state.photos.find((q) => String(q.id) === e.target.dataset.id);
    selected = p.id;
    drag = { kind: 'move', p, start: at, from: { x: p.x, y: p.y } };
    render();
  } else {
    if (selected !== null) { selected = null; render(); }
    return;
  }
  drag.moved = false;
  stage.setPointerCapture(e.pointerId);
  e.preventDefault();
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const at = toFrame(e);
  const dx = at.x - drag.start.x, dy = at.y - drag.start.y;
  if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
  if (drag.kind === 'move') {
    drag.p.x = drag.from.x + dx;
    drag.p.y = drag.from.y + dy;
  } else if (drag.kind === 'resize') {
    // follow the pointer along the photo's diagonal
    const a = aspectOf(drag.p);
    drag.p.w = Math.max(MIN_W, drag.from + (dx + dy * a) / (1 + a * a) * 2);
  } else if (drag.kind === 'phone') {
    phone.x = drag.from.x + dx;
    phone.y = drag.from.y + dy;
  }
  renderSoon();
});
const endDrag = () => {
  if (!drag) return;
  const was = drag;
  drag = null;
  if (was.moved && was.kind !== 'phone') commit();
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

// ---------- keyboard ----------

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
  const p = selectedPhoto();
  if (!p) return;
  const step = e.shiftKey ? 10 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) {
    e.preventDefault();
    p.x += moves[e.key][0];
    p.y += moves[e.key][1];
    commit();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    removeSelected();
  } else if (e.key === '[') {
    moveLayer('backward');
  } else if (e.key === ']') {
    moveLayer('forward');
  } else if (e.key === 'Escape') {
    selected = null;
    render();
  }
});

// ---------- panel controls ----------

$('selW').addEventListener('change', () => {
  const p = selectedPhoto();
  const v = Number($('selW').value);
  if (p && v >= MIN_W) { p.w = v; commit(); }
});
$('toBack').addEventListener('click', () => moveLayer('back'));
$('backward').addEventListener('click', () => moveLayer('backward'));
$('forward').addEventListener('click', () => moveLayer('forward'));
$('toFront').addEventListener('click', () => moveLayer('front'));
$('dup').addEventListener('click', duplicate);
$('remove').addEventListener('click', removeSelected);
for (const [id, key, min] of [['frameW', 'width', 100], ['frameH', 'height', 100], ['frameShift', 'shift', -20000]]) {
  $(id).addEventListener('change', () => {
    const v = Number($(id).value);
    if (Number.isFinite(v) && v >= min) { state[key] = v; commit(); } else render();
  });
}
$('zoom').addEventListener('change', () => { zoom = Number($('zoom').value); render(); });
$('showPhone').addEventListener('change', render);
$('solid').addEventListener('change', render);
$('undo').addEventListener('click', undo);

// Buttons that replace everything ask for a second click.
function confirmClick(button, label, action) {
  let armed = false;
  let timer = 0;
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = 'Click again to confirm';
      timer = setTimeout(() => { armed = false; button.textContent = label; }, 3000);
      return;
    }
    clearTimeout(timer);
    armed = false;
    button.textContent = label;
    action();
  });
}
confirmClick($('fromAuto'), 'Start from automatic', () => {
  const auto = fromAutomatic();
  state = auto;
  selected = null;
  commit();
});
confirmClick($('clearAll'), 'Remove all', () => {
  state.photos = [];
  selected = null;
  commit();
});
confirmClick($('useAuto'), 'Switch site back to automatic', () => save(null));

// ---------- saving ----------

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').className = kind;
}

function exportLayout() {
  renumber();
  return {
    width: state.width,
    height: state.height,
    shift: state.shift,
    photos: ordered().map(({ src, x, y, w, z }) => ({ src, x, y, w, z })),
  };
}

async function save(layout = exportLayout()) {
  setStatus('Saving…');
  try {
    const res = await fetch('./save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(body.error || `The server said ${res.status}.`);
    dirty = false;
    setStatus(layout
      ? 'Saved to site/js/photo-layout.js. Open the site preview (/) to see it, then commit and push to publish.'
      : 'The site is back on the automatic arrangement (site/js/photo-layout.js). Commit and push to publish.', 'ok');
  } catch (err) {
    setStatus(`Not saved: ${err.message} Is "npm run serve" still running?`, 'err');
  }
}
$('save').addEventListener('click', () => save());

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

// ---------- start ----------

setupStage();
const shapes = await Promise.all(allPhotos.map(loadAspect));
allPhotos.forEach((src, i) => aspects.set(src, shapes[i]));
state = photoLayout?.photos?.length ? fromSaved(photoLayout) : fromAutomatic();
history = [snapshot()];
render();
stats();
main.scrollTo({ left: (M - 40) * zoom, top: (M - 40) * zoom });
setStatus(photoLayout?.photos?.length ? 'Loaded your saved layout.' : 'Started from the automatic (afterdusk) arrangement. Move things around, then Save.');
