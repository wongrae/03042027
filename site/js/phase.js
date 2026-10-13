// Pure phase logic (no DOM, no globals) so it can be unit-tested in Node.
// "now" is always an epoch-millisecond number; config dates are ISO strings
// with an explicit offset, so comparisons are time-zone independent.

export const PHASE_RSVP_OPEN = 1;
export const PHASE_RSVP_CLOSED = 2;
export const PHASE_WEDDING = 3;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Current phase: 1 before rsvpDeadline, 2 until weddingDate, 3 from weddingDate on. */
export function getPhase(nowMs, cfg) {
  const deadline = Date.parse(cfg.rsvpDeadline);
  const wedding = Date.parse(cfg.weddingDate);
  if (nowMs >= wedding) return PHASE_WEDDING;
  if (nowMs >= deadline) return PHASE_RSVP_CLOSED;
  return PHASE_RSVP_OPEN;
}

/** Time left until weddingDate as zero-padded strings: days (3 digits), hours, minutes. */
export function countdownParts(nowMs, cfg) {
  const left = Math.max(0, Date.parse(cfg.weddingDate) - nowMs);
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / MIN);
  return {
    days: String(days).padStart(3, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
  };
}

/** "123 : 04 : 20" */
export function formatCountdown(parts) {
  return `${parts.days} : ${parts.hours} : ${parts.minutes}`;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * The instant the page should treat as "now". On localhost/127.0.0.1 only, a
 * `?now=` query parameter overrides it (for previewing phases); anywhere else
 * the override is ignored. A date or datetime without an offset is read as
 * Singapore time. Falls back to `fallbackMs` when there is no valid override.
 */
export function resolveNow(location, fallbackMs) {
  if (!LOCAL_HOSTS.has(location.hostname)) return fallbackMs;
  const raw = new URLSearchParams(location.search).get('now');
  if (!raw) return fallbackMs;
  let iso = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += 'T00:00:00+08:00';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(iso)) iso += '+08:00';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? fallbackMs : ms;
}
