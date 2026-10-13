// RSVP page. States (one visible at a time): loading, verify, notfound, error,
// form, submitted, closed. See openspec/changes/initial-site-build/specs/rsvp-flow.
import { config } from './config.js';
import { getPhase } from './phase.js';
import { syncClock } from './clock.js';
import { pageNowMs } from './page-now.js';
import { access } from './access.js';
import { pageApi } from './api.js';
import { isValidLast4, normaliseSurname } from './verify-rules.js';
import { validateResponse } from './rsvp-rules.js';

const $ = (id) => document.getElementById(id);
const STATES = ['loading', 'verify', 'notfound', 'error', 'form', 'submitted', 'closed'];

let api;
let guest = null; // { k, name, seats, response } once verified
let mode = 'new'; // 'new' | 'edit'
const choice = { attending: null, parking: null, party: 1 };

// ---------------------------------------------------------------- helpers

function show(name) {
  STATES.forEach((s) => ($(`state-${s}`).hidden = s !== name));
  window.scrollTo(0, 0);
  if (name === 'verify') $('surname').focus();
  else if (name !== 'loading') $(`state-${name}`).querySelector('[data-focus]')?.focus();
}

function showError(id, message) {
  const el = $(id);
  el.textContent = message;
  el.hidden = !message;
}

function setBusy(button, busyText, busy) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

function setRadio(groupId, value) {
  $(groupId)
    .querySelectorAll('[role="radio"]')
    .forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === value)));
}

const seatsOf = () => (Number.isInteger(guest?.seats) && guest.seats >= 1 ? guest.seats : 1);

// ---------------------------------------------------------------- start-up

async function init() {
  const clock = await syncClock({ timeoutMs: 2000 });
  if (getPhase(pageNowMs(clock), config) !== 1) return show('closed');
  api = pageApi();
  await resume();
}

/** Open the remembered invitation, or ask the guest to verify. */
async function resume() {
  const code = access.get();
  if (!code) return showVerify();
  show('loading');
  let r;
  try {
    r = await api.getInvitation(code);
  } catch (err) {
    console.error(err);
    return show('error');
  }
  if (r.ok) return r.open ? enter({ k: code, name: r.name, seats: r.seats, response: r.response }) : show('closed');
  if (r.error === 'not_found') {
    access.forget(); // revoked or unknown: start over
    return showVerify();
  }
  return r.error === 'closed' ? show('closed') : show('error');
}

function showVerify(message = '') {
  guest = null;
  clearVerifyErrors();
  showError('verify-error', message);
  show('verify');
}

function enter(g) {
  guest = g;
  document.querySelectorAll('[data-guest-name]').forEach((el) => (el.textContent = g.name));
  return g.response ? showSummary() : showForm(null);
}

function notYou() {
  access.forget();
  guest = null;
  $('surname').value = '';
  $('last4').value = '';
  resetForm();
  showVerify();
}

// ---------------------------------------------------------------- verification

function clearVerifyErrors() {
  for (const id of ['surname-error', 'last4-error', 'verify-error']) showError(id, '');
  $('surname').classList.remove('invalid');
  $('last4').classList.remove('invalid');
}

$('last4').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

let verifying = false;
$('verify-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (verifying) return; // already checking: never send twice
  clearVerifyErrors();
  const surname = $('surname').value.trim();
  const last4 = $('last4').value.trim();

  let firstBad = null;
  if (!normaliseSurname(surname)) {
    showError('surname-error', 'Please enter your surname.');
    $('surname').classList.add('invalid');
    firstBad = $('surname');
  }
  if (!isValidLast4(last4)) {
    showError('last4-error', 'Please enter exactly 4 digits.');
    $('last4').classList.add('invalid');
    firstBad ??= $('last4');
  }
  if (firstBad) return firstBad.focus();

  const button = $('verify-submit');
  verifying = true;
  setBusy(button, 'Checking…', true);
  let r;
  try {
    r = await api.verify(surname, last4);
  } catch (err) {
    console.error(err);
    showError('verify-error', "We couldn't reach the guest list. Please check your connection and try again.");
    return;
  } finally {
    verifying = false;
    setBusy(button, '', false);
  }

  if (r.ok) {
    access.set(r.k);
    $('surname').value = '';
    $('last4').value = '';
    return enter({ k: r.k, name: r.name, seats: r.seats, response: r.response });
  }
  if (r.error === 'not_found') return show('notfound');
  if (r.error === 'closed') return show('closed');
  showError(
    'verify-error',
    r.error === 'busy' ? "We're a little busy right now. Please try again in a moment." : "Something went wrong on our side. Please try again, or reach out to Rae or Rayven.",
  );
});

$('try-again').addEventListener('click', () => {
  $('last4').value = '';
  showVerify();
});
$('retry-load').addEventListener('click', () => resume());
document.querySelectorAll('[data-not-you]').forEach((b) => b.addEventListener('click', notYou));

// ---------------------------------------------------------------- the RSVP form

const FIELD_INPUTS = { dietary: 'dietary', wishes: 'wishes' };

function clearFormErrors() {
  for (const f of ['attending', 'partySize', 'dietary', 'parking', 'wishes', 'form']) showError(`${f}-error`, '');
  $('dietary').classList.remove('invalid');
  $('wishes').classList.remove('invalid');
}

function updateAttending() {
  setRadio('attending-group', choice.attending === null ? '' : choice.attending ? 'yes' : 'no');
  $('attending-only').hidden = choice.attending !== true;
}

