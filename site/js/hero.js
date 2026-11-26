// Hero scroll-scrubbing: the hero becomes a tall scroll section with a pinned
// (sticky) full-viewport stage, and the video's frame follows scroll position
// in both directions (no autoplay). Does nothing — leaving the static still
// layout exactly as designed — when no video is configured, the visitor asked
// for reduced motion, or the browser can't pin the stage / play the video.
import { createScrubVideo, prefersReducedMotion } from './video-scrub.js';

// How much scrolling each second of video gets (in viewport heights, as a %), and the
// bounds on the whole scroll track. 14s of video -> 100 + 14*40 = 660vh, so one swipe
// moves the video a second or two instead of the whole clip.
const SCROLL_VH_PER_SECOND = 40;
const MIN_TRACK_VH = 250;
const MAX_TRACK_VH = 700;

/** Height of the hero's scroll track, in vh, for a video of this length. */
export function trackVh(duration) {
  if (!(duration > 0)) return MIN_TRACK_VH;
  return Math.min(MAX_TRACK_VH, Math.max(MIN_TRACK_VH, Math.round(100 + duration * SCROLL_VH_PER_SECOND)));
}

/** Scroll progress 0..1 through the hero's scroll track (0 = top of hero at the viewport top). */
export function scrollProgress(trackTop, trackHeight, stageHeight) {
  const distance = trackHeight - stageHeight;
  if (!(distance > 0)) return 0;
  return Math.min(1, Math.max(0, -trackTop / distance));
}

export function canScrub(win = globalThis.window) {
  try {
    if (!win) return false;
    if (prefersReducedMotion(win)) return false;
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

  const progress = () => scrollProgress(hero.getBoundingClientRect().top, hero.offsetHeight, stage.offsetHeight);

  const scrub = createScrubVideo({
    src,
    poster: stillImg?.getAttribute('src'),
    win,
    progress,
    onMeta: (video) => {
      hero.style.height = trackVh(video.duration) + 'vh';
    },
    onFail: () => destroy(), // fall back to the static still
  });
  (stillImg ? stillImg.after.bind(stillImg) : stage.prepend.bind(stage))(scrub.video);

  win.addEventListener('scroll', scrub.schedule, { passive: true });
  win.addEventListener('resize', scrub.schedule);
  scrub.schedule();

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    scrub.destroy();
    win.removeEventListener('scroll', scrub.schedule);
    win.removeEventListener('resize', scrub.schedule);
    hero.style.height = '';
    hero.classList.remove('hero-scrub');
    hero.replaceChildren(...originalChildren);
  }

  return { active: true, progress, destroy };
}
