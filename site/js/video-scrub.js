// Shared video handling for the scrubbed videos (hero and swipe section): a
// muted, inline video whose frame glides toward a progress value (0..1) that
// the caller supplies, instead of playing on its own.
//
// For smooth *reverse* scrubbing the video should be encoded with every frame
// a keyframe (see README: ffmpeg … -g 1).

// How quickly the shown frame catches up with the target (0..1 per animation frame).
const GLIDE = 0.15;

/**
 * Creates the video and starts following `progress()`. Call `schedule()` whenever
 * the progress may have changed (scroll, swipe, resize…).
 * @param {{ src: string, poster?: string|null, win: Window, progress: () => number,
 *           onMeta?: (video: HTMLVideoElement) => void, onFail?: () => void }} options
 * @returns {{ video: HTMLVideoElement, schedule: () => void, destroy: () => void }}
 */
export function createScrubVideo({ src, poster = null, win, progress, onMeta, onFail }) {
  const video = win.document.createElement('video');
  video.className = 'scrub-video';
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
  if (poster) video.poster = poster;

  let raf = 0;
  let destroyed = false;
  let lastTime = -1;
  let shown = -1; // the time the video is gliding through (-1 = not started)

  function update() {
    raf = 0;
    if (destroyed) return;
    const d = video.duration;
    if (!Number.isFinite(d) || d <= 0) return; // metadata not ready yet
    const target = progress() * d;
    // Glide toward the target so a quick flick doesn't jump the video.
    if (shown < 0 || Math.abs(target - shown) < 0.02) shown = target;
    else shown += (target - shown) * GLIDE;
    if (Math.abs(shown - lastTime) > 1e-4) {
      lastTime = shown;
      video.currentTime = shown;
    }
    if (shown !== target) schedule();
  }
  const schedule = () => {
    if (!raf && !destroyed) raf = win.requestAnimationFrame(update);
  };

  // iOS Safari won't load or show a video's frames until it has been "played" once, even
  // muted and inline, so start and immediately pause it (retried on the first touch for
  // Low Power Mode, where autoplay is blocked).
  const prime = () => {
    try {
      const p = video.play();
      if (p && p.then) p.then(() => video.pause()).catch(() => {});
      else video.pause();
    } catch {
      /* ignore */
    }
  };
  const onLoadedMeta = () => {
    onMeta?.(video);
    prime();
    schedule();
  };
  const onReady = () => {
    video.classList.add('ready');
    schedule();
  };
  const onFirstTouch = () => {
    prime();
    win.removeEventListener('touchstart', onFirstTouch);
  };
  const onError = () => onFail?.();

  video.addEventListener('loadedmetadata', onLoadedMeta);
  video.addEventListener('loadeddata', onReady);
  video.addEventListener('canplay', onReady);
  video.addEventListener('durationchange', schedule);
  video.addEventListener('error', onError);
  win.addEventListener('touchstart', onFirstTouch, { passive: true });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (raf) win.cancelAnimationFrame(raf);
    win.removeEventListener('touchstart', onFirstTouch);
    video.remove();
  }

  return { video, schedule, destroy };
}

export function prefersReducedMotion(win = globalThis.window) {
  try {
    return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
