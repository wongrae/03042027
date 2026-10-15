# Proposal

## Why

The design phase for Rae & Rayven's wedding site (3 April 2027, 12–3pm, Red House Seafood, Grand Copthorne) is complete and approved as a Claude Design mockup. Nothing has been built yet. This change turns the approved mockup and its behavior notes into a real, deployed site that guests can use to RSVP well ahead of the (still to be set) RSVP deadline.

The source material is the hand-authored OpenSpec reference package in `C:\Users\WongR\Downloads\rae-rayven-openspec\rae-rayven-wedding\` (`openspec/project.md`, four draft capability specs, draft change `0001-initial-site-build`, and `design-reference/` mockup snapshots). This change supersedes that draft change and brings its specs into this repo's OpenSpec as proper new capabilities. It also locks in decisions the draft left open.

## What Changes

- Bring the reference package's `design-reference/` folder (mockup boards and placeholder images) into the repo as read-only porting material.
- Build the site as plain static HTML/CSS/JS hosted on **GitHub Pages**, with no framework and no build step. Port the three approved boards (`Main`, `RSVP`, `Gallery`), keeping their CSS, copy and breakpoints.
- Compute the site phase automatically from the current date/time against `rsvpDeadline` (placeholder until Rae sets it) and `weddingDate` (2027-04-03), in Singapore time. This drives the floating pill (RSVP link → countdown → absent) and the visibility of the gallery teaser.
- Keep the guest list and RSVP responses in a **Google Sheet** that Rae edits directly. A **Google Apps Script** web app is the only backend.
- **Change from the draft spec:** instead of a full-name search, guests verify with their **surname + the last 4 digits of their phone number**. Everyone receives the same site link, which can be shared in group chats, and Rae has every guest's phone number in the sheet. A failed check shows one generic "couldn't find your invitation" message, and the screen always notes to reach out to Rae or Rayven if they can't verify. Nothing is ever created for an unverified visitor. After verifying, the device is remembered so returning guests skip the check.
- The RSVP form drops the contact-number field, since phone numbers are already on the guest list.
- RSVP submit writes into the guest's existing sheet row. Re-visiting shows the saved response and lets the guest edit the same row (no duplicates). Writes are rejected by the backend after the deadline.
- Outside Phase 1, the RSVP page shows a minimal "RSVPs have closed" notice with a link home.
- Gallery teaser (Phase 3 only): an auto-cycling filmstrip that pauses on hover/touch and respects `prefers-reduced-motion`, linking to a full-gallery page that stays a structural placeholder.
- Hero scroll-scrubbing animation: implement the scrubber, but ship with the static still until Rae supplies the video. This does not block the rest of the build.
- A "Check guest list" action in the sheet that flags rows missing a surname or phone number, and rows that would be ambiguous (same surname and same last 4 digits).

## Capabilities

### New Capabilities
- `site-phases`: automatic Phase 1/2/3 determination from dates, and how the landing page's floating pill and gallery teaser behave in each phase.
- `guest-list`: the Google Sheet as the editable source of guests and responses; surname + phone-digits matching; the guest-list check; hidden per-invitation device codes; the list is never exposed to visitors.
- `rsvp-flow`: surname + last-4-digits verification, remembering the device, the RSVP form fields, submit/confirmation, edit-in-place, and closed-state behavior.
- `gallery`: Phase 3 landing-page teaser (auto-cycling, accessible) and the gated full-gallery placeholder page.
- `hero-animation`: scroll-position-driven, reversible hero playback from a single uploaded asset, with a static-still fallback.

### Modified Capabilities
- None. `openspec/specs/` is empty, so every capability is introduced fresh.

## Impact

- **New code:** static site (`site/`: pages, CSS, JS modules, images); Apps Script backend source (`backend/`); GitHub Actions workflow to deploy `site/` to GitHub Pages.
- **External systems:** a Google Sheet + Apps Script web app owned by Rae's Google account; a GitHub repository with Pages enabled; an optional custom domain.
- **Dependencies:** none at runtime beyond Google Fonts (Cormorant Garamond, Jost). Node.js is used only for local unit tests.
- **Decisions still owed by Rae (non-blocking):** the real `rsvpDeadline`; a custom domain vs. the default `*.github.io` URL; the hero video asset; the info-section collage photo; and the final full-gallery layout (explicitly deferred).
- No breaking changes, since nothing has shipped before.
