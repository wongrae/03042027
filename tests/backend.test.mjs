// Runs backend/Code.gs (Google Apps Script) in a Node vm with fake Google
// services (scripts/fake-google.mjs), so every guest-list / rsvp-flow scenario
// is exercised against the real script code. Also checks the mirrored rules
// haven't drifted from the site's versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSurname, last4, isValidLast4, guestKey, findMatches } from '../site/js/verify-rules.js';
import { validateResponse } from '../site/js/rsvp-rules.js';
import { HEADER, guest, makeEnv, DEFAULT_GUESTS, BEFORE_DEADLINE, DEADLINE } from '../scripts/fake-google.mjs';

const ATTENDING = { attending: true, partySize: 2, dietary: 'vegetarian', parking: true, wishes: 'Congrats!' };

// ---------------------------------------------------------------- guest-list: matching & privacy

test('verify matches surname + last 4 ignoring case, spacing and punctuation', () => {
  const env = makeEnv();
  const r = env.verify('  tan ', '4567');
  assert.equal(r.ok, true);
  assert.equal(r.name, 'Alex & Sam Tan');
  assert.equal(r.seats, 4);
  assert.equal(r.open, true);
  assert.equal(r.response, null);
  assert.match(r.k, /^[A-Za-z0-9]{12}$/);
  assert.equal(env.verify('TAN', '4567').ok, true);
  assert.equal(env.verify('t.a.n', ' 4567 ').ok, true);
});

test('last 4 comes from the stored number whatever its formatting', () => {
  const env = makeEnv();
  assert.equal(env.verify('Ng', '4567').ok, true); // 91234567 → 4567
  assert.equal(env.verify('Lim', '1111').ok, true);
});

test('wrong digits and wrong surname give identical generic responses', () => {
  const env = makeEnv();
  const wrongDigits = env.verify('Tan', '0000');
  const wrongSurname = env.verify('Wong', '4567');
  assert.deepEqual(wrongDigits, { ok: false, error: 'not_found' });
  assert.deepEqual(wrongSurname, wrongDigits);
});

test('malformed verify input is just not_found', () => {
  const env = makeEnv();
  for (const [s, d] of [['', '4567'], ['Tan', ''], ['Tan', '456'], ['Tan', '45678'], ['Tan', 'abcd'], [null, '4567'], ['Tan', 4567], [{}, []]]) {
    assert.deepEqual(env.verify(s, d), { ok: false, error: 'not_found' }, JSON.stringify([s, d]));
  }
});

test('a failed verification changes nothing in the sheet', () => {
  const env = makeEnv();
  const before = env.snapshot();
  env.verify('Tan', '0000');
  env.verify('Nobody', '1234');
  env.verify('', '');
  assert.equal(env.snapshot(), before);
  assert.equal(env.sheet.formats.size, 0);
});

test('two rows with the same surname and last 4 are ambiguous: not_found, nothing written', () => {
  const env = makeEnv({
    guests: [guest('A Lim', 'Lim', '8000 8888', 2), guest('B Lim', 'Lim', '9000 8888', 2)],
  });
  const before = env.snapshot();
  assert.deepEqual(env.verify('Lim', '8888'), { ok: false, error: 'not_found' });
  assert.equal(env.snapshot(), before);
});

test('phone numbers are never returned to the browser', () => {
  const env = makeEnv();
  const v = env.verify('Tan', '4567');
  const g = env.get({ action: 'get', k: v.k });
  const s = env.save(v.k, ATTENDING);
  for (const out of [v, g, s]) {
    const text = JSON.stringify(out);
    assert.ok(!/phone/i.test(text), 'no phone field');
    assert.ok(!text.includes('8123'), 'no phone digits');
    assert.ok(!text.includes('+65'), 'no phone number');
  }
});

test('the backend offers no way to list or enumerate invitations', () => {
  const env = makeEnv();
  for (const params of [{}, { action: 'list' }, { action: 'search', q: 'Tan' }, { action: 'get' }, { action: 'get', k: '' }, { k: 'abcdefghijkl' }]) {
    const r = env.get(params);
    assert.equal(r.ok, false);
    assert.ok(['bad_request', 'not_found'].includes(r.error));
    assert.deepEqual(Object.keys(r).sort(), ['error', 'ok']);
  }
  for (const action of ['list', 'search', 'dump', undefined]) {
    assert.equal(env.post({ action }).error, 'bad_request');
  }
});

