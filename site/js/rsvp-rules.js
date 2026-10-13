// RSVP response validation. Pure (no DOM) so it is unit-tested in Node.
// MIRRORED in backend/Code.gs (Apps Script can't import this file) — keep both
// in sync; the backend re-validates everything the form checks.

export const MAX_DIETARY = 300;
export const MAX_WISHES = 1000;

/**
 * @param {object} response  { attending: boolean, partySize, dietary, parking: boolean|null, wishes }
 * @param {number} seats     seats offered on the invitation
 * @returns {{ ok: boolean, fields: Record<string,string>, value: object|null }}
 *   `fields` maps an invalid field name to a message; `value` is the normalised
 *   response to store (declines have party size / dietary / parking cleared).
 */
export function validateResponse(response, seats) {
  const r = response || {};
  const fields = {};
  const maxParty = Number.isInteger(seats) && seats >= 1 ? seats : 1;

  if (typeof r.attending !== 'boolean') {
    fields.attending = 'Please let us know if you can make it.';
  }

  const wishes = typeof r.wishes === 'string' ? r.wishes.trim() : '';
  if (wishes.length > MAX_WISHES) fields.wishes = `Please keep this under ${MAX_WISHES} characters.`;

  if (r.attending === false) {
    return finish(fields, { attending: false, partySize: null, dietary: '', parking: null, wishes });
  }

  let partySize = null;
  let dietary = '';
  let parking = null;

  if (r.attending === true) {
    const n = typeof r.partySize === 'string' && r.partySize.trim() !== '' ? Number(r.partySize) : r.partySize;
    if (!Number.isInteger(n) || n < 1 || n > maxParty) {
      fields.partySize = maxParty === 1 ? 'Party size is 1 for this invitation.' : `Please choose between 1 and ${maxParty}.`;
    } else {
      partySize = n;
    }

    dietary = typeof r.dietary === 'string' ? r.dietary.trim() : '';
    if (dietary.length > MAX_DIETARY) fields.dietary = `Please keep this under ${MAX_DIETARY} characters.`;

    if (r.parking === true || r.parking === false) parking = r.parking;
    else if (r.parking !== null && r.parking !== undefined) fields.parking = 'Please choose yes or no.';
  }

  return finish(fields, { attending: r.attending === true, partySize, dietary, parking, wishes });
}

function finish(fields, value) {
  const ok = Object.keys(fields).length === 0;
  return { ok, fields, value: ok ? value : null };
}
