// Local stand-in for the Google Apps Script web app, for developing and testing
// the site without Google. It runs the REAL backend/Code.gs against an
// in-memory fake Sheet (scripts/fake-google.mjs). Data resets when it stops.
//
//   npm run mock                      → http://localhost:8787/
//   then open the site with:  http://localhost:8080/?api=http://localhost:8787/
//
// Dev-only controls (NOT part of the real backend):
//   GET  /__mock/state                              → the whole fake sheet (includes phones!)
//   POST /__mock/set {"now":"<ISO>"|null, "deadline":"<ISO>"}  → fake the backend clock / deadline
import { createServer } from 'node:http';
import { makeEnv, guest } from './fake-google.mjs';
import { config } from '../site/js/config.js';

const port = Number(process.argv[2] || process.env.MOCK_PORT || 8787);

const env = makeEnv({
  deadline: config.rsvpDeadline,
  guests: [
    guest('Alex & Sam Tan', 'Tan', '+65 8123 4567', 4),
    guest('Jamie Lim', 'Lim', '+65 9000 1111', 2),
    guest('Chris Ng', 'Ng', '9123 4567', 1),
    guest('Pat Lee', 'Lee', '8000 2222', 2), // Lee + 2222 …
    guest('Robin Lee', 'Lee', '9000 2222', 2), // … is ambiguous with the row above
  ],
});
let fakeNow = null;
env.ctx.now_ = () => (fakeNow ?? Date.now());

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (res, status, body) => res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify(body));

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();

  let body = '';
  for await (const chunk of req) body += chunk;

  if (url.pathname === '/__mock/state') return json(res, 200, { data: env.sheet.data, deadline: env.props.RSVP_DEADLINE, now: fakeNow });
  if (url.pathname === '/__mock/set' && req.method === 'POST') {
    const b = JSON.parse(body || '{}');
    if ('now' in b) fakeNow = b.now === null ? null : Date.parse(b.now);
    if (b.deadline) env.props.RSVP_DEADLINE = b.deadline;
    return json(res, 200, { now: fakeNow, deadline: env.props.RSVP_DEADLINE });
  }

  // Simulate Apps Script latency so busy/saving states are visible.
  await new Promise((r) => setTimeout(r, Number(process.env.MOCK_DELAY_MS ?? 300)));

  const out =
    req.method === 'POST'
      ? env.ctx.doPost({ postData: { contents: body } })
      : env.ctx.doGet({ parameter: Object.fromEntries(url.searchParams) });
  res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(out.text);
}).listen(port, () => {
  console.log(`Mock RSVP backend (runs backend/Code.gs on a fake sheet) → http://localhost:${port}/`);
  console.log('Test guests (surname / last 4):  Tan 4567 · Lim 1111 · Ng 4567 · Lee 2222 (ambiguous → not found)');
  console.log(`Deadline: ${env.props.RSVP_DEADLINE}`);
});
