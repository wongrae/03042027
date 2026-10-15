import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initReveal } from '../site/js/reveal.js';

function setup({ reduce = false, io = true, count = 2 } = {}) {
  const added = [];
  const els = Array.from({ length: count }, () => ({ classList: { add: (c) => added.push(c) } }));
  const html = { classList: { add: (c) => added.push('html:' + c) } };
  const root = { documentElement: html, querySelectorAll: () => els };
  let cb;
  const observed = [];
  const unobserved = [];
  class FakeIO {
    constructor(fn) { cb = fn; }
    observe(el) { observed.push(el); }
    unobserve(el) { unobserved.push(el); }
    disconnect() {}
  }
  const win = {
    matchMedia: () => ({ matches: reduce }),
    ...(io ? { IntersectionObserver: FakeIO } : {}),
  };
  return { root, win, els, added, observed, unobserved, fire: (entries) => cb(entries) };
}

test('marked elements are observed and revealed once, when they scroll into view', () => {
  const t = setup();
  const r = initReveal({ root: t.root, win: t.win });
  assert.equal(r.active, true);
  assert.ok(t.added.includes('html:reveal-on'));
  assert.equal(t.observed.length, 2);
  t.fire([{ target: t.els[0], isIntersecting: false }]);
  assert.equal(t.added.filter((c) => c === 'is-visible').length, 0, 'not visible yet');
  t.fire([{ target: t.els[0], isIntersecting: true }]);
  assert.equal(t.added.filter((c) => c === 'is-visible').length, 1);
  assert.deepEqual(t.unobserved, [t.els[0]], 'stops watching once revealed');
});

test('reduced motion, no IntersectionObserver, or nothing marked: content is left alone', () => {
  for (const opts of [{ reduce: true }, { io: false }, { count: 0 }]) {
    const t = setup(opts);
    assert.equal(initReveal({ root: t.root, win: t.win }).active, false);
    assert.equal(t.added.length, 0, 'nothing hidden, nothing added');
  }
});
