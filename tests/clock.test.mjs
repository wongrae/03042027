import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServerDate, computeOffset, syncClock, serverNow } from '../site/js/clock.js';

const REAL = Date.parse('2027-04-02T16:00:00Z'); // 2027-04-03 00:00 Singapore
const MONTH = 30 * 24 * 3600 * 1000;

const fakeFetch = (dateHeader, { throws = false } = {}) => async () => {
  if (throws) throw new Error('network down');
  return { headers: { get: (k) => (k.toLowerCase() === 'date' ? dateHeader : null) } };
};

test('parses a valid HTTP date header', () => {
  assert.equal(parseServerDate('Fri, 02 Apr 2027 16:00:00 GMT'), REAL);
});

test('rejects a missing, garbage or implausible header', () => {
  assert.equal(parseServerDate(null), null);
  assert.equal(parseServerDate(''), null);
  assert.equal(parseServerDate('not a date'), null);
  assert.equal(parseServerDate('Thu, 01 Jan 1970 00:00:00 GMT'), null);
});

test('offset centres the 1-second header resolution and request latency', () => {
  // server says :00, request took 200ms around device time 10_000 → mid 10_100
  assert.equal(computeOffset(50_000_000_000, 10_000, 10_200), 50_000_000_000 + 500 - 10_100);
});

test('a device clock one month ahead still yields the real time', async () => {
  const device = REAL + MONTH;
  const clock = await syncClock({
    fetchFn: fakeFetch('Fri, 02 Apr 2027 16:00:00 GMT'),
    nowFn: () => device,
  });
  assert.equal(clock.synced, true);
  // within one second of real time (header truncation allowance)
  assert.ok(Math.abs(clock.now() - REAL) <= 1000, `got ${clock.now() - REAL}ms off`);
});

test('a device clock one month behind still yields the real time', async () => {
  const device = REAL - MONTH;
  const ms = await serverNow({
    fetchFn: fakeFetch('Fri, 02 Apr 2027 16:00:00 GMT'),
    nowFn: () => device,
  });
  assert.ok(Math.abs(ms - REAL) <= 1000);
});

test('the corrected clock keeps ticking with the device clock', async () => {
  let device = REAL + MONTH;
  const clock = await syncClock({
    fetchFn: fakeFetch('Fri, 02 Apr 2027 16:00:00 GMT'),
    nowFn: () => device,
  });
  const first = clock.now();
  device += 60_000;
  assert.equal(clock.now() - first, 60_000);
});

test('falls back to the device clock when the request fails', async () => {
  const device = 1_800_000_000_000;
  const clock = await syncClock({ fetchFn: fakeFetch(null, { throws: true }), nowFn: () => device });
  assert.equal(clock.synced, false);
  assert.equal(clock.offsetMs, 0);
  assert.equal(clock.now(), device);
});

test('falls back to the device clock when the Date header is missing or bad', async () => {
  const device = 1_800_000_000_000;
  for (const header of [null, 'garbage', 'Thu, 01 Jan 1970 00:00:00 GMT']) {
    const clock = await syncClock({ fetchFn: fakeFetch(header), nowFn: () => device });
    assert.equal(clock.synced, false);
    assert.equal(clock.now(), device);
  }
});

test('falls back to the device clock when there is no fetch at all', async () => {
  const device = 1_800_000_000_000;
  const clock = await syncClock({ fetchFn: undefined, nowFn: () => device });
  assert.equal(clock.synced, false);
  assert.equal(clock.now(), device);
});

test('a hung request times out and falls back', async () => {
  const device = 1_800_000_000_000;
  const hung = (_url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const clock = await syncClock({ fetchFn: hung, nowFn: () => device, timeoutMs: 20 });
  assert.equal(clock.synced, false);
  assert.equal(clock.now(), device);
});
