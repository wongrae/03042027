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

Requires Node.js 22+ (no `npm install` needed).

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

## Hero video (scroll-scrubbing)

Until a video is supplied the hero shows the placeholder still (`site/img/hero-still.jpg`). To switch on scroll-scrubbing:

1. Prepare the video **as a short, silent, all-keyframe MP4** — every frame a keyframe is what lets it scrub smoothly *backwards* as well as forwards (especially on iPhones). With [ffmpeg](https://ffmpeg.org/):

   ```bash
   ffmpeg -i input.mov -an -vf "scale=1280:-2,fps=30" \
     -c:v libx264 -preset slow -crf 26 -g 1 -pix_fmt yuv420p -movflags +faststart \
     site/img/hero.mp4
   ```

   `-g 1` makes every frame a keyframe, so files get big: aim for **5–10 seconds** and **under ~15 MB** (raise `-crf` or lower the width if it's larger).
2. In `site/js/config.js` set `heroVideo: './img/hero.mp4'`, then commit and push.
3. Test on a real iPhone and an Android phone: scroll down and back up — the frame should follow your finger in both directions.

Scrubbing is skipped (the still image stays) for visitors who ask their device for reduced motion, and on browsers that can't pin the hero; if the video fails to load the page falls back to the still automatically. If iPhone seeking is still jerky with your clip, the fallback is to draw an image sequence onto a `<canvas>` using the same scroll progress — ask Claude to add that.

## Deploying (GitHub Pages)

`.github/workflows/pages.yml` runs the tests and publishes `site/` on every push to `main`. One-time setup: create a **public** GitHub repository, push this project to it, then in the repo go to **Settings → Pages → Source: GitHub Actions**. The site appears at `https://<your-username>.github.io/<repo-name>/`. All links in the site are relative, so it works the same under a custom domain.