// ---------------------------------------------------------------- guest-list: hidden device codes

test('a code is created on first verification and reused after', () => {
  const env = makeEnv();
  assert.equal(env.cell(0, 'Code'), '');
  const first = env.verify('Tan', '4567');
  assert.equal(env.cell(0, 'Code'), first.k);
  assert.equal(env.sheet.formats.get('2,5'), '@'); // code cell is plain text
  const again = env.verify('Tan', '4567');
  assert.equal(again.k, first.k);
});

test('each invitation gets its own unique code', () => {
  const env = makeEnv();
  const a = env.verify('Tan', '4567').k;
  const b = env.verify('Lim', '1111').k;
  const c = env.verify('Ng', '4567').k;
  assert.equal(new Set([a, b, c]).size, 3);
});

test('a code opens only its own row', () => {
  const env = makeEnv();
  const a = env.verify('Tan', '4567');
  const b = env.verify('Lim', '1111');
  assert.equal(env.get({ action: 'get', k: a.k }).name, 'Alex & Sam Tan');
  assert.equal(env.get({ action: 'get', k: b.k }).name, 'Jamie Lim');
});

test('clearing a code revokes every device that held it', () => {
  const env = makeEnv();
  const first = env.verify('Tan', '4567');
  env.sheet.data[1][HEADER.indexOf('Code')] = ''; // Rae clears the cell
  assert.deepEqual(env.get({ action: 'get', k: first.k }), { ok: false, error: 'not_found' });
  assert.deepEqual(env.save(first.k, ATTENDING), { ok: false, error: 'not_found' });
  const second = env.verify('Tan', '4567');
  assert.notEqual(second.k, first.k);
  assert.equal(env.get({ action: 'get', k: second.k }).ok, true);
});

test('deleting a row removes access', () => {
  const env = makeEnv();
  const v = env.verify('Tan', '4567');
  env.sheet.data.splice(1, 1); // Rae deletes the row
  assert.equal(env.get({ action: 'get', k: v.k }).error, 'not_found');
  assert.equal(env.verify('Tan', '4567').error, 'not_found');
});

test('malformed, unknown and empty codes are all generic not_found', () => {
  const env = makeEnv();
  env.verify('Tan', '4567');
  for (const k of ['', 'short', 'abcdefghijkl', 'abcdefghijk!', null, undefined, 12345, "' OR 1=1"]) {
    assert.deepEqual(env.get({ action: 'get', k }), { ok: false, error: 'not_found' }, String(k));
    assert.deepEqual(env.save(k, ATTENDING), { ok: false, error: 'not_found' }, String(k));
  }
});

// ---------------------------------------------------------------- rsvp-flow: saving

test('submitting a new RSVP records it on the same row, with a timestamp, and adds no row', () => {
  const env = makeEnv();
  const { k } = env.verify('Tan', '4567');
  const rowsBefore = env.dataRows().length;
  const r = env.save(k, ATTENDING);
  assert.equal(r.ok, true);
  assert.deepEqual(r.response, ATTENDING);
  assert.equal(env.dataRows().length, rowsBefore);
  assert.equal(env.cell(0, 'Attending'), 'Attending');
  assert.equal(env.cell(0, 'Party size'), 2);
  assert.equal(env.cell(0, 'Dietary'), 'vegetarian');
  assert.equal(env.cell(0, 'Parking'), 'Yes');
  assert.equal(env.cell(0, 'Well wishes'), 'Congrats!');
  assert.equal(env.cell(0, 'Updated at'), '2027-02-01 12:00:00'); // Singapore time
  // the other invitations are untouched
  assert.equal(env.cell(1, 'Attending'), '');
  assert.equal(env.cell(2, 'Attending'), '');
});

test('verify and get return the saved response', () => {
  const env = makeEnv();
  const { k } = env.verify('Tan', '4567');
  env.save(k, ATTENDING);
  assert.deepEqual(env.verify('Tan', '4567').response, ATTENDING);
  assert.deepEqual(env.get({ action: 'get', k }).response, ATTENDING);
});

