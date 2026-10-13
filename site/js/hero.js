// Hero scroll-scrubbing: the hero becomes a tall scroll section with a pinned
// (sticky) full-viewport stage, and the video's frame follows scroll position
// in both directions (no autoplay). Does nothing — leaving the static still
// layout exactly as designed — when no video is configured, the visitor asked
// for reduced motion, or the browser can't pin the stage / play the video.
//
// For smooth *reverse* scrubbing the video should be encoded with every frame
// a keyframe (see README: ffmpeg … -g 1).

/** Scroll progress 0..1 through the hero's scroll track (0 = top of hero at the viewport top). */
export function scrollProgress(trackTop, trackHeight, stageHeight) {
  const distance = trackHeight - stageHeight;
  if (!(distance > 0)) return 0;
  return Math.min(1, Math.max(0, -trackTop / distance));
}

export function canScrub(win = globalThis.window) {
  try {
    if (!win) return false;
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    // Sticky pinning needs ancestors that don't create a scroll container (overflow-x:clip).
    return !!win.CSS?.supports?.('overflow-x', 'clip');
  } catch {
    return false;
  }
}

/**
 * @param {{ src: string|null, hero?: HTMLElement|null, win?: Window }} options
 * @returns {{ active: boolean, progress: () => number, destroy: () => void }}
 */
export function initHero({ src, hero = document.getElementById('hero'), win = window } = {}) {
  const inactive = { active: false, progress: () => 0, destroy() {} };
  if (!src || !hero || !canScrub(win)) return inactive;

  const doc = hero.ownerDocument;
  const stillImg = hero.querySelector('#hero-still');
  const originalChildren = [...hero.childNodes];

  // Pin the existing hero content inside a sticky stage and make the hero tall.
  const stage = doc.createElement('div');
  stage.className = 'hero-stage';
  stage.append(...originalChildren);
  hero.append(stage);
  hero.classList.add('hero-scrub');

  const video = doc.createElement('video');
  video.className = 'hero-video';
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('disablepictureinpicture', '');
  video.tabIndex = -1;
  video.src = src;
  if (stillImg) video.poster = stillImg.getAttribute('src');
  (stillImg ? stillImg.after.bind(stillImg) : stage.prepend.bind(stage))(video);

  let raf = 0;
  let destroyed = false;
  let lastTime = -1;

  const progress = () => scrollProgress(hero.getBoundingClientRect().top, hero.offsetHeight, stage.offsetHeight);

  function update() {
    raf = 0;
    if (destroyed) return;
    const d = video.duration;
    if (!Number.isFinite(d) || d <= 0) return; // metadata not ready yet
    const t = progress() * d;
    if (Math.abs(t - lastTime) > 1e-4) {
      lastTime = t;
      video.currentTime = t;
    }
  }
  const schedule = () => {
    if (!raf && !destroyed) raf = win.requestAnimationFrame(update);
  };

  const onReady = () => {
    video.classList.add('ready');
    schedule();
  };
  const onFail = () => destroy(); // fall back to the static still

  video.addEventListener('loadeddata', onReady);
  video.addEventListener('durationchange', schedule);
  video.addEventListener('error', onFail);
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule);
  schedule();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (raf) win.cancelAnimationFrame(raf);
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    video.remove();
    hero.classList.remove('hero-scrub');
    hero.replaceChildren(...originalChildren);
  }

  return { active: true, progress, destroy };
}
