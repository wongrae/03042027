/**
 * Rae & Rayven wedding RSVP backend — Google Apps Script web app.
 *
 * Container-bound to the guest-list spreadsheet (tab "Guests"). Deploy as a web
 * app: Execute as "Me", access "Anyone". See backend/README.md for setup.
 *
 * API (JSON):
 *   POST {action:"verify", surname, last4}  -> {ok, k, name, seats, open, response}
 *   GET  ?action=get&k=<code>               -> {ok, name, seats, open, response}
 *   POST {action:"save", k, response}       -> {ok, response}
 *   errors: {ok:false, error: "not_found" | "closed" | "invalid" (+fields) |
 *            "bad_request" | "busy" | "config" | "server"}
 *
 * Guest phone numbers are never returned. Nothing here lists or enumerates
 * guests. Matching and validation rules are MIRRORED from
 * site/js/verify-rules.js and site/js/rsvp-rules.js — keep them in sync
 * (tests/backend.test.mjs checks parity).
 */

var SHEET_NAME = 'Guests';
var HEADERS = {
  name: 'Name',
  surname: 'Surname',
  phone: 'Phone',
  seats: 'Seats',
  code: 'Code',
  attending: 'Attending',
  partySize: 'Party size',
  dietary: 'Dietary',
  parking: 'Parking',
  wishes: 'Well wishes',
  updatedAt: 'Updated at',
};
var REQUIRED_HEADERS = ['name', 'surname', 'phone', 'seats', 'code', 'attending', 'partySize', 'dietary', 'parking', 'wishes', 'updatedAt'];
var TEXT_COLUMNS = ['code', 'attending', 'dietary', 'parking', 'wishes', 'updatedAt'];

var CODE_LENGTH = 12;
var CODE_PATTERN = /^[A-Za-z0-9]{12}$/;
var BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
var MAX_DIETARY = 300;
var MAX_WISHES = 1000;
var MAX_BODY = 10000;
var FLAG_COLOR = '#F4CCCC';

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  return respond_(function () {
    var p = (e && e.parameter) || {};
    if (p.action !== 'get') return { ok: false, error: 'bad_request' };
    return handleGet_(p.k);
  });
}

function doPost(e) {
  return respond_(function () {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > MAX_BODY) return { ok: false, error: 'bad_request' };
    var body;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      return { ok: false, error: 'bad_request' };
    }
    if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
    if (body.action === 'verify') return handleVerify_(body.surname, body.last4);
    if (body.action === 'save') return handleSave_(body.k, body.response);
    return { ok: false, error: 'bad_request' };
  });
}