test('editing overwrites the same record and creates no second one', () => {
  const env = makeEnv();
  const { k } = env.verify('Tan', '4567');
  env.save(k, ATTENDING);
  env.now += 3600_000;
  const rowsBefore = env.dataRows().length;
  const edited = env.save(k, { ...ATTENDING, partySize: 3, dietary: 'no nuts', parking: false, wishes: 'See you!' });
  assert.equal(edited.ok, true);
  assert.equal(env.dataRows().length, rowsBefore);
  assert.equal(env.cell(0, 'Party size'), 3);
  assert.equal(env.cell(0, 'Dietary'), 'no nuts');
  assert.equal(env.cell(0, 'Parking'), 'No');
  assert.equal(env.cell(0, 'Well wishes'), 'See you!');
  assert.equal(env.cell(0, 'Updated at'), '2027-02-01 13:00:00');
});

test('declining clears party size, dietary and parking but keeps well wishes', () => {
  const env = makeEnv();
  const { k } = env.verify('Tan', '4567');
  env.save(k, ATTENDING);
  const r = env.save(k, { attending: false, partySize: 4, dietary: 'x', parking: true, wishes: 'Sorry!' });
  assert.deepEqual(r.response, { attending: false, partySize: null, dietary: '', parking: null, wishes: 'Sorry!' });
  assert.equal(env.cell(0, 'Attending'), 'Declined');
  assert.equal(env.cell(0, 'Party size'), '');
  assert.equal(env.cell(0, 'Dietary'), '');
  assert.equal(env.cell(0, 'Parking'), '');
  assert.equal(env.cell(0, 'Well wishes'), 'Sorry!');
  assert.deepEqual(env.get({ action: 'get', k }).response, r.response);
});

test('invalid responses are rejected with field messages and write nothing', () => {
  const env = makeEnv();
  const { k } = env.verify('Tan', '4567');
  const before = env.snapshot();
  const noAttendance = env.save(k, { partySize: 2 });
  assert.equal(noAttendance.error, 'invalid');
  assert.ok(noAttendance.fields.attending);
  const tooMany = env.save(k, { ...ATTENDING, partySize: 5 }); // Tan has 4 seats
  assert.equal(tooMany.error, 'invalid');
  assert.ok(tooMany.fields.partySize);
  assert.equal(env.save(k, { ...ATTENDING, partySize: 0 }).error, 'invalid');
  assert.equal(env.save(k, { ...ATTENDING, partySize: 1.5 }).error, 'invalid');
  assert.equal(env.save(k, { ...ATTENDING, dietary: 'x'.repeat(301) }).error, 'invalid');
  assert.equal(env.save(k, { ...ATTENDING, wishes: 'x'.repeat(1001) }).error, 'invalid');
  assert.equal(env.save(k, null).error, 'invalid');
  assert.equal(env.snapshot(), before);
});

test('party size is limited by the row seats; blank seats means 1', () => {
  const env = makeEnv({ guests: [guest('Solo Wong', 'Wong', '8888 1234', ''), guest('Pair Koh', 'Koh', '8888 5678', 2)] });
  const solo = env.verify('Wong', '1234');
  assert.equal(solo.seats, null);
  assert.equal(env.save(solo.k, { ...ATTENDING, partySize: 2 }).error, 'invalid');
  assert.equal(env.save(solo.k, { ...ATTENDING, partySize: 1 }).ok, true);
  const pair = env.verify('Koh', '5678');
  assert.equal(env.save(pair.k, { ...ATTENDING, partySize: 3 }).error, 'invalid');
  assert.equal(env.save(pair.k, { ...ATTENDING, partySize: 2 }).ok, true);
});

test('guest text starting with a formula character is stored as literal text', () => {
  const env = makeEnv();
  const { k } = env.verify('Tan', '4567');
  for (const text of ['=1+1', '=IMPORTXML("http://evil","//a")', '+65 call me', '-- best wishes', '@mention']) {
    env.save(k, { ...ATTENDING, wishes: text, dietary: text });
    assert.equal(env.cell(0, 'Well wishes'), "'" + text, `stored guard for ${text}`);
    assert.equal(env.cell(0, 'Dietary'), "'" + text);
    assert.equal(env.sheet.formats.get(`2,${HEADER.indexOf('Well wishes') + 1}`), '@');
    // and the guest sees their own text back, without the guard
    assert.equal(env.get({ action: 'get', k }).response.wishes, text);
  }
  env.save(k, { ...ATTENDING, wishes: 'Hello = world', dietary: 'plain' });
  assert.equal(env.cell(0, 'Well wishes'), 'Hello = world'); // only a *leading* character is guarded
});

