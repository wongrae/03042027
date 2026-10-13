import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateResponse, MAX_DIETARY, MAX_WISHES } from '../site/js/rsvp-rules.js';

const attending = { attending: true, partySize: 2, dietary: 'vegetarian', parking: true, wishes: 'Congrats!' };

test('a complete attending response is valid and normalised', () => {
  const r = validateResponse(attending, 4);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { attending: true, partySize: 2, dietary: 'vegetarian', parking: true, wishes: 'Congrats!' });
});

test('attendance must be chosen', () => {
  for (const bad of [undefined, null, 'yes', 1]) {
    const r = validateResponse({ ...attending, attending: bad }, 4);
    assert.equal(r.ok, false);
    assert.ok(r.fields.attending);
    assert.equal(r.value, null);
  }
  assert.ok(validateResponse({}, 4).fields.attending);
  assert.ok(validateResponse(undefined, 4).fields.attending);
});

test('party size must be a whole number from 1 up to the seat count when attending', () => {
  for (const bad of [0, 5, -1, 2.5, 'abc', '', null, undefined, NaN]) {
    const r = validateResponse({ ...attending, partySize: bad }, 4);
    assert.equal(r.ok, false, `partySize ${String(bad)} should be invalid`);
    assert.ok(r.fields.partySize);
  }
  for (const good of [1, 2, 4, '3']) {
    assert.equal(validateResponse({ ...attending, partySize: good }, 4).ok, true, `partySize ${good}`);
  }
});

test('party size is capped by the invitation seats', () => {
  assert.equal(validateResponse({ ...attending, partySize: 2 }, 1).ok, false);
  assert.equal(validateResponse({ ...attending, partySize: 1 }, 1).ok, true);
  assert.equal(validateResponse({ ...attending, partySize: 1 }, undefined).ok, true); // unknown seats → 1
});

test('declining clears party size, dietary and parking but keeps well wishes', () => {
  const r = validateResponse({ attending: false, partySize: 3, dietary: 'nuts', parking: true, wishes: ' Sorry! ' }, 4);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { attending: false, partySize: null, dietary: '', parking: null, wishes: 'Sorry!' });
});

test('declining needs no party size', () => {
  assert.equal(validateResponse({ attending: false }, 2).ok, true);
});

test('dietary and wishes are optional and trimmed', () => {
  const r = validateResponse({ attending: true, partySize: 1, parking: false, dietary: '  no pork ', wishes: '  hi  ' }, 2);
  assert.equal(r.ok, true);
  assert.equal(r.value.dietary, 'no pork');
  assert.equal(r.value.wishes, 'hi');
  const blank = validateResponse({ attending: true, partySize: 1, parking: null }, 2);
  assert.equal(blank.ok, true);
  assert.equal(blank.value.dietary, '');
  assert.equal(blank.value.wishes, '');
});

test('parking is yes/no/unanswered, nothing else', () => {
  assert.equal(validateResponse({ ...attending, parking: false }, 4).ok, true);
  assert.equal(validateResponse({ ...attending, parking: null }, 4).ok, true);
  assert.equal(validateResponse({ ...attending, parking: undefined }, 4).ok, true);
  assert.ok(validateResponse({ ...attending, parking: 'yes' }, 4).fields.parking);
});

test('over-long text is rejected, not silently cut', () => {
  assert.ok(validateResponse({ ...attending, dietary: 'x'.repeat(MAX_DIETARY + 1) }, 4).fields.dietary);
  assert.ok(validateResponse({ ...attending, wishes: 'x'.repeat(MAX_WISHES + 1) }, 4).fields.wishes);
  assert.equal(validateResponse({ ...attending, dietary: 'x'.repeat(MAX_DIETARY) }, 4).ok, true);
});

test('several problems are all reported together', () => {
  const r = validateResponse({ attending: true, partySize: 99, parking: 'maybe' }, 2);
  assert.deepEqual(Object.keys(r.fields).sort(), ['parking', 'partySize']);
});
