# Tasks

Tasks marked **(Rae)** need Rae's accounts or decisions. Claude Code prepares everything around them and walks Rae through the clicks.

## 1. Repo and project scaffold

- [x] 1.1 Copy `design-reference/` from `C:\Users\WongR\Downloads\rae-rayven-openspec\rae-rayven-wedding\` into the repo root unchanged; verify all 4 board files, `canvas.json`, 6 images, `gen_placeholders.py` and `README.md` are present
- [x] 1.2 Create the folder layout from design.md Decision 1 (`site/` with `css/`, `js/`, `img/`, `rsvp/`, `gallery/`; `backend/`; `tests/`); add `package.json` (`"type":"module"`, `"test": "node --test tests/"`, `"serve"` script for a local static server) and `.gitignore` (`node_modules/`, `*.csv`, `*.xlsx` so guest-list exports never get committed); verify `npm test` runs (0 tests) without error
- [x] 1.3 Add a root `README.md` covering what the site is, the local run (`npm run serve`, `?now=` preview on localhost), the test command, and pointers to `backend/README.md` and `design-reference/README.md`; verify the documented commands run as written
- [x] 1.4 `git init`, first commit on `main`; verify `git log` shows the commit
- [x] 1.5 **(Rae)** Create a public GitHub repo, add it as `origin` and push; verify the repo page shows the files

## 2. Shared foundation: styles, config, phase logic

- [x] 2.1 Port the `<helmet>` font links and shared CSS from all three boards into `site/css/base.css` (tokens `--bg`, `--bg-blush`, `--bg-sage`, `--ink`, `--ink-muted`, `--clay`, `--line`, plus shared classes like `.eyebrow`, `.serif`, `.photo`, buttons and fields), with `{{accent}}` replaced by `var(--clay)`; verify no `{{`, `sc-if` or `/_blob/` strings remain in `site/` (grep)
- [x] 2.2 Map each `/_blob/<hash>` in the boards to the matching `placeholder-images/*.jpg` by viewing the images, then copy the files into `site/img/`; record the mapping in a comment in `design-reference/README.md`'s porting notes; verify every image referenced from `site/` exists
- [x] 2.3 Create `site/js/config.js` with `weddingDate: "2027-04-03T00:00:00+08:00"`, `rsvpDeadline` (marked `// PLACEHOLDER — set before launch`), `apiUrl` (empty until 4.7) and `heroVideo: null`; verify it imports cleanly in Node
- [x] 2.4 Implement `site/js/phase.js`: `getPhase(now, cfg)`, `countdownParts(now, cfg)` returning zero-padded `DDD`/`HH`/`MM`, and `resolveNow(location)` honouring `?now=` only on `localhost`/`127.0.0.1`; add `tests/phase.test.mjs` covering every `site-phases` scenario (both boundaries are inclusive in the right direction, a non-SGT offset input, the 123:04:20 example, and the override ignored on a non-local host); verify `npm test` passes
- [x] 2.5 Implement `site/js/clock.js`: `parseServerDate(header)`, `computeOffset(serverMs, requestStartMs, requestEndMs)`, and `serverNow()` that does a `HEAD` request to the page's own origin and falls back to offset 0 on any failure; add `tests/clock.test.mjs` covering a valid GMT header, a missing or garbage header, a device clock one month ahead, and the failed-request fallback; verify `npm test` passes, and manually verify on the deployed site (task 8.2) that with the device clock set a month ahead the phase still follows the real time

## 3. Landing page (`site-phases`, `gallery` teaser)

- [x] 3.1 Port the Main board into `site/index.html`: hero (still image), info section, footer, and the `<template>`s for the pill and gallery teaser; remove the designer-only labels; keep the ≤680px rules; verify it visually matches `Main.dc.html` at 1280px and 375px widths
- [x] 3.2 Implement `site/js/main.js` phase rendering using `serverNow()` (and `resolveNow` on localhost): Phase 1 inserts the clickable "RSVP" pill linking to `./rsvp/`; Phase 2 inserts a non-link countdown pill that re-renders each minute; Phase 3 inserts no pill and clones the gallery teaser below the info section; verify with `?now=` on localhost that each phase matches the spec, and that in Phases 1/2 DevTools shows no teaser element and no gallery image requests
- [x] 3.3 Port the marquee: duplicated track with `aria-hidden` / `tabindex="-1"` on the clone, pause on pointer hover and on touch hold, reduced-motion turns into a manually scrollable row, every photo and "View more" links to `./gallery/`; verify hover/touch pause, a seamless loop, and that the reduced-motion emulation in DevTools stops auto-scroll

## 4. Backend: Google Sheet + Apps Script (`guest-list`, `rsvp-flow` server side)

- [x] 4.1 Write `site/js/rsvp-rules.js` (`validateResponse(response, seats)` → `{ok, fields}`; normalises a decline by clearing party/dietary/parking) with `tests/rsvp-rules.test.mjs` covering the spec's invalid-input scenarios; verify `npm test` passes
- [x] 4.2 Write `site/js/verify-rules.js` (`normaliseSurname`, `last4`, `isValidLast4`) with `tests/verify-rules.test.mjs` covering the `guest-list` matching scenarios ("  tan " vs "Tan", "+65 8123 4567" → "4567", apostrophes/hyphens in surnames, phones shorter than 4 digits); verify `npm test` passes
- [x] 4.3 Write `backend/Code.gs`: header-name column lookup on the `Guests` tab; `doPost` `verify` (mirrored matching; exactly one match or generic `not_found`; create the `Code` if it's empty, as 12-char base62 from `Utilities.getUuid()`, unique) and `save`; `doGet` `get` by code; responses never include `Phone`; mirrored validation; deadline check from Script Property `RSVP_DEADLINE`; `LockService` around writes; update the single matched row plus `Updated at`; never append rows; plain-text formatting plus the `'` prefix guard; verify by reading the code against each `guest-list`/`rsvp-flow` scenario and noting the result in `backend/README.md`'s test log
- [x] 4.4 Add the "Wedding → Check guest list" sheet menu to `Code.gs`: highlight rows missing `Surname`/`Seats` or with a `Phone` of fewer than 4 digits, plus groups sharing a normalised surname and last 4, then show a summary dialog; verify on a test sheet with one deliberate duplicate and one missing phone that exactly those rows are flagged
- [x] 4.5 Write `backend/README.md`: Sheet template (exact headers and what each means), pasting the script, setting `RSVP_DEADLINE`, deploying as a web app (*Execute as: me*, *Anyone*), updating via *Manage deployments → New version* to keep the URL, running *Check guest list*, signing out a row's devices by clearing `Code`, and a manual test log; verify that following it from scratch produces a working `/exec` URL (done in 4.6)
- [x] 4.6 **(Rae)** Create the Google Sheet and the Apps Script deployment following `backend/README.md`; add two test rows; verify that a `verify` POST with a test row's surname and last 4 returns its name, seats and a code (and no phone), that wrong digits return `not_found`, and that `GET …?action=get&k=<that code>` returns the same row
- [x] 4.7 Put the `/exec` URL into `config.js` `apiUrl`; verify from the locally served site that a cross-origin GET and a `text/plain` POST both succeed without CORS errors
- [x] 4.8 Verify against the live deployment: a failed `verify` changes nothing in the Sheet; a save to a test row updates that row only (the row count is unchanged); a second save overwrites it; `=1+1` in well wishes is stored as literal text; with `RSVP_DEADLINE` temporarily set in the past, a save returns `closed` and the row is unchanged (then restore it)

## 5. RSVP page (`rsvp-flow` client side)

- [x] 5.1 Implement `site/js/access.js`: get/set/forget the device code in `localStorage` (key `rr.k`) with an in-memory fallback when storage throws; add `tests/access.test.mjs` for the fallback behaviour; verify `npm test` passes
- [x] 5.2 Implement `site/js/api.js` (`verify` and `save` as `text/plain` POSTs, `get` as GET, timeout, typed errors); verify against the live test rows from the browser console
- [x] 5.3 Port the RSVP board into `site/rsvp/index.html` with states: loading, verification (surname + last-4 fields, with the always-visible "reach out to Rae or Rayven if you're unable to verify" note), not-found card ("We couldn't find your invitation" plus the same note and "Try again"), form (no contact field, with a "Not you?" link by the greeting), submitted summary (no contact row), and closed notice; keep the ≤480px rules; verify each state visually against `RSVP.dc.html` at 560px and 375px
- [x] 5.4 Implement `site/js/rsvp.js` state logic (phase from `serverNow()`): outside Phase 1 show the closed notice only; no stored code shows verification; a stored code calls `get` (on `not_found`, forget it and show verification); a matched guest with no response sees the form, and one with a response sees the summary plus "Edit my RSVP"; "Not you?" forgets the code and shows verification; verify each branch with `?now=` and the test rows
- [x] 5.5 Implement the verification form: client-side checks (non-empty surname, exactly 4 digits) via `verify-rules.js`, a busy state that blocks double submit, the generic not-found card on failure, and storing the returned code on success; verify that wrong surname and wrong digits show the identical message, that a correct pair opens the right guest, and that reloading afterwards skips verification
- [x] 5.6 Implement the RSVP form: attendance pills, party-size stepper bounded 1..Seats, hiding party/dietary/parking when declining, inline field errors via `rsvp-rules.js`, "Send RSVP" vs. "Update your RSVP" copy, a saving state that blocks double submit, a retryable error that keeps entries, and handling of a `closed` response that switches to the closed notice; verify every `rsvp-flow` form scenario by hand on desktop and mobile, including DevTools offline mode for the network-failure case

## 6. Full gallery placeholder (`gallery`)

- [x] 6.1 Port the Gallery board into `site/gallery/index.html` with its photos inside a `<template>`, keeping its 860px/520px column rules, and `gallery.js` redirecting to `../` before Phase 3 (phase from `serverNow()`); verify that in Phase 1/2 (`?now=`) the page redirects home with no image requests, and in Phase 3 the placeholder masonry renders

## 7. Hero scroll-scrubbing (`hero-animation`)

- [x] 7.1 Implement `site/js/hero.js` per design Decision 7: active only when `config.heroVideo` is set and reduced motion is off; tall section with a sticky media layer; rAF scroll-progress → `currentTime`; otherwise leave the still layout untouched; verify with a temporary all-keyframe test clip (generated with ffmpeg from the still image or any short clip) that scrolling down and up scrubs both ways and holds when scrolling stops, then remove the test clip
- [ ] 7.2 Document in `README.md` how to add Rae's asset (the ffmpeg all-keyframe command, the file location, setting `heroVideo`) and the canvas image-sequence fallback; verify the ffmpeg command runs as written on the test clip
- [ ] 7.3 **(Rae, when ready)** Supply the hero video; encode it, set `heroVideo`, test scrubbing on iOS Safari and Android Chrome; if iOS seeking is jerky, switch to the canvas image-sequence path; verify smooth scrubbing on both

## 8. Deploy

- [x] 8.1 Add `.github/workflows/pages.yml` (on push to `main`: checkout → `npm ci` → `npm test` → upload `site/` → deploy-pages), leaving the existing `copilot-setup-steps.yml` untouched; verify the workflow file passes `actionlint` if available, or review it against GitHub's Pages starter workflow
- [x] 8.2 **(Rae)** Enable Pages with "Source: GitHub Actions" in repo settings and push; verify the Actions run is green and the site loads at the Pages URL, including `rsvp/` and `gallery/` subpaths

## 9. End-to-end QA (integration)

- [x] 9.1 On the deployed site with a test row: verify with the row's surname and last 4, RSVP as attending, reload and see the summary without re-verifying, edit to declining, then confirm in the Sheet that there is still one row with the updated values and `Updated at`
- [x] 9.2 On a second browser: wrong digits show the generic not-found card with the contact note, and the Sheet is unchanged; then use "Not you?" on the first browser and confirm it returns to verification
- [x] 9.3 Clear the test row's `Code` in the Sheet; verify the first browser is sent back to verification on its next visit
- [x] 9.4 Walk Phases 1/2/3 locally via `?now=` on desktop (1280px) and mobile (375px, ≤680px/≤480px breakpoints): pill behaviour, countdown, teaser presence, gallery gating, RSVP closed notice
- [x] 9.5 Confirm that no guest data is in the served files or API responses: search the deployed `site/` output and repo for test-row names, phones and codes (expecting no matches), and check in DevTools that no API response contains a phone number

## 10. Launch checklist

- [x] 10.1 **(Rae)** Set the real `rsvpDeadline` in `site/js/config.js` and in the Script Property `RSVP_DEADLINE` (same instant, `+08:00`); verify that `getPhase` at deadline-minus-1-minute and deadline-plus-1-minute gives Phase 1 and Phase 2 locally, and that the backend `open` flag matches
- [ ] 10.2 **(Rae)** Delete the test rows, fill the real guest list (Name, Surname, Phone, Seats), and run *Check guest list* until it reports no problems; verify by spot-checking three real guests' surname + last 4 on the live site (then clear those rows' `Code` so the test devices are signed out)
- [ ] 10.3 **(Optional, Rae)** Custom domain: configure DNS and the Pages custom domain; verify HTTPS works and the RSVP flow works on the new domain

## Workflow follow-up

- Swap in real info-section collage photo and (after the wedding) real gallery photos as separate changes.
- Design the final full-gallery layout with Rae as its own change (explicitly deferred).
- Consider a per-surname verification cooldown as a separate change if guessing ever becomes a concern.
- Archive this change with `/opsx:archive` once implementation and QA are complete.
