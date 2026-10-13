// Client for the Google Apps Script backend (see backend/Code.gs).
//
// Backend-reported outcomes come back as plain objects: {ok:true,...} or
// {ok:false, error:"not_found"|"closed"|"invalid"|"busy"|...}. Transport
// problems (no network, timeout, not a JSON reply, no API configured) throw an
// ApiError, so callers can show a retryable "couldn't reach us" message.
//
// POST bodies are sent as text/plain so the browser treats them as "simple"
// cross-origin requests (no CORS preflight, which Apps Script can't answer).
import { config } from './config.js';

export class ApiError extends Error {
  /** @param {'not_configured'|'network'|'timeout'|'bad_response'} code */
  constructor(code, message) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
  }
}

const API_OVERRIDE_KEY = 'rr.api';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Which backend URL to call. On localhost only, `?api=<url>` (remembered in
 * storage) points the site at a local mock backend (`npm run mock`); anywhere
 * else the configured `apiUrl` is always used.
 */
export function resolveApiUrl(location, storage, cfg = config) {
  if (LOCAL_HOSTS.has(location.hostname)) {
    try {
      const fromQuery = new URLSearchParams(location.search).get('api');
      if (fromQuery) {
        storage?.setItem(API_OVERRIDE_KEY, fromQuery);
        return fromQuery;
      }
      const stored = storage?.getItem(API_OVERRIDE_KEY);
      if (stored) return stored;
    } catch {
      // storage blocked: use the configured URL
    }
  }
  return cfg.apiUrl || '';
}

/**
 * @param {{ apiUrl: string, fetchFn?: typeof fetch, timeoutMs?: number }} options
 */
export function createApi({ apiUrl, fetchFn = globalThis.fetch, timeoutMs = 15000 }) {
  async function request(url, init) {
    if (!apiUrl) throw new ApiError('not_configured', 'No backend URL is configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchFn(url, { ...init, signal: controller.signal });
    } catch (err) {
      throw new ApiError(controller.signal.aborted ? 'timeout' : 'network', String(err?.message || err));
    } finally {
      clearTimeout(timer);
    }
    try {
      return await res.json();
    } catch {
      throw new ApiError('bad_response', 'The backend did not return JSON');
    }
  }

  const post = (body) =>
    request(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });

  return {
    /** Check surname + last 4 digits. → {ok, k, name, seats, open, response} | {ok:false, error} */
    verify: (surname, last4) => post({ action: 'verify', surname, last4 }),
    /** Look up an invitation by its remembered device code. */
    getInvitation: (k) => request(`${apiUrl}?action=get&k=${encodeURIComponent(k)}`, { method: 'GET' }),
    /** Save (create or replace) the invitation's RSVP. */
    save: (k, response) => post({ action: 'save', k, response }),
  };
}

/** The API for the current page (resolves the URL once, when first used). */
export function pageApi() {
  let storage;
  try {
    storage = globalThis.localStorage;
  } catch {
    storage = undefined;
  }
  return createApi({ apiUrl: resolveApiUrl(globalThis.location, storage) });
}