function respond_(fn) {
  var result;
  try {
    result = fn();
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    result = { ok: false, error: err && err.code === 'config' ? 'config' : 'server' };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleVerify_(surname, last4Input) {
  if (!isOpen_()) return { ok: false, error: 'closed' };
  if (typeof surname !== 'string' || typeof last4Input !== 'string') return { ok: false, error: 'not_found' };
  if (!normaliseSurname_(surname) || !isValidLast4_(last4Input)) return { ok: false, error: 'not_found' };

  return withLock_(function () {
    var table = readTable_();
    var hits = findMatches_(table.rows, surname, last4Input);
    if (hits.length !== 1) return { ok: false, error: 'not_found' }; // none, or ambiguous
    var row = table.rows[hits[0]];
    if (!row.code) {
      row.code = newCode_(table.rows);
      writeText_(table, row, 'code', row.code);
    }
    return { ok: true, k: row.code, name: row.name, seats: row.seats, open: true, response: responseOf_(row) };
  });
}

function handleGet_(k) {
  var row = findByCode_(readTable_().rows, k);
  if (!row) return { ok: false, error: 'not_found' };
  return { ok: true, name: row.name, seats: row.seats, open: isOpen_(), response: responseOf_(row) };
}

function handleSave_(k, response) {
  if (!isOpen_()) return { ok: false, error: 'closed' };
  if (!isCodeFormat_(k)) return { ok: false, error: 'not_found' };

  return withLock_(function () {
    var table = readTable_(); // read inside the lock: rows may have moved
    var row = findByCode_(table.rows, k);
    if (!row) return { ok: false, error: 'not_found' };
    var check = validateResponse_(response, row.seats);
    if (!check.ok) return { ok: false, error: 'invalid', fields: check.fields };
    var v = check.value;
    writeText_(table, row, 'attending', v.attending ? 'Attending' : 'Declined');
    writeCell_(table, row, 'partySize', v.partySize === null ? '' : v.partySize);
    writeText_(table, row, 'dietary', v.dietary);
    writeText_(table, row, 'parking', v.parking === null ? '' : v.parking ? 'Yes' : 'No');
    writeText_(table, row, 'wishes', v.wishes);
    writeText_(table, row, 'updatedAt', Utilities.formatDate(new Date(now_()), 'Asia/Singapore', 'yyyy-MM-dd HH:mm:ss'));
    return { ok: true, response: v };
  });
}

// ---------------------------------------------------------------------------
// Time / deadline
// ---------------------------------------------------------------------------

function now_() {
  return Date.now();
}

/** RSVPs are open while now < RSVP_DEADLINE (Script Property, ISO with +08:00). */
function isOpen_() {
  var raw = PropertiesService.getScriptProperties().getProperty('RSVP_DEADLINE');
  var deadline = raw ? Date.parse(raw) : NaN;
  if (isNaN(deadline)) {
    var err = new Error('Script property RSVP_DEADLINE is missing or not a valid date');
    err.code = 'config';
    throw err;
  }
  return now_() < deadline;
}

// ---------------------------------------------------------------------------
// Sheet access
// ---------------------------------------------------------------------------

function readTable_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');
  var values = sheet.getDataRange().getValues();
  var headerRow = values[0] || [];
  var col = {};
  REQUIRED_HEADERS.forEach(function (key) {
    var idx = -1;
    for (var i = 0; i < headerRow.length; i++) {
      if (String(headerRow[i]).trim().toLowerCase() === HEADERS[key].toLowerCase()) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error('Missing column header "' + HEADERS[key] + '"');
    col[key] = idx;
  });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    var surnameText = String(v[col.surname] === undefined ? '' : v[col.surname]);
    rows.push({
      sheetRow: r + 1, // 1-based row number in the sheet
      // greeting name: the Name column, or the surname if Name is blank
      name: String(v[col.name] === undefined ? '' : v[col.name]).trim() || surnameText.trim(),
      surname: surnameText,
      phone: String(v[col.phone] === undefined ? '' : v[col.phone]),
      seats: parseSeats_(v[col.seats]),
      code: String(v[col.code] === undefined ? '' : v[col.code]).trim(),
      attending: String(v[col.attending] === undefined ? '' : v[col.attending]).trim(),
      partySize: v[col.partySize],
      dietary: String(v[col.dietary] === undefined ? '' : v[col.dietary]),
      parking: String(v[col.parking] === undefined ? '' : v[col.parking]).trim(),
      wishes: String(v[col.wishes] === undefined ? '' : v[col.wishes]),
    });
  }
  return { sheet: sheet, col: col, rows: rows };
}

function parseSeats_(value) {
  var n = typeof value === 'number' ? value : Number(String(value).trim());
  return isFinite(n) && n % 1 === 0 && n >= 1 ? n : null;
}

function findByCode_(rows, k) {
  if (!isCodeFormat_(k)) return null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].code === k) return rows[i];
  }
  return null;
}

/** The stored response for a row, or null if the guest hasn't replied. */
function responseOf_(row) {
  if (row.attending !== 'Attending' && row.attending !== 'Declined') return null;
  var attending = row.attending === 'Attending';
  var n = typeof row.partySize === 'number' ? row.partySize : Number(row.partySize);
  return {
    attending: attending,
    partySize: attending && isFinite(n) && String(row.partySize) !== '' ? n : null,
    dietary: unguard_(row.dietary),
    parking: row.parking === 'Yes' ? true : row.parking === 'No' ? false : null,
    wishes: unguard_(row.wishes),
  };
}

