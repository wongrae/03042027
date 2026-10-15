# Design

## Context

This is a greenfield build. The repo has only OpenSpec scaffolding. The approved visual source is three Claude Design boards (`Main.dc.html`, `RSVP.dc.html`, `Gallery.dc.html`) plus six placeholder images, snapshotted in the reference package's `design-reference/` folder. That folder's README explains the artifact-only constructs to translate: `<x-dc>`, `<helmet>`, `{{…}}` holes filled by `renderVals()`, `<sc-if>`, `data-props`, and `/_blob/<hash>` image URLs.

Constraints that shape the approach (motivation in proposal.md):
- **Hosting is GitHub Pages**, which serves static files only. It has no server code, no secrets and no request-time routing, so anything that needs privacy or authority lives in Google Apps Script.
- **Rae edits data in a Google Sheet** and should never need to touch code or redeploy to manage guests.
- This is a solo project with low traffic (one wedding's guest list) and should need no maintenance once launched.
- Palette tokens, fonts, tone and breakpoints (≤680px main, ≤480px RSVP) come from the mockup CSS and are ported as-is.

## Goals / Non-Goals

**Goals:**
- A faithful port of the mockup. CSS, copy and breakpoints carry over, and only artifact templating is translated.
- Phase logic that can be unit tested and gives the same answer in every visitor time zone.
- RSVP data that can't be enumerated and can't be written after the deadline, enforced server-side.
- A deploy path where pushing to `main` updates the site.

**Non-Goals:**
- No admin UI. The Google Sheet is the admin UI.
- No final full-gallery design. It stays a placeholder (see `specs/gallery`).
- No photo upload pipeline. Gallery photos are committed into the repo after the wedding.
- No email/SMS sending (no OTP, no alerts). Rae shares one site link with everyone, e.g. in group chats.
- No attempt limiting or lockout on verification for now (Rae's decision; see Risks).
- No offline support, analytics or i18n.

## Decisions

### 1. Plain static HTML/CSS/ES modules, no framework or build step
The site has three pages and one form, and the mockup is already hand-written HTML/CSS, so porting is mostly copy-and-translate. Native ES modules (`<script type="module">`) give enough structure.
- *Alternatives:* Astro or Vite would add templating and asset hashing, but bring a toolchain to maintain and an Actions build step, for a three-page site. Rejected.
- *Layout:*
  ```
  site/                       ← the only folder deployed
    index.html                ← Main board
    rsvp/index.html           ← RSVP board (all states in one page)
    gallery/index.html        ← Gallery board (placeholder)
    css/base.css              ← tokens, fonts, shared classes from the boards
    js/config.js              ← weddingDate, rsvpDeadline, API URL
    js/phase.js               ← pure: getPhase(now, cfg), countdownParts(now, cfg)
    js/clock.js               ← serverNow(): server Date header → corrected "now"
    js/access.js              ← remember / forget the device access code
    js/verify-rules.js        ← pure: normaliseSurname, last4 (shared logic, mirrored in Code.gs)
    js/api.js                 ← fetch wrapper for Apps Script
    js/main.js, rsvp.js, gallery.js, hero.js
    img/                      ← placeholder images (later: real assets)
  backend/Code.gs             ← Apps Script source (copied into the Sheet's script)
  tests/*.test.mjs            ← node --test
  design-reference/           ← copied from the reference package, read-only
  ```
- **All internal URLs are relative** (`./rsvp/`, `../`), so the site works the same at `https://<user>.github.io/<repo>/` and on a custom domain.

### 2. Phase computed client-side from fixed-offset instants
`config.js` stores `weddingDate = "2027-04-03T00:00:00+08:00"` and `rsvpDeadline` as an ISO string with an explicit `+08:00` offset. It is marked `// PLACEHOLDER — set before launch`. `getPhase(now, cfg)` compares epoch milliseconds, so the visitor's time zone has no effect. Singapore has no DST, so a fixed offset is exact.
- The pill and gallery teaser are kept in `<template>` elements and cloned into the DOM only for the right phase. This makes "absent, not hidden" literal, and teaser images aren't requested before Phase 3.
- **Server time, not device time:** on load, `clock.js` makes a lightweight request to the page's own origin (`fetch('./', {method:'HEAD', cache:'no-store'})`) and reads the HTTP `Date` header, which is always GMT. It stores `offset = serverTime - Date.now()` and returns `Date.now() + offset` as "now". GMT vs. the `+08:00` config dates doesn't matter, since both are exact instants. If the request fails or the header is missing or unparsable, the offset is 0 (device clock). The offset is measured around the request's midpoint to keep error under a second or two.
- The countdown re-renders on a timer aligned to the next minute boundary, using the corrected "now".
- **Preview override:** `?now=<ISO>` is honoured only when `location.hostname` is `localhost` or `127.0.0.1`. That's enough for QA and can't affect guests.
- *Alternative:* having Apps Script report the phase. That adds a ~1–2s round-trip to every landing-page load, and the client clock is good enough for display. **Authority over writes stays server-side** (Decision 4).

### 3. Surname + phone last-4 verification, then a remembered device code
- **Why this method:** Rae may send one invite link to group chats, so a per-guest link can't identify anyone. Rae has every guest's phone number, and surname avoids first-name and nickname variations.
- **Matching** (`verify-rules.js`, mirrored in `Code.gs`): the surname is lower-cased with everything except letters removed (so "  Tan ", "TAN", "O'Neil" vs "ONeil" all match). The phone keeps digits only and takes the last 4. A match needs exactly one row with equal surname and last 4. Zero or several matches give the same `not_found`.
- **Verify is a POST** (`{action:"verify", surname, last4}`), so the surname and digits don't end up in URLs, browser history or Google's request logs.
- **Device code:** on success the backend returns the row's hidden `Code`, creating it if the cell is empty. It's 12 base62 characters (~71 bits) derived from `Utilities.getUuid()`, and it is unique. `access.js` stores it in `localStorage` (key `rr.k`). Later `get`/`save` calls use only the code, never the surname/digits.
  - If `localStorage` throws (some private modes), the code is held in memory, so the guest only needs to re-verify on a later visit.
  - "Not you?" and any `not_found` on `get` clear the stored code and show verification.
  - Clearing `Code` in the Sheet revokes every device for that row.
- **No attempt limiting** (Rae's call for now). The verification screen always carries the "reach out to Rae or Rayven if you're unable to verify" note. The guessing risk is recorded under Risks. If it ever becomes a concern, a per-surname cooldown in `CacheService` can be added later without changing the client.
- *Alternatives considered with Rae:* a personal link/QR per invitation (doesn't work with a shared group-chat link), and OTP by SMS/email/WhatsApp (cost, sender registration, friction).

### 4. Google Sheet + Apps Script web app as the backend
- The script is **container-bound** to the guest-list Sheet and deployed as a web app with *Execute as: me* and *Who has access: Anyone*. Only the script can read the Sheet. The Sheet itself stays private to Rae.
- **Sheet `Guests` tab**, with columns found by header name so Rae can reorder or add columns freely:
  `Name | Surname | Phone | Seats | Code | Attending | Party size | Dietary | Parking | Well wishes | Updated at | Notes`
  Rae fills `Name` (display name, e.g. "Alex & Sam Tan"), `Surname`, `Phone`, `Seats` and `Notes`. The script fills `Code` and everything after it.
- **API** (JSON over `ContentService`; POST bodies sent as `text/plain` to avoid a CORS preflight):
  - `POST {action:"verify", surname, last4}` → `{ok:true, k, name, seats, open, response|null}` or `{ok:false, error:"not_found"|"closed"}`
  - `GET ?action=get&k=<code>` → `{ok:true, name, seats, open, response|null}` or `{ok:false, error:"not_found"}`
  - `POST {action:"save", k, response}` → `{ok:true, response}`, `{ok:false, error:"closed"|"not_found"|"invalid", fields?}`
  - `open` is `now < RSVP_DEADLINE` on Google's clock. A save checks it again and returns `closed` without writing. `Phone` is never included in any response.
- **Writes** run inside `LockService.getScriptLock()` and update the single row found by code (or, for `verify`, only the empty `Code` cell). The script never appends rows. The response is re-validated server-side with the same rules as the form: attendance required, party size 1..Seats when attending, and party/dietary/parking cleared when declining. Text values are length-capped.
- **Formula-injection guard:** guest text is written to columns pre-formatted as plain text (`@`), and any value starting with `= + - @` is prefixed with `'`. That way a well-wish like `=IMPORTXML(…)` can't execute in Rae's Sheet.
- **Script Property:** `RSVP_DEADLINE` (ISO with `+08:00`).
- **Sheet menu "Wedding → Check guest list":** highlights rows with a missing `Surname`, missing `Seats`, or a `Phone` with fewer than 4 digits, plus every group of rows sharing the same normalised surname and last 4 digits. It shows a summary dialog. It's read-only apart from highlighting.
- *Alternatives:* Cloudflare Pages + D1 is more robust, but Rae would have to edit guests via CSV import rather than live in a sheet. Supabase/Turso would need an extra account and a secret held somewhere other than a static host. Both rejected in favour of Rae's editing workflow.
- Source lives in `backend/Code.gs` in the repo. It is deployed by pasting into the Sheet's Apps Script editor, with steps in `backend/README.md`. `clasp` is optional and not required.

### 5. Validation shared in spirit, duplicated in code
Apps Script can't import the site's ES modules. The rules are small, so they live in `site/js/rsvp-rules.js` and `site/js/verify-rules.js` (unit tested) and are mirrored in `Code.gs`. A comment in each points at the other.

### 6. Gallery teaser and full gallery
- The teaser ports the mockup's CSS marquee: the track is duplicated, with the second copy `aria-hidden` and its links `tabindex="-1"`, and it animates `translateX(-50%)`. A `.paused` class is toggled on `pointerenter`/`pointerleave` and on `touchstart`/`touchend`/`touchcancel`. Under `prefers-reduced-motion: reduce` the animation is off and the wrap becomes `overflow-x:auto`.
- `gallery/index.html` checks the phase first. Before Phase 3 it calls `location.replace('../')`. Its photo markup sits in a `<template>`, so nothing loads before then.

### 7. Hero scrubber built behind a feature check, still image by default
- When an asset is configured (`config.heroVideo`), the hero becomes a tall scroll section (100vh plus 40vh per second of video, between 250vh and 700vh, so a swipe moves the video gently) with a `position:sticky` full-viewport media layer. A `requestAnimationFrame` loop maps section scroll progress (0–1) to `video.currentTime = p * duration`.
- For smooth reverse seeking, the video must be encoded with every frame as a keyframe (`ffmpeg … -g 1`, H.264 MP4, muted, `playsinline`). If iOS Safari still seeks poorly with Rae's asset, the fallback is an image sequence drawn to `<canvas>` behind the same progress function. That choice is made when the asset arrives, without changing the spec.
- Without an asset, or under reduced motion, the hero is exactly the mockup's still-image layout. GSAP ScrollTrigger is rejected, since it adds a dependency for one effect.

### 8. Mockup clean-up during port
- The designer-only labels ("video · scroll-scrubbing animation" and "photo · single collage background, to be uploaded") are removed.
- `{{accent}}` becomes `var(--clay)`.
- `/_blob/<hash>` images are mapped to the matching `placeholder-images/*.jpg` by visual comparison.
- The info section's dashed borders are ported as in the mockup.
- On the RSVP page, the board's "search" state becomes the verification screen. Its "Full name" field becomes "Surname" plus a "Last 4 digits of your phone" field (`inputmode="numeric"`, `maxlength=4`), and the help line becomes the "reach out to Rae or Rayven if you're unable to verify" note. The not-found card's copy becomes "We couldn't find your invitation". The "Contact number" form field and summary row are removed. A small "Not you?" link sits by the greeting.

### 9. Deployment
- The repo is a public GitHub repository. Free-plan Pages needs a public repo, and nothing secret is committed: the Apps Script URL is public by nature, and guest data lives only in the Sheet.
- A GitHub Actions workflow (`.github/workflows/pages.yml`) uploads `site/` with `actions/upload-pages-artifact` and publishes with `actions/deploy-pages` on push to `main`.
- `npm test` (`node --test tests/`) runs in the same workflow before deploying.

## Risks / Trade-offs

- **Visitor's clock is wrong** → The site takes "now" from the server's `Date` header (Decision 2), so a wrong device clock doesn't change the phase. If that header can't be read it falls back to the device clock, which then only affects display. The backend enforces the deadline with its own clock either way.
- **Gallery files are public URLs even before Phase 3** → Real photos aren't committed until after the wedding. Pre-Phase-3 pages never reference them, which meets the spec's "no content exposed via the page" intent on static hosting.
- **The last 4 digits can be guessed (10,000 combinations, with no attempt limiting)** → Someone who knows a guest's surname could script guesses and then view or change that invitation's RSVP. This is accepted for now: it needs deliberate effort, phone numbers are never returned, and the blast radius is one row's RSVP. If misuse is spotted (odd `Updated at` times or changed answers), Rae can clear that row's `Code` to sign out every device, and a per-surname cooldown can be added later (Decision 3).
- **Common surnames with matching last 4 digits** → The *Check guest list* menu flags them before launch. At runtime an ambiguous match gets the generic message, and the help note points the guest to Rae or Rayven.
- **Guest's phone on file is out of date** → They can't verify, and the always-visible help note tells them to contact Rae or Rayven, who can update `Phone` in the Sheet.
- **Apps Script latency (~1–3s) and cold starts** → Show saving/loading states and disable double-submit. Quotas (~20k URL fetches/day) are far beyond wedding scale.
- **Apps Script deployment URL changes on a new deployment** → Always use *Manage deployments → Edit → New version* on the same deployment so the `/exec` URL stays fixed. This is documented in `backend/README.md`.
- **Rae edits a response cell by hand while a guest saves** → The last write wins on that row. This is acceptable, and `Updated at` shows when the guest last saved.
- **The deadline is set in two places (site config and Script Property)** → A pre-launch checklist task covers it, and the site's displayed phase never authorises writes, so a mismatch can't let late writes through.
- **iOS video seeking is jerky** → All-keyframe encoding first, with the canvas image-sequence fallback (Decision 7).
- **Formula injection into the Sheet** → Plain-text columns plus apostrophe prefix (Decision 4).

## Migration Plan

There's no existing system. The rollout:
1. Set up the repo and Pages workflow, and deploy a placeholder site.
2. Create the Sheet and Apps Script deployment, and put the `/exec` URL into `config.js`.
3. Do an end-to-end QA pass with a test row, then delete it.
4. Rae sets the real `rsvpDeadline` (both places), fills the guest list, runs *Check guest list* until it's clean, and shares the site link.

Rollback is reverting the commit on `main`, which redeploys the previous site. Sheet data is unaffected by site deploys.

## Open Questions

- The final `rsvpDeadline` date. It's a config value and doesn't change the design.
- Custom domain vs. `*.github.io`. Relative URLs make this a settings-only change.
- The hero asset format: video vs. image sequence (Decision 7 covers both).
- Whether the info-section collage photo arrives before launch. If not, the mockup's blush background ships as is.
