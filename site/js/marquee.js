// Gallery teaser filmstrip: duplicates the photo set once for a seamless CSS
// loop, and pauses it while a finger is down or focus is inside it. (Mouse
// hover-pause and the reduced-motion behaviour are handled in base.css.)

export function setupMarquee(root) {
  const track = root.querySelector('.marquee-track');
  if (!track) return;

  // Seamless loop: append one aria-hidden, unfocusable copy of every item.
  for (const item of [...track.children]) {
    const clone = item.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('tabindex', '-1');
    clone.querySelectorAll('img').forEach((img) => img.setAttribute('alt', ''));
    track.append(clone);
  }

  const wrap = root.querySelector('.marquee-wrap');
  const pause = () => wrap.classList.add('paused');
  const resume = () => wrap.classList.remove('paused');

  // Touch: paused while pressed, resumes on release.
  wrap.addEventListener('touchstart', pause, { passive: true });
  wrap.addEventListener('touchend', resume);
  wrap.addEventListener('touchcancel', resume);

  // Keyboard: paused while a photo link has focus.
  wrap.addEventListener('focusin', pause);
  wrap.addEventListener('focusout', resume);
}