test('a save finds its row by code even after Rae sorts the sheet', () => {
  const env = makeEnv();
  const tan = env.verify('Tan', '4567').k;
  const lim = env.verify('Lim', '1111').k;
  env.sheet.data = [env.sheet.data[0], ...env.sheet.data.slice(1).reverse()]; // Rae sorts the rows
  env.save(lim, { ...ATTENDING, wishes: 'from Lim' });
  const limRow = env.dataRows().find((r) => r[1] === 'Lim');
  const tanRow = env.dataRows().find((r) => r[1] === 'Tan');
  assert.equal(limRow[HEADER.indexOf('Well wishes')], 'from Lim');
  assert.equal(tanRow[HEADER.indexOf('Well wishes')], '');
  assert.equal(env.get({ action: 'get', k: tan }).response, null);
});

test('columns are found by header name, so they can be reordered and extras added', () => {
  const header = ['Notes', 'Phone', 'Extra', ...HEADER.filter((h) => !['Notes', 'Phone'].includes(h))];
  const mk = (name, surname, phone, seats) => {
    const row = new Array(header.length).fill('');
    row[header.indexOf('Name')] = name;
    row[header.indexOf('Surname')] = surname;
    row[header.indexOf('Phone')] = phone;
    row[header.indexOf('Seats')] = seats;
    return row;
  };
  const env = makeEnv({ header, guests: [mk('Alex Tan', 'Tan', '8123 4567', 3)] });
  const v = env.verify('Tan', '4567');
  assert.equal(v.ok, true);
  assert.equal(env.save(v.k, ATTENDING).ok, true);
  assert.equal(env.cell(0, 'Attending'), 'Attending');
  assert.equal(env.cell(0, 'Extra'), '');
});

test('header names are matched without regard to case or surrounding spaces', () => {
  const header = HEADER.map((h) => ` ${h.toUpperCase()} `);
  const env = makeEnv({ header, guests: DEFAULT_GUESTS() });
  assert.equal(env.verify('Tan', '4567').ok, true);
});

test('a missing column is a server error, not a crash with details', () => {
  const env = makeEnv({ header: HEADER.filter((h) => h !== 'Surname'), guests: [] });
  const r = env.verify('Tan', '4567');
  assert.deepEqual(r, { ok: false, error: 'server' });
  assert.ok(env.errors.join().includes('Surname'));
});

test('a guest with no Name is greeted by surname', () => {
  const env = makeEnv({ guests: [guest('', 'Tan', '8123 4567', 2)] });
  assert.equal(env.verify('Tan', '4567').name, 'Tan');
});

// ---------------------------------------------------------------- rsvp-flow: deadline

test('after the deadline the backend rejects verify and save, and leaves the stored response alone', () => {
  const env = makeEnv();
  const { k } = env.verify('Tan', '4567');
  env.save(k, ATTENDING);
  const before = env.snapshot();
  env.now = Date.parse(DEADLINE); // exactly on the deadline = closed
  assert.deepEqual(env.save(k, { ...ATTENDING, partySize: 1 }), { ok: false, error: 'closed' });
  assert.deepEqual(env.verify('Tan', '4567'), { ok: false, error: 'closed' });
  assert.equal(env.snapshot(), before);
  const g = env.get({ action: 'get', k });
  assert.equal(g.open, false);
  assert.equal(g.response.partySize, 2);
});

test('one millisecond before the deadline is still open', () => {
  const env = makeEnv({ now: Date.parse(DEADLINE) - 1 });
  const v = env.verify('Tan', '4567');
  assert.equal(v.ok, true);
  assert.equal(env.save(v.k, ATTENDING).ok, true);
});

