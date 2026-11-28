// Single place for site-wide settings. Dates are exact instants written with
// an explicit Singapore offset (+08:00), so they mean the same thing for every
// visitor regardless of time zone.
export const config = {
  // Start of the wedding day, Singapore time. Phase 3 begins at this instant.
  weddingDate: '2027-04-03T00:00:00+08:00',

  // PLACEHOLDER — set before launch. RSVPs close at this instant (Phase 2 begins).
  // Must match the RSVP_DEADLINE script property in the Google Apps Script
  // (see backend/README.md) — the backend enforces it independently.
  rsvpDeadline: '2027-01-30T23:59:59+08:00',

  // Google Apps Script web app URL (the "/exec" address). Filled in once the
  // backend is deployed (task 4.7).
  apiUrl: 'https://script.google.com/macros/s/AKfycbz6pbqn2zkO7po8BTij4MKpIgE4R93UMHapd2_AqbWXinW_sRWsB67VLOZZC3j1kr4y/exec',

  // Path to the hero scroll-scrub video, e.g. './img/hero.mp4'. Leave null to
  // keep the static still image until the real asset is supplied.
  heroVideo: './video/hero.mp4',

  // Path to the swipe-scrubbed video below the info section. PLACEHOLDER clip
  // until the real one is supplied; null keeps the still image (img/swipe-still.jpg).
  swipeVideo: './video/swipe.mp4',

  // Photos for the drag-around photo field below the swipe video. PLACEHOLDERS:
  // replace a file in site/img/photo-field/ with a real photo of the same name
  // (any shape; resize to ~1200px on the long side first). To show more or fewer
  // photos, add or remove lines here. An empty list hides the section.
  photoField: [
    './img/photo-field/01.jpg', './img/photo-field/02.jpg', './img/photo-field/03.jpg', './img/photo-field/04.jpg',
    './img/photo-field/05.jpg', './img/photo-field/06.jpg', './img/photo-field/07.jpg', './img/photo-field/08.jpg',
    './img/photo-field/09.jpg', './img/photo-field/10.jpg', './img/photo-field/11.jpg', './img/photo-field/12.jpg',
    './img/photo-field/13.jpg', './img/photo-field/14.jpg', './img/photo-field/15.jpg', './img/photo-field/16.jpg',
    './img/photo-field/17.jpg', './img/photo-field/18.jpg', './img/photo-field/19.jpg', './img/photo-field/20.jpg',
  ],
};
