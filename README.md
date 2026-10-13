# Rae & Rayven — wedding site

Wedding website for **3 April 2027, 12–3pm, Red House Seafood, Grand Copthorne**.
Plain static HTML/CSS/JS in `site/`, hosted on GitHub Pages. RSVPs and the guest list live in a private Google Sheet, accessed through a Google Apps Script web app (`backend/`).

The plan lives in `openspec/changes/initial-site-build/` (proposal, specs, design, tasks).

## Layout

| Path | What it is |
|---|---|
| `site/` | The deployed website (the only folder published) |
| `backend/` | Apps Script source + setup guide — see [`backend/README.md`](backend/README.md) |
| `tests/` | Unit tests (`node --test`) |
| `scripts/serve.mjs` | Dependency-free local preview server |
| `scripts/mock-backend.mjs` | Local stand-in for the Google backend (runs the real `Code.gs` on a fake sheet) |
| `design-reference/` | Read-only snapshot of the approved mockup — see [`design-reference/README.md`](design-reference/README.md) |

## Run locally

Requires Node.js 20+ (no `npm install` needed).

```bash
npm run serve        # http://localhost:8080/
npm test             # unit tests
```

### Previewing the three phases

On `localhost` / `127.0.0.1` only, add `?now=<date>` to simulate the current time:

| Phase | Example |
|---|---|
| 1 — RSVP open | `http://localhost:8080/?now=2026-12-01` (any date before the deadline) |
| 2 — RSVP closed | `http://localhost:8080/?now=2027-03-20` (between deadline and wedding) |
| 3 — wedding day | `http://localhost:8080/?now=2027-04-03` |

The preview date is remembered for the browser session, so it carries to the RSVP and gallery pages (`?now=` with no value clears it). It is ignored on the deployed site.

### Trying the RSVP flow without Google

```bash
npm run serve        # terminal 1 — the site on :8080
npm run mock         # terminal 2 — fake backend on :8787 (resets when stopped)
```

Open `http://localhost:8080/rsvp/?api=http://localhost:8787/` (the `?api=` is remembered, localhost only). Test guests, as *surname / last 4 digits*: **Tan 4567** (4 seats), **Lim 1111** (2), **Ng 4567** (1). **Lee 2222** matches two rows, so it's refused like an unknown guest. `http://localhost:8787/__mock/state` shows the fake sheet.
