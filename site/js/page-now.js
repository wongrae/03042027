// "Now" for the current page: the server-corrected clock, plus the localhost-only
// ?now= preview (remembered for the browser session so it carries between pages).
import { resolveNow } from './phase.js';

export function pageNowMs(clock) {
  let storage;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = undefined;
  }
  return resolveNow(window.location, clock.now(), storage);
}
