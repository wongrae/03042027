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

The override is ignored on the deployed site.
