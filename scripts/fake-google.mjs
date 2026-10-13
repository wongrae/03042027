// Fake Google Apps Script services (Sheet, locks, properties, ...) so backend/Code.gs
// can run in Node: used by tests/backend.test.mjs and scripts/mock-backend.mjs.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const SOURCE = readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8');

export const HEADER = ['Name', 'Surname', 'Phone', 'Seats', 'Code', 'Attending', 'Party size', 'Dietary', 'Parking', 'Well wishes', 'Updated at', 'Notes'];
export const guest = (name, surname, phone, seats, extra = {}) => {
  const row = [name, surname, phone, seats, '', '', '', '', '', '', '', ''];
  for (const [h, v] of Object.entries(extra)) row[HEADER.indexOf(h)] = v;
  return row;
};
export const DEFAULT_GUESTS = () => [
  guest('Alex & Sam Tan', 'Tan', '+65 8123 4567', 4),
  guest('Jamie Lim', 'Lim', '+65 9000 1111', 2),
  guest('Chris Ng', 'Ng', '91234567', 1),
];

export const BEFORE_DEADLINE = Date.parse('2027-02-01T12:00:00+08:00');
export const DEADLINE = '2027-03-01T23:59:59+08:00';

class FakeSheet {
  constructor(data) {
    this.data = data.map((r) => [...r]);
    this.formats = new Map();
    this.bg = new Map();
  }
  getDataRange() {
    return { getValues: () => this.data.map((r) => [...r]) };
  }
  getLastColumn() {
    return this.data[0].length;
  }
  getRange(r, c, nr = 1, nc = 1) {
    const self = this;
    const cells = [];
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) cells.push([r + i, c + j]);
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => self.data[r - 1 + i].slice(c - 1, c - 1 + nc)),
      setValue: (v) => {
        self.data[r - 1][c - 1] = v;
      },
      setNumberFormat: (f) => cells.forEach(([a, b]) => self.formats.set(`${a},${b}`, f)),
      setBackground: (color) => cells.forEach(([a, b]) => self.bg.set(`${a},${b}`, color)),
      getBackgrounds: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => self.bg.get(`${r + i},${c + j}`) ?? '#ffffff')),
      setBackgrounds: (m) => m.forEach((row, i) => row.forEach((color, j) => (color === null ? self.bg.delete(`${r + i},${c + j}`) : self.bg.set(`${r + i},${c + j}`, color)))),
    };
  }
}

export function makeEnv({ guests = DEFAULT_GUESTS(), header = HEADER, deadline = DEADLINE, now = BEFORE_DEADLINE } = {}) {
  const sheet = new FakeSheet([header, ...guests]);
  const env = { sheet, now, lockBusy: false, props: { RSVP_DEADLINE: deadline }, alerts: [], menu: null, errors: [] };
  const ui = {
    ButtonSet: { OK: 'OK' },
    alert: (title, message) => env.alerts.push({ title, message }),
    createMenu: (name) => ({ addItem: (label, fn) => ({ addToUi: () => (env.menu = { name, label, fn }) }) }),
  };
  const ctx = {
    console: { error: (...a) => env.errors.push(a.join(' ')), log() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: (n) => (n === 'Guests' ? sheet : null) }),
      getUi: () => ui,
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          if (env.lockBusy) throw new Error('lock timeout');
        },
        releaseLock() {},
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => env.props[k] ?? null }) },
    Utilities: {
      getUuid: () => randomUUID(),
      formatDate: (date, tz, fmt) => {
        const p = Object.fromEntries(
          new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
            .formatToParts(date)
            .map((x) => [x.type, x.value]),
        );
        assert.equal(fmt, 'yyyy-MM-dd HH:mm:ss');
        return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
      },
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({ text, mime: null, setMimeType(m) { this.mime = m; return this; } }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx, { filename: 'Code.gs' });
  ctx.now_ = () => env.now;

  const parse = (out) => JSON.parse(out.text);
  const post = (body) => parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }));
  env.ctx = ctx;
  env.post = post;
  env.get = (params) => parse(ctx.doGet({ parameter: params }));
  env.verify = (surname, last4Input) => post({ action: 'verify', surname, last4: last4Input });
  env.save = (k, response) => post({ action: 'save', k, response });
  env.dataRows = () => sheet.data.slice(1);
  env.snapshot = () => JSON.stringify(sheet.data);
  env.cell = (rowIdx, headerName) => sheet.data[rowIdx + 1][sheet.data[0].indexOf(headerName)];
  return env;
}

