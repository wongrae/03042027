import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccess, isValidCode, STORAGE_KEY } from '../site/js/access.js';

const CODE = 'aB3dE6gH9jK2';
const mapStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};
const blockedStorage = () => ({
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
  removeItem() { throw new Error('SecurityError'); },
});

test('code format: 12 letters/digits only', () => {
  assert.equal(isValidCode(CODE), true);
  for (const bad of ['', 'short', 'aB3dE6gH9jK2x', 'aB3dE6gH9j!2', 'aB3dE6gH 9jK', null, undefined, 123456789012]) {
    assert.equal(isValidCode(bad), false, String(bad));
  }
});

test('stores, returns and forgets the code', () => {
  const s = mapStorage();
  const a = createAccess(() => s);
  assert.equal(a.get(), null);
  a.set(CODE);
  assert.equal(a.get(), CODE);
  assert.equal(s._m.get(STORAGE_KEY), CODE);
  a.forget();
  assert.equal(a.get(), null);
  assert.equal(s._m.has(STORAGE_KEY), false);
});

test('survives a "reload": a new instance reads what the old one stored', () => {
  const s = mapStorage();
  createAccess(() => s).set(CODE);
  assert.equal(createAccess(() => s).get(), CODE);
});

test('a newly verified code replaces the old one', () => {
  const s = mapStorage();
  const a = createAccess(() => s);
  a.set(CODE);
  a.set('ZZZZZZZZZZZZ');
  assert.equal(a.get(), 'ZZZZZZZZZZZZ');
});

test('malformed codes are never stored, and tampered stored values read as nothing', () => {
  const s = mapStorage();
  const a = createAccess(() => s);
  a.set('nope');
  a.set(null);
  assert.equal(s._m.size, 0);
  s.setItem(STORAGE_KEY, '<script>alert(1)</script>');
  assert.equal(a.get(), null);
});

test('when storage is blocked it falls back to memory for the visit', () => {
  const a = createAccess(blockedStorage);
  assert.equal(a.get(), null);
  a.set(CODE); // must not throw
  assert.equal(a.get(), CODE);
  a.forget();
  assert.equal(a.get(), null);
});

test('when storage does not exist at all it still works from memory', () => {
  const a = createAccess(() => undefined.localStorage);
  a.set(CODE);
  assert.equal(a.get(), CODE);
});