test('the deadline is judged by the backend clock, not the request', () => {
  const env = makeEnv({ now: Date.parse(DEADLINE) + 86400_000 });
  // a page loaded before the deadline, with a perfectly valid code from earlier
  env.sheet.data[1][HEADER.indexOf('Code')] = 'AAAAAAAAAAAA';
  assert.deepEqual(env.save('AAAAAAAAAAAA', ATTENDING), { ok: false, error: 'closed' });
});

test('a missing or invalid deadline property is a config error', () => {
  for (const value of [undefined, '', 'banana']) {
    const env = makeEnv();
    if (value === undefined) delete env.props.RSVP_DEADLINE;
    else env.props.RSVP_DEADLINE = value;
    assert.deepEqual(env.verify('Tan', '4567'), { ok: false, error: 'config' });
    env.sheet.data[1][HEADER.indexOf('Code')] = 'AAAAAAAAAAAA';
    assert.deepEqual(env.get({ action: 'get', k: 'AAAAAAAAAAAA' }), { ok: false, error: 'config' });
    assert.deepEqual(env.save('AAAAAAAAAAAA', ATTENDING), { ok: false, error: 'config' });
  }
});

// ---------------------------------------------------------------- robustness

test('bad request bodies are rejected without touching the sheet', () => {
  const env = makeEnv();
  const before = env.snapshot();
  assert.equal(env.post('not json').error, 'bad_request');
  assert.equal(env.post('null').error, 'bad_request');
  assert.equal(env.post('[]').error, 'bad_request');
  assert.equal(env.post({ action: 'verify', surname: 'x'.repeat(20000), last4: '1234' }).error, 'bad_request');
  assert.equal(env.ctx.doPost({}) && JSON.parse(env.ctx.doPost({}).text).error, 'bad_request');
  assert.equal(env.snapshot(), before);
});

test('a busy lock returns busy instead of writing', () => {
  const env = makeEnv();
  const { k } = env.verify('Tan', '4567');
  env.lockBusy = true;
  const before = env.snapshot();
  assert.deepEqual(env.save(k, ATTENDING), { ok: false, error: 'busy' });
  assert.deepEqual(env.verify('Lim', '1111'), { ok: false, error: 'busy' });
  assert.equal(env.snapshot(), before);
});

test('responses are JSON', () => {
  const env = makeEnv();
  const out = env.ctx.doGet({ parameter: { action: 'get', k: 'AAAAAAAAAAAA' } });
  assert.equal(out.mime, 'JSON');
});

// ---------------------------------------------------------------- Check guest list

test('Check guest list flags missing data and ambiguous rows, and only those', () => {
  const env = makeEnv({
    guests: [
      guest('OK Tan', 'Tan', '8123 4567', 2), // row 2: fine
      guest('A Lim', 'Lim', '8000 8888', 2), // row 3 ┐ ambiguous
      guest('B Lim', 'Lim', '9000 8888', 2), // row 4 ┘
      guest('No Phone', 'Koh', '', 2), // row 5
      guest('Short Phone', 'Goh', '123', 2), // row 6
      guest('No Surname', '', '8000 1234', 2), // row 7
      guest('No Seats', 'Yeo', '8000 5678', ''), // row 8
      guest('', '', '', ''), // row 9: blank row is ignored
    ],
  });
  env.ctx.checkGuestList();
  const flagged = (row) => env.sheet.bg.get(`${row},1`) === '#F4CCCC';
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 9].filter(flagged), [3, 4, 5, 6, 7, 8]);
  const msg = env.alerts.at(-1).message;
  assert.match(msg, /Row 3: same Surname and last 4 digits as row\(s\) 4/);
  assert.match(msg, /Row 4: same Surname and last 4 digits as row\(s\) 3/);
  assert.match(msg, /Row 5: Phone is missing/);
  assert.match(msg, /Row 6: Phone is missing or has fewer than 4 digits/);
  assert.match(msg, /Row 7: missing Surname/);
  assert.match(msg, /Row 8: Seats is missing/);
  assert.ok(!/Row 2:/.test(msg));
  assert.ok(!/Row 9:/.test(msg));
});

