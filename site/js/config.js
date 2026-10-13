// Single place for site-wide settings. Dates are exact instants written with
// an explicit Singapore offset (+08:00), so they mean the same thing for every
// visitor regardless of time zone.
export const config = {
  // Start of the wedding day, Singapore time. Phase 3 begins at this instant.
  weddingDate: '2027-04-03T00:00:00+08:00',

  // PLACEHOLDER — set before launch. RSVPs close at this instant (Phase 2 begins).
  // Must match the RSVP_DEADLINE script property in the Google Apps Script
  // (see backend/README.md) — the backend enforces it independently.
  rsvpDeadline: '2027-03-01T23:59:59+08:00',

  // Google Apps Script web app URL (the "/exec" address). Filled in once the
  // backend is deployed (task 4.7).
  apiUrl: '',

  // Path to the hero scroll-scrub video, e.g. './img/hero.mp4'. Leave null to
  // keep the static still image until the real asset is supplied.
  heroVideo: null,
};
