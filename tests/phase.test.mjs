import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPhase, countdownParts, formatCountdown, resolveNow } from '../site/js/phase.js';

const cfg = {
  weddingDate: '2027-04-03T00:00:00+08:00',
  rsvpDeadline: '2027-03-01T23:59:59+08:00',
};
const at = (iso) => Date.parse(iso);

test('before the RSVP deadline is Phase 1', () => {
  assert.equal(getPhase(at('2026-10-13T00:00:00+08:00'), cfg), 1);
  assert.equal(getPhase(at('2027-03-01T23:59:58+08:00'), cfg), 1);
});

test('on or after the deadline and before the wedding is Phase 2', () => {
  assert.equal(getPhase(at('2027-03-01T23:59:59+08:00'), cfg), 2);
  assert.equal(getPhase(at('2027-03-20T12:00:00+08:00'), cfg), 2);
  assert.equal(getPhase(at('2027-04-02T23:59:59+08:00'), cfg), 2);
});

test('on or after the wedding date is Phase 3', () => {
  assert.equal(getPhase(at('2027-04-03T00:00:00+08:00'), cfg), 3);
  assert.equal(getPhase(at('2027-04-04T09:00:00+08:00'), cfg), 3);
  assert.equal(getPhase(at('2030-01-01T00:00:00+08:00'), cfg), 3);
});

test('phase is the same instant whichever offset it is written in', () => {
  // 2027-04-02T16:00:00Z is exactly 2027-04-03 00:00 in Singapore
  assert.equal(getPhase(at('2027-04-02T15:59:59Z'), cfg), 2);
  assert.equal(getPhase(at('2027-04-02T16:00:00Z'), cfg), 3);
  // the same instants as seen from London / Los Angeles
  assert.equal(getPhase(at('2027-04-02T17:00:00+01:00'), cfg), 3);
  assert.equal(getPhase(at('2027-04-02T09:00:00-07:00'), cfg), 3);
  assert.equal(getPhase(at('2027-04-02T08:59:59-07:00'), cfg), 2);
});

test('config dates written in another offset still compare correctly', () => {
  const utcCfg = { weddingDate: '2027-04-02T16:00:00Z', rsvpDeadline: '2027-03-01T15:59:59Z' };
  assert.equal(getPhase(at('2027-03-01T23:59:59+08:00'), utcCfg), 2);
  assert.equal(getPhase(at('2027-04-03T00:00:00+08:00'), utcCfg), 3);
});

test('countdown shows 123 : 04 : 20 for 123 days 4 hours 20 minutes', () => {
  const now = at('2027-04-03T00:00:00+08:00') - (123 * 24 * 60 + 4 * 60 + 20) * 60 * 1000;
  const parts = countdownParts(now, cfg);
  assert.deepEqual(parts, { days: '123', hours: '04', minutes: '20' });
  assert.equal(formatCountdown(parts), '123 : 04 : 20');
});

test('countdown floors partial minutes and zero-pads the days', () => {
  const now = at('2027-04-03T00:00:00+08:00') - (5 * 24 * 3600 + 3 * 3600 + 9 * 60 + 59) * 1000;
  assert.deepEqual(countdownParts(now, cfg), { days: '005', hours: '03', minutes: '09' });
});

test('countdown never goes negative once the wedding has started', () => {
  assert.deepEqual(countdownParts(at('2027-05-01T00:00:00+08:00'), cfg), {
    days: '000',
    hours: '00',
    minutes: '00',
  });
});

const loc = (hostname, search) => ({ hostname, search });

test('?now= overrides the clock on localhost and 127.0.0.1', () => {
  assert.equal(resolveNow(loc('localhost', '?now=2027-04-03'), 1), at('2027-04-03T00:00:00+08:00'));
  assert.equal(resolveNow(loc('127.0.0.1', '?now=2027-03-20T12:00'), 1), at('2027-03-20T12:00:00+08:00'));
  assert.equal(resolveNow(loc('localhost', '?now=2027-03-20T12:00:00Z'), 1), at('2027-03-20T12:00:00Z'));
});

test('a date-only ?now= is read as Singapore midnight and lands in the right phase', () => {
  const ms = resolveNow(loc('localhost', '?now=2027-04-03'), 0);
  assert.equal(getPhase(ms, cfg), 3);
  assert.equal(getPhase(resolveNow(loc('localhost', '?now=2027-03-20'), 0), cfg), 2);
  assert.equal(getPhase(resolveNow(loc('localhost', '?now=2026-12-01'), 0), cfg), 1);
});

test('?now= is ignored on any non-local host', () => {
  assert.equal(resolveNow(loc('raeandrayven.github.io', '?now=2027-04-03'), 42), 42);
  assert.equal(resolveNow(loc('example.com', '?now=2027-04-03'), 42), 42);
  assert.equal(resolveNow(loc('localhost.evil.com', '?now=2027-04-03'), 42), 42);
});

test('missing or invalid ?now= falls back to the given clock', () => {
  assert.equal(resolveNow(loc('localhost', ''), 42), 42);
  assert.equal(resolveNow(loc('localhost', '?now=banana'), 42), 42);
  assert.equal(resolveNow(loc('localhost', '?other=1'), 42), 42);
});