function writeCell_(table, row, key, value) {
  table.sheet.getRange(row.sheetRow, table.col[key] + 1).setValue(value);
}

/** Write text into a plain-text cell, neutralising spreadsheet formulas. */
function writeText_(table, row, key, value) {
  var range = table.sheet.getRange(row.sheetRow, table.col[key] + 1);
  range.setNumberFormat('@');
  range.setValue(guard_(String(value)));
}

/** A leading = + - @ would be a formula if the sheet is exported/re-opened: prefix an apostrophe. */
function guard_(text) {
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function unguard_(text) {
  return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, error: 'busy' };
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Access codes (hidden per-invitation device codes)
// ---------------------------------------------------------------------------

function isCodeFormat_(k) {
  return typeof k === 'string' && CODE_PATTERN.test(k);
}

/** 12 base62 characters (~71 bits) from a random UUID, unique among existing codes. */
function newCode_(rows) {
  var used = {};
  rows.forEach(function (r) {
    if (r.code) used[r.code] = true;
  });
  for (var attempt = 0; attempt < 20; attempt++) {
    // Base-62 digits of the UUID's 128 bits, by repeated division of its hex digits (no BigInt).
    var digits = Utilities.getUuid().replace(/-/g, '').split('').map(function (c) { return parseInt(c, 16); });
    var out = '';
    for (var i = 0; i < CODE_LENGTH; i++) {
      var rem = 0;
      for (var j = 0; j < digits.length; j++) {
        var cur = rem * 16 + digits[j];
        digits[j] = Math.floor(cur / 62);
        rem = cur % 62;
      }
      out += BASE62.charAt(rem);
    }
    if (!used[out]) return out;
  }
  throw new Error('Could not generate a unique access code');
}

// ---------------------------------------------------------------------------
// Matching rules — MIRROR of site/js/verify-rules.js
// ---------------------------------------------------------------------------

function normaliseSurname_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}]/gu, '');
}

