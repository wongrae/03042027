import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSurname, last4, isValidLast4, guestKey, findMatches } from '../site/js/verify-rules.js';

test('surname matching ignores case, spacing and punctuation', () => {
  assert.equal(normaliseSurname('  tan '), 'tan');
  assert.equal(normaliseSurname('TAN'), 'tan');
  assert.equal(normaliseSurname("O'Neil"), 'oneil');
  assert.equal(normaliseSurname('ONeil'), 'oneil');
  assert.equal(normaliseSurname('Lee-Smith'), 'leesmith');
  assert.equal(normaliseSurname('Lee Smith'), 'leesmith');
});

test('accents are ignored and non-Latin surnames survive', () => {
  assert.equal(normaliseSurname('García'), 'garcia');
  assert.equal(normaliseSurname('陈'), '陈');
  assert.equal(normaliseSurname(' 陈 '), '陈');
});

test('null / undefined / numbers do not throw', () => {
  assert.equal(normaliseSurname(null), '');
  assert.equal(normaliseSurname(undefined), '');
  assert.equal(last4(null), null);
  assert.equal(last4(81234567), '4567');
});

test('last 4 digits ignore spaces, plus, dashes and country code', () => {
  assert.equal(last4('+65 8123 4567'), '4567');
  assert.equal(last4('8123-4567'), '4567');
  assert.equal(last4('(65) 81234567'), '4567');
  assert.equal(last4('0065 8123 4567'), '4567');
  assert.equal(last4('4567'), '4567');
});

test('phones with fewer than 4 digits have no last 4', () => {
  assert.equal(last4(''), null);
  assert.equal(last4('123'), null);
  assert.equal(last4('n/a'), null);
});

test('entered digits must be exactly four digits', () => {
  assert.equal(isValidLast4('4567'), true);
  assert.equal(isValidLast4(' 4567 '), true);
  for (const bad of ['', '456', '45678', 'abcd', '45 67', '4567a', null, undefined]) {
    assert.equal(isValidLast4(bad), false, `${bad}`);
  }
});

const rows = [
  { surname: 'Tan', phone: '+65 8123 4567' },
  { surname: 'Tan', phone: '9111 2222' },
  { surname: 'Lim', phone: '8000 8888' },
  { surname: 'Lim', phone: '9000 8888' }, // same surname + last 4 as the row above
  { surname: 'Ng', phone: '' }, // no phone
  { surname: '', phone: '8000 1234' }, // no surname
];

test('a surname and last 4 match exactly one row, whatever the formatting', () => {
  assert.deepEqual(findMatches(rows, '  tan ', '4567'), [0]);
  assert.deepEqual(findMatches(rows, 'TAN', '2222'), [1]);
});

test('wrong digits or wrong surname match nothing', () => {
  assert.deepEqual(findMatches(rows, 'Tan', '0000'), []);
  assert.deepEqual(findMatches(rows, 'Wong', '4567'), []);
  assert.deepEqual(findMatches(rows, 'Tan', '8888'), []);
});

test('two rows with the same surname and last 4 are both returned (ambiguous)', () => {
  assert.deepEqual(findMatches(rows, 'Lim', '8888'), [2, 3]);
});

test('invalid or empty input never matches, and rows missing data never match', () => {
  assert.deepEqual(findMatches(rows, '', '4567'), []);
  assert.deepEqual(findMatches(rows, 'Tan', ''), []);
  assert.deepEqual(findMatches(rows, 'Tan', '456'), []);
  assert.deepEqual(findMatches(rows, 'Ng', '0000'), []);
  assert.deepEqual(findMatches(rows, '', '1234'), []);
});

test('guestKey is null when either part is missing', () => {
  assert.equal(guestKey('Tan', '+65 8123 4567'), 'tan|4567');
  assert.equal(guestKey('', '8123 4567'), null);
  assert.equal(guestKey('Tan', '12'), null);
});
