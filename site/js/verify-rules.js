// Guest verification rules: surname + last 4 digits of the phone number.
// Pure (no DOM) so it is unit-tested in Node.
// MIRRORED in backend/Code.gs (Apps Script can't import this file) — keep both
// in sync; the backend is the authority, the site only pre-checks input.

/** Lower-case, strip accents, and drop everything except letters ("  O'Neil " → "oneil"). */
export function normaliseSurname(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}]/gu, '');
}

/** Last 4 digits of a phone number ("+65 8123-4567" → "4567"), or null if it has fewer than 4 digits. */
export function last4(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** True for exactly four digits (surrounding spaces ignored). */
export function isValidLast4(value) {
  return /^\d{4}$/.test(String(value ?? '').trim());
}

/** Identity key for a guest row; two rows with the same key can't be told apart. */
export function guestKey(surname, phone) {
  const s = normaliseSurname(surname);
  const d = last4(phone);
  return s && d ? `${s}|${d}` : null;
}

/**
 * Indexes of rows matching an entered surname + last 4.
 * @param {{surname:string, phone:string}[]} rows
 */
export function findMatches(rows, surname, digits) {
  const key = guestKey(surname, digits);
  if (!key || !isValidLast4(digits)) return [];
  const wanted = `${normaliseSurname(surname)}|${String(digits).trim()}`;
  const hits = [];
  rows.forEach((row, i) => {
    if (guestKey(row.surname, row.phone) === wanted) hits.push(i);
  });
  return hits;
}