test('Check guest list reports a clean sheet and clears old flags but keeps Rae\'s own colours', () => {
  const env = makeEnv({ guests: [guest('OK Tan', 'Tan', '8123 4567', 2), guest('A Lim', 'Lim', '8000 8888', 2), guest('B Lim', 'Lim', '9000 8888', 2)] });
  env.sheet.bg.set('2,1', '#00FF00'); // Rae's own highlight on a good row
  env.ctx.checkGuestList();
  assert.equal(env.sheet.bg.get('3,1'), '#F4CCCC');
  // Rae fixes the duplicate
  env.sheet.data[3][HEADER.indexOf('Phone')] = '9000 9999';
  const problems = env.ctx.checkGuestList();
  assert.equal(problems.length, 0);
  assert.equal(env.sheet.bg.get('3,1'), undefined); // flag cleared
  assert.equal(env.sheet.bg.get('4,1'), undefined);
  assert.equal(env.sheet.bg.get('2,1'), '#00FF00'); // Rae's colour untouched
  assert.match(env.alerts.at(-1).message, /No problems found in 3 rows/);
});

test('the Wedding menu is added on open', () => {
  const env = makeEnv();
  env.ctx.onOpen();
  assert.deepEqual(env.menu, { name: 'Wedding', label: 'Check guest list', fn: 'checkGuestList' });
});

// ---------------------------------------------------------------- parity with the site's rules

test('backend matching rules agree with site/js/verify-rules.js', () => {
  const { ctx } = makeEnv();
  const surnames = ['Tan', '  tan ', "O'Neil", 'ONeil', 'Lee-Smith', 'García', 'Garcia', '陈', '', null, undefined, 'a b c', 'MÜLLER', 'x1y2'];
  const phones = ['+65 8123 4567', '8123-4567', '(65) 81234567', '4567', '123', '', null, 'n/a', '0065 8123 4567', 81234567];
  for (const s of surnames) assert.equal(ctx.normaliseSurname_(s), normaliseSurname(s), `surname ${s}`);
  for (const p of phones) assert.equal(ctx.last4_(p), last4(p), `phone ${p}`);
  for (const d of ['4567', ' 4567 ', '456', 'abcd', '', null, '45 67']) assert.equal(ctx.isValidLast4_(d), isValidLast4(d), `digits ${d}`);
  for (const s of surnames) for (const p of phones) assert.equal(ctx.guestKey_(s, p), guestKey(s, p));
  const rows = [
    { surname: 'Tan', phone: '+65 8123 4567' },
    { surname: 'Lim', phone: '8000 8888' },
    { surname: 'Lim', phone: '9000 8888' },
    { surname: '', phone: '8000 1234' },
  ];
  for (const s of ['Tan', 'tan', 'Lim', 'Wong', '']) {
    for (const d of ['4567', '8888', '1234', '0000', '', 'abcd']) {
      assert.deepEqual([...ctx.findMatches_(rows, s, d)], findMatches(rows, s, d), `${s}/${d}`);
    }
  }
});

test('backend validation agrees with site/js/rsvp-rules.js', () => {
  const { ctx } = makeEnv();
  const responses = [
    { attending: true, partySize: 2, dietary: 'veg', parking: true, wishes: 'hi' },
    { attending: true, partySize: '3', dietary: ' x ', parking: false },
    { attending: true, partySize: 0, parking: true },
    { attending: true, partySize: 9 },
    { attending: true, partySize: 1.5 },
    { attending: true, partySize: 'abc' },
    { attending: true, partySize: null },
    { attending: true, partySize: 1, parking: 'yes' },
    { attending: true, partySize: 1, parking: null },
    { attending: true, partySize: 1, dietary: 'x'.repeat(301) },
    { attending: true, partySize: 1, wishes: 'x'.repeat(1001) },
    { attending: false, partySize: 3, dietary: 'x', parking: true, wishes: ' bye ' },
    { attending: false },
    { attending: 'yes' },
    { attending: undefined },
    {},
    null,
    undefined,
  ];
  for (const seats of [1, 2, 4, null, undefined]) {
    for (const r of responses) {
      const mine = ctx.validateResponse_(r, seats);
      const site = validateResponse(r, seats);
      const label = `${JSON.stringify(r)} seats=${seats}`;
      assert.equal(mine.ok, site.ok, label);
      assert.deepEqual(Object.keys(mine.fields).sort(), Object.keys(site.fields).sort(), label);
      assert.deepEqual(mine.value && { ...mine.value }, site.value, label);
    }
  }
});