function updateParty() {
  const max = seatsOf();
  choice.party = Math.min(Math.max(choice.party, 1), max);
  $('party-value').textContent = String(choice.party);
  $('party-minus').disabled = choice.party <= 1;
  $('party-plus').disabled = choice.party >= max;
  const hint = $('party-hint');
  hint.textContent = max === 1 ? 'This invitation is for 1 guest.' : `Your invitation covers up to ${max} guests.`;
  hint.hidden = false;
}

function resetForm() {
  choice.attending = null;
  choice.parking = null;
  choice.party = 1;
  $('dietary').value = '';
  $('wishes').value = '';
  clearFormErrors();
  updateAttending();
  setRadio('parking-group', '');
}

function showForm(response) {
  mode = response ? 'edit' : 'new';
  resetForm();
  if (response) {
    choice.attending = response.attending;
    choice.parking = response.parking;
    choice.party = response.partySize ?? 1;
    $('dietary').value = response.dietary || '';
    $('wishes').value = response.wishes || '';
    updateAttending();
    setRadio('parking-group', response.parking === null ? '' : response.parking ? 'yes' : 'no');
  }
  updateParty();
  $('form-submit').textContent = mode === 'edit' ? 'Update your RSVP' : 'Send RSVP';
  $('cancel-edit-wrap').hidden = mode !== 'edit';
  show('form');
}

$('attending-group').addEventListener('click', (e) => {
  const b = e.target.closest('[role="radio"]');
  if (!b) return;
  choice.attending = b.dataset.value === 'yes';
  showError('attending-error', '');
  updateAttending();
});

$('parking-group').addEventListener('click', (e) => {
  const b = e.target.closest('[role="radio"]');
  if (!b) return;
  const value = b.dataset.value === 'yes';
  choice.parking = choice.parking === value ? null : value; // tap again to clear (it's optional)
  setRadio('parking-group', choice.parking === null ? '' : choice.parking ? 'yes' : 'no');
});

$('party-minus').addEventListener('click', () => {
  choice.party -= 1;
  updateParty();
});
$('party-plus').addEventListener('click', () => {
  choice.party += 1;
  updateParty();
});
$('cancel-edit').addEventListener('click', () => showSummary());

function showFieldErrors(fields) {
  let first = null;
  for (const [field, message] of Object.entries(fields)) {
    showError(`${field}-error`, message);
    const input = FIELD_INPUTS[field] && $(FIELD_INPUTS[field]);
    input?.classList.add('invalid');
    first ??= input || $(`${field}-error`);
  }
  first?.scrollIntoView({ block: 'center' });
  if (first?.focus && first.tagName !== 'P') first.focus();
}

let saving = false;
$('rsvp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (saving) return; // already saving: never send twice
  clearFormErrors();
  const attending = choice.attending;
  const check = validateResponse(
    {
      attending,
      partySize: attending ? choice.party : undefined,
      dietary: $('dietary').value,
      parking: choice.parking,
      wishes: $('wishes').value,
    },
    guest.seats,
  );
  if (!check.ok) return showFieldErrors(check.fields);

  const button = $('form-submit');
  saving = true;
  setBusy(button, 'Saving…', true);
  let r;
  try {
    r = await api.save(guest.k, check.value);
  } catch (err) {
    console.error(err);
    showError('form-error', "We couldn't save your RSVP. Please check your connection and try again — your answers are still here.");
    return;
  } finally {
    saving = false;
    setBusy(button, '', false);
  }

  if (r.ok) {
    guest.response = r.response;
    return showSummary();
  }
  switch (r.error) {
    case 'closed':
      return show('closed');
    case 'not_found':
      access.forget();
      return showVerify('Please verify again to continue.');
    case 'invalid':
      return showFieldErrors(r.fields || {});
    case 'busy':
      return showError('form-error', "We're a little busy right now. Please try again in a moment.");
    default:
      return showError('form-error', "Something went wrong on our side. Please try again, or reach out to Rae or Rayven.");
  }
});

// ---------------------------------------------------------------- confirmation summary

function summaryRow(label, value, last) {
  const row = document.createElement('div');
  row.style.cssText = `display:flex; justify-content:space-between; gap:20px; padding:9px 0; font-size:14px;${last ? '' : ' border-bottom:1px solid var(--line);'}`;
  const l = document.createElement('span');
  l.style.color = 'var(--ink-muted)';
  l.textContent = label;
  const v = document.createElement('span');
  v.style.cssText = 'text-align:right; white-space:pre-wrap; overflow-wrap:anywhere;';
  v.textContent = value;
  row.append(l, v);
  return row;
}

function showSummary() {
  const r = guest.response;
  const rows = [['Attending', r.attending ? 'Joyfully attending' : 'Regretfully declining']];
  if (r.attending) {
    rows.push(['Party size', `${r.partySize} ${r.partySize === 1 ? 'guest' : 'guests'}`]);
    rows.push(['Meal', r.dietary || '—']);
    rows.push(['Parking', r.parking === null ? '—' : r.parking ? 'Yes' : 'No']);
  }
  if (r.wishes) rows.push(['Well wishes', r.wishes]);

  $('summary').replaceChildren(...rows.map(([l, v], i) => summaryRow(l, v, i === rows.length - 1)));
  $('submitted-message').textContent = r.attending
    ? "We've got your response — we'll see you on 3 April 2027."
    : "We've got your response — thank you for letting us know.";
  show('submitted');
}

$('edit-rsvp').addEventListener('click', () => showForm(guest.response));

init().catch((err) => {
  console.error(err);
  show('error');
});
