// Scroll-reveal: elements marked [data-reveal] fade and rise into place the first
// time they scroll into view. Progressive enhancement: nothing is hidden unless this
// runs, and visitors who ask for reduced motion (or whose browser has no
// IntersectionObserver) just see everything, with no animation.

export function initReveal({ root = document, win = window } = {}) {
  const els = [...root.querySelectorAll('[data-reveal]')];
  const reduce = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!els.length || reduce || typeof win.IntersectionObserver !== 'function') {
    return { active: false };
  }

  const io = new win.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    // Wait until a little of the element is on screen, and a bit above the bottom edge.
    { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
  );

  root.documentElement.classList.add('reveal-on');
  els.forEach((el) => io.observe(el));
  return { active: true, destroy: () => io.disconnect() };
}
