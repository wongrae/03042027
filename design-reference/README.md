# Design reference (read-only — do not run these files as-is)

These are snapshots of the approved Claude Design mockup, pulled from the
live artifact on 2026-10-12 so Claude Code has something concrete to port
from without needing network access to claude.ai. **Treat them as reference
for markup/CSS/copy/behavior — not as files to serve directly.**

Live source of truth (if you ever want to check for newer edits):
https://claude.ai/artifact/F47TNK8Sdre345jSP6TWwU

## `mockup-boards/`

- `Main.dc.html` — the landing page (hero, info section, gallery teaser,
  footer, floating phase pill)
- `RSVP.dc.html` — the RSVP flow, all four states in one file (search /
  not-found / form / submitted)
- `Gallery.dc.html` — structural placeholder only for the full gallery page
  (final layout intentionally TBD — see `openspec/specs/gallery/spec.md`)
- `canvas.json` — the canvas index (board positions, notes). Not needed for
  the build itself, kept for completeness.

### Why these `.dc.html` files won't run as normal HTML

They're authored for Claude's "Design" canvas artifact type, so they contain
a few things a real browser/build won't understand out of the box:

- `<x-dc>...</x-dc>` wrapper and `<helmet>` — artifact-specific wrappers.
  The real content is what's inside `<x-dc>`; `<helmet>` just held
  `<style>`/font `<link>` tags, which port directly.
- `{{accent}}`, `{{floatingLabel}}`, `{{showGallery}}`, etc. — template
  holes filled by the `renderVals()` function in the trailing
  `<script type="text/x-dc" data-dc-script>` block. Port the *logic* in
  `renderVals()` (it's plain JS) into whatever templating/state the real
  app uses — e.g. `{{accent}}` becomes a real CSS variable or prop,
  `{{showGallery}}` becomes the real Phase 3 condition from
  `openspec/specs/site-phases/spec.md`.
- `<sc-if value="{{bool}}">...</sc-if>` — conditional rendering. Replace
  with your framework's real conditional (an `if`, a ternary, a
  framework's `v-if`/`{#if}`/etc.).
- `data-props='{...}'` on the script tag — this declared the little
  enum/color pickers used *only* to preview phases/accent while designing.
  It has no equivalent in the real site; phases are computed from real
  dates instead (see `site-phases` spec), not picked from a dropdown.
- `/_blob/<hash>` image URLs — these point at Claude's artifact asset
  store and won't resolve outside it. Use the real files in
  `placeholder-images/` instead (see below), or Rae's real photos once
  supplied.

Everything else — the actual CSS (custom properties, class names, layout),
the real copy/text content, and the structural HTML — is meant to carry
over as-is, or as close to it as the real stack allows.

## `placeholder-images/`

The six warm-muted placeholder images currently used in the mockup
(`hero-video-still.jpg` + 5 photo variants), plus the Python/Pillow script
(`gen_placeholders.py`) that generated them. These are stand-ins, not final
assets:

- `hero-video-still.jpg` stands in for the real hero video (see
  `openspec/specs/hero-animation/spec.md` — Rae hasn't supplied the real
  video yet).
- The 5 `photo-*.jpg` files stand in for (a) the single info-section
  collage photo Rae will design and upload separately, and (b) generic
  gallery/teaser imagery until real wedding photos exist.

Re-running `gen_placeholders.py` regenerates them (requires `pip install
pillow`) if you ever need more variants in the same style.
