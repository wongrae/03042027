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

The hero is a scroll-scrubbed video: the frame follows how far you have scrolled, forwards and backwards (no autoplay). It is already switched on with `site/video/hero.mp4` (`heroVideo` in `site/js/config.js`), and `site/img/hero-still.jpg` is the picture shown while it loads and as the fallback.

To use a different clip:

1. Make it **short, silent and all-keyframe**: every frame a keyframe is what lets it scrub smoothly *backwards* as well as forwards (especially on iPhones). With [ffmpeg](https://ffmpeg.org/):

   ```bash
   ffmpeg -i source-media/hero/hero-source.mov -t 6.933 -an -vf "scale=720:-2" \
     -c:v libx264 -preset slow -crf 28 -g 1 -pix_fmt yuv420p -movflags +faststart \
     site/video/hero.mp4
   ffmpeg -i site/video/hero.mp4 -frames:v 1 -q:v 4 site/img/hero-still.jpg
   ```

   `-t` trims the length (add `-ss <start>` before `-i` to start later). `-g 1` makes files big, so aim for **5-10 seconds** and **under ~10 MB** (raise `-crf` or lower the width if it is larger). The second command makes the still from the first frame so there is no flash when the video appears. Keep original clips in `source-media/` (not published).
2. If the file name changes, update `heroVideo` in `site/js/config.js`, then commit and push.
3. Test on a real iPhone and an Android phone: scroll down and back up; the frame should follow your finger in both directions.

How long the scroll takes is set automatically from the clip length (100vh plus 40vh per second of video, between 250vh and 700vh). To change the pace, edit `SCROLL_VH_PER_SECOND` in `site/js/hero.js`.

Scrubbing is skipped (the still image stays) for visitors who ask their device for reduced motion, and on browsers that cannot pin the hero; if the video fails to load the page falls back to the still automatically. If iPhone seeking is still jerky with your clip, the fallback is to draw an image sequence onto a `<canvas>` using the same scroll progress: ask Claude to add that.

## Deploying (GitHub Pages)

`.github/workflows/pages.yml` runs the tests and publishes `site/` on every push to `main`. One-time setup: create a **public** GitHub repository, push this project to it, then in the repo go to **Settings → Pages → Source: GitHub Actions**. The site appears at `https://<your-username>.github.io/<repo-name>/`. All links in the site are relative, so it works the same under a custom domain.

## Cleanup (local tools)

Two portable tools were downloaded outside the project to build and publish the site. Neither is part of the site, and both can be deleted once you are done pushing and encoding video:

- `C:\Users\WongR\gh-portable`: GitHub CLI, used to sign in and push. Deleting it does not sign you out of GitHub or stop the site; the saved login is in Windows credential storage (`gh auth logout` removes it first, if you want that).
- `C:\Users\WongR\ffmpeg-portable`: ffmpeg, used to encode the hero video (see *Hero video* above). Keep it if you will make another clip.

Also left for later: the real guest list (replace the test rows in the Sheet, run **Wedding → Check guest list**, then clear the test guests' `Code` cells) and the optional custom domain.
