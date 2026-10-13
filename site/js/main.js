// Landing page: picks the phase and mounts the matching floating pill and
// gallery teaser. Nothing for another phase is ever put in the DOM (so in
// Phases 1/2 the gallery photos aren't even requested).
import { config } from './config.js';
import { getPhase, countdownParts, formatCountdown } from './phase.js';
import { syncClock } from './clock.js';
import { pageNowMs } from './page-now.js';
import { setupMarquee } from './marquee.js';
import { initHero } from './hero.js';

const pillSlot = document.getElementById('pill-slot');
const gallerySlot = document.getElementById('gallery-slot');

const clone = (id) => document.getElementById(id).content.cloneNode(true);

let clock = { now: Date.now };
let mountedPhase = null;
let countdownEl = null;

const nowMs = () => pageNowMs(clock);

function mount(phase) {
  pillSlot.replaceChildren();
  gallerySlot.replaceChildren();
  countdownEl = null;

  if (phase === 1) {
    pillSlot.append(clone('tpl-pill-rsvp'));
  } else if (phase === 2) {
    pillSlot.append(clone('tpl-pill-countdown'));
    countdownEl = pillSlot.querySelector('[data-countdown]');
  } else {
    // Phase 3: no pill at all; show the gallery teaser.
    gallerySlot.append(clone('tpl-gallery'));
    setupMarquee(gallerySlot);
  }
  mountedPhase = phase;
}

function render() {
  const now = nowMs();
  const phase = getPhase(now, config);
  if (phase !== mountedPhase) mount(phase);
  if (countdownEl) countdownEl.textContent = formatCountdown(countdownParts(now, config));
}

// Re-render on each minute boundary so the countdown stays current and the
// phase flips on its own if the page is left open across a deadline.
function tick() {
  render();
  const msToNextMinute = 60000 - (clock.now() % 60000);
  setTimeout(tick, msToNextMinute + 50);
}

// Hero scroll-scrub (no-op until config.heroVideo is set, or for reduced-motion visitors).
initHero({ src: config.heroVideo });

(async () => {
  clock = await syncClock({ timeoutMs: 2000 });
  tick();
})();
