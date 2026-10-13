import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError, resolveApiUrl } from '../site/js/api.js';

const URL_ = 'https://script.google.com/macros/s/ABC/exec';
const jsonResponse = (obj) => ({ json: async () => obj });
const recorder = (reply) => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return typeof reply === 'function' ? reply(url, init) : jsonResponse(reply);
  };
  return { calls, fetchFn };
};

test('verify POSTs the surname and digits as simple text/plain JSON', async () => {
  const { calls, fetchFn } = recorder({ ok: true, k: 'abcdefghijkl', name: 'Alex', seats: 2, open: true, response: null });
  const out = await createApi({ apiUrl: URL_, fetchFn }).verify('Tan', '4567');
  assert.equal(out.ok, true);
  assert.equal(calls[0].url, URL_);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'text/plain;charset=utf-8'); // no preflight
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'verify', surname: 'Tan', last4: '4567' });
  assert.deepEqual(Object.keys(calls[0].init.headers), ['Content-Type']); // nothing that triggers a preflight
});

test('save POSTs the code and response', async () => {
  const { calls, fetchFn } = recorder({ ok: true });
  const response = { attending: true, partySize: 2, dietary: '', parking: null, wishes: '' };
  await createApi({ apiUrl: URL_, fetchFn }).save('abcdefghijkl', response);
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'save', k: 'abcdefghijkl', response });
});

test('getInvitation GETs with the code URL-encoded', async () => {
  const { calls, fetchFn } = recorder({ ok: true });
  await createApi({ apiUrl: URL_, fetchFn }).getInvitation('a b&c');
  assert.equal(calls[0].url, `${URL_}?action=get&k=a%20b%26c`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
});

test('backend-reported errors are returned, not thrown', async () => {
  for (const reply of [{ ok: false, error: 'not_found' }, { ok: false, error: 'closed' }, { ok: false, error: 'invalid', fields: { partySize: 'x' } }]) {
    const { fetchFn } = recorder(reply);
    assert.deepEqual(await createApi({ apiUrl: URL_, fetchFn }).verify('a', '1234'), reply);
  }
});

test('a network failure throws ApiError("network")', async () => {
  const fetchFn = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(createApi({ apiUrl: URL_, fetchFn }).verify('a', '1234'), (e) => e instanceof ApiError && e.code === 'network');
});

test('a hung request throws ApiError("timeout")', async () => {
  const fetchFn = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
  await assert.rejects(createApi({ apiUrl: URL_, fetchFn, timeoutMs: 20 }).verify('a', '1234'), (e) => e instanceof ApiError && e.code === 'timeout');
});

test('a non-JSON reply (e.g. a Google error page) throws ApiError("bad_response")', async () => {
  const fetchFn = async () => ({ json: async () => { throw new SyntaxError('Unexpected token <'); } });
  await assert.rejects(createApi({ apiUrl: URL_, fetchFn }).getInvitation('abcdefghijkl'), (e) => e instanceof ApiError && e.code === 'bad_response');
});

test('no configured URL throws ApiError("not_configured") without calling fetch', async () => {
  const { calls, fetchFn } = recorder({ ok: true });
  await assert.rejects(createApi({ apiUrl: '', fetchFn }).verify('a', '1234'), (e) => e instanceof ApiError && e.code === 'not_configured');
  assert.equal(calls.length, 0);
});

// --- which URL the page uses
const store = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};
const loc = (hostname, search = '') => ({ hostname, search });

test('the configured URL is used by default', () => {
  assert.equal(resolveApiUrl(loc('raeandrayven.github.io'), store(), { apiUrl: URL_ }), URL_);
  assert.equal(resolveApiUrl(loc('localhost'), store(), { apiUrl: URL_ }), URL_);
});

test('on localhost ?api= points at the mock backend and is remembered', () => {
  const s = store();
  assert.equal(resolveApiUrl(loc('localhost', '?api=http://localhost:8787/'), s, { apiUrl: URL_ }), 'http://localhost:8787/');
  assert.equal(resolveApiUrl(loc('localhost'), s, { apiUrl: URL_ }), 'http://localhost:8787/'); // later page, no query
});

test('?api= is ignored (and nothing is stored) on any non-local host', () => {
  const s = store();
  assert.equal(resolveApiUrl(loc('raeandrayven.github.io', '?api=https://evil.example/'), s, { apiUrl: URL_ }), URL_);
  assert.equal(s.getItem('rr.api'), null);
  assert.equal(resolveApiUrl(loc('localhost.evil.com', '?api=https://evil.example/'), s, { apiUrl: URL_ }), URL_);
});

test('blocked storage on localhost falls back to the configured URL', () => {
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(resolveApiUrl(loc('localhost'), blocked, { apiUrl: URL_ }), URL_);
});

test('empty config gives an empty URL', () => {
  assert.equal(resolveApiUrl(loc('example.com'), store(), { apiUrl: '' }), '');
});