function last4_(phone) {
  var digits = String(phone === null || phone === undefined ? '' : phone).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function isValidLast4_(value) {
  return /^\d{4}$/.test(String(value === null || value === undefined ? '' : value).trim());
}

function guestKey_(surname, phone) {
  var s = normaliseSurname_(surname);
  var d = last4_(phone);
  return s && d ? s + '|' + d : null;
}

function findMatches_(rows, surname, digits) {
  if (!guestKey_(surname, digits) || !isValidLast4_(digits)) return [];
  var wanted = normaliseSurname_(surname) + '|' + String(digits).trim();
  var hits = [];
  rows.forEach(function (row, i) {
    if (guestKey_(row.surname, row.phone) === wanted) hits.push(i);
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Response validation — MIRROR of site/js/rsvp-rules.js
// ---------------------------------------------------------------------------

function validateResponse_(response, seats) {
  var r = response || {};
  var fields = {};
  var maxParty = typeof seats === 'number' && seats % 1 === 0 && seats >= 1 ? seats : 1;

  if (typeof r.attending !== 'boolean') fields.attending = 'Please let us know if you can make it.';

  var wishes = typeof r.wishes === 'string' ? r.wishes.trim() : '';
  if (wishes.length > MAX_WISHES) fields.wishes = 'Please keep this under ' + MAX_WISHES + ' characters.';

  if (r.attending === false) {
    return finish_(fields, { attending: false, partySize: null, dietary: '', parking: null, wishes: wishes });
  }

  var partySize = null;
  var dietary = '';
  var parking = null;

  if (r.attending === true) {
    var n = typeof r.partySize === 'string' && r.partySize.trim() !== '' ? Number(r.partySize) : r.partySize;
    if (typeof n !== 'number' || n % 1 !== 0 || n < 1 || n > maxParty) {
      fields.partySize = maxParty === 1 ? 'Party size is 1 for this invitation.' : 'Please choose between 1 and ' + maxParty + '.';
    } else {
      partySize = n;
    }
    dietary = typeof r.dietary === 'string' ? r.dietary.trim() : '';
    if (dietary.length > MAX_DIETARY) fields.dietary = 'Please keep this under ' + MAX_DIETARY + ' characters.';
    if (r.parking === true || r.parking === false) parking = r.parking;
    else if (r.parking !== null && r.parking !== undefined) fields.parking = 'Please choose yes or no.';
  }

  return finish_(fields, { attending: r.attending === true, partySize: partySize, dietary: dietary, parking: parking, wishes: wishes });
}

function finish_(fields, value) {
  var ok = Object.keys(fields).length === 0;
  return { ok: ok, fields: fields, value: ok ? value : null };
}

// ---------------------------------------------------------------------------
// Sheet menu: Wedding -> Check guest list
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Wedding').addItem('Check guest list', 'checkGuestList').addToUi();
}

/**
 * Highlights rows with a missing surname, missing/invalid seats or a phone with
 * fewer than 4 digits, and every group of rows sharing the same surname + last 4
 * digits (they could not be told apart when verifying). Reports a summary.
 */
function checkGuestList() {
  var table = readTable_();
  var problems = findGuestListProblems_(table.rows);

  // Clear only the highlights this check applied earlier (keep Rae's own colours).
  var sheet = table.sheet;
  var nRows = table.rows.length;
  var nCols = sheet.getLastColumn();
  if (nRows > 0) {
    var range = sheet.getRange(2, 1, nRows, nCols);
    var colors = range.getBackgrounds();
    var changed = false;
    for (var r = 0; r < colors.length; r++) {
      for (var c = 0; c < colors[r].length; c++) {
        if (String(colors[r][c]).toLowerCase() === FLAG_COLOR.toLowerCase()) {
          colors[r][c] = null;
          changed = true;
        }
      }
    }
    if (changed) range.setBackgrounds(colors);
  }

  var flagged = {};
  problems.forEach(function (p) {
    flagged[p.sheetRow] = true;
  });
  Object.keys(flagged).forEach(function (sheetRow) {
    sheet.getRange(Number(sheetRow), 1, 1, nCols).setBackground(FLAG_COLOR);
  });

  var message;
  if (problems.length === 0) {
    message = 'No problems found in ' + nRows + ' rows.';
  } else {
    message =
      problems
        .map(function (p) {
          return 'Row ' + p.sheetRow + ': ' + p.message;
        })
        .join('\n') +
      '\n\nProblem rows are highlighted. Fix them and run the check again.';
  }
  SpreadsheetApp.getUi().alert('Guest list check', message, SpreadsheetApp.getUi().ButtonSet.OK);
  return problems;
}

function findGuestListProblems_(rows) {
  var problems = [];
  var groups = {};
  rows.forEach(function (row) {
    if (!row.name && !row.surname && !row.phone && row.seats === null) return; // blank row
    if (!normaliseSurname_(row.surname)) problems.push({ sheetRow: row.sheetRow, message: 'missing Surname' });
    if (!last4_(row.phone)) problems.push({ sheetRow: row.sheetRow, message: 'Phone is missing or has fewer than 4 digits' });
    if (row.seats === null) problems.push({ sheetRow: row.sheetRow, message: 'Seats is missing or not a whole number of 1 or more' });
    var key = guestKey_(row.surname, row.phone);
    if (key) (groups[key] = groups[key] || []).push(row);
  });
  Object.keys(groups).forEach(function (key) {
    var g = groups[key];
    if (g.length < 2) return;
    var rowNumbers = g.map(function (r) {
      return r.sheetRow;
    });
    g.forEach(function (r) {
      problems.push({
        sheetRow: r.sheetRow,
        message: 'same Surname and last 4 digits as row(s) ' + rowNumbers.filter(function (n) { return n !== r.sheetRow; }).join(', ') + ' (these guests could not be told apart)',
      });
    });
  });
  problems.sort(function (a, b) {
    return a.sheetRow - b.sheetRow;
  });
  return problems;
}
