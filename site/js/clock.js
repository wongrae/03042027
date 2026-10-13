// Trusted "now": the current time according to the web server that delivered
// the page (HTTP `Date` header, always GMT), so a wrong device clock can't show
// a visitor the wrong phase. Falls back to the device clock if the server time
// can't be read. GMT vs. the +08:00 config dates doesn't matter: both are exact
// instants.
//
// Known limitation: if a CDN serves a cached response, its Date header can lag
// real time by up to the cache lifetime (GitHub Pages: ~10 minutes). That only
// shifts a phase change by minutes; the backend enforces the RSVP deadline on
// its own clock regardless.

// Earliest plausible server time, to reject garbage headers (e.g. 1970).
const MIN_PLAUSIBLE_MS = Date.parse('2024-01-01T00:00:00Z');

/** Parse an HTTP `Date` header into epoch ms, or null if missing/invalid/implausible. */
export function parseServerDate(header) {
  if (!header) return null;
  const ms = Date.parse(header);
  if (Number.isNaN(ms) || ms < MIN_PLAUSIBLE_MS) return null;
  return ms;
}

/**
 * Offset (ms) to add to the device clock to get server time. The header has
 * 1-second resolution (truncated), so add half a second to centre the error,
 * and measure against the midpoint of the request to cancel out latency.
 */
export function computeOffset(serverMs, requestStartMs, requestEndMs) {
  return serverMs + 500 - (requestStartMs + requestEndMs) / 2;
}

/**
 * Ask the page's own origin for the time. Always resolves: on any failure the
 * offset is 0 (device clock) and `synced` is false.
 * @returns {{ now: () => number, offsetMs: number, synced: boolean }}
 */
export async function syncClock({
  fetchFn = globalThis.fetch,
  nowFn = Date.now,
  url = './',
  timeoutMs = 3000,
} = {}) {
  let offsetMs = 0;
  let synced = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = nowFn();
    const res = await fetchFn(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    const end = nowFn();
    clearTimeout(timer);
    const serverMs = parseServerDate(res?.headers?.get?.('date'));
    if (serverMs !== null) {
      offsetMs = computeOffset(serverMs, start, end);
      synced = true;
    }
  } catch {
    // network error / timeout / no fetch: keep the device clock
  }
  return { now: () => nowFn() + offsetMs, offsetMs, synced };
}

/** Convenience: sync once and return the corrected "now" in epoch ms. */
export async function serverNow(options) {
  return (await syncClock(options)).now();
}
