# gallery Specification

## Purpose

Showcase wedding photos only once they exist, from the wedding day onward (Phase 3). The landing page gets an auto-cycling teaser, and a full gallery page is reachable from it. Before Phase 3 there is no gallery content or entry point.

## Requirements

### Requirement: Teaser auto-cycles as a seamless filmstrip
When visible (Phase 3, per `site-phases`), the gallery teaser SHALL continuously scroll its photos as a seamless looping filmstrip, without needing a manual scroll or swipe.

#### Scenario: Teaser in motion
- **WHEN** the landing page shows the gallery teaser
- **THEN** its photos move continuously and loop with no visible jump or gap at the wrap point

### Requirement: Teaser motion can be paused
The teaser's motion SHALL pause while a pointer hovers over it on desktop, and while a finger is touching it on touch devices. Motion SHALL resume when the hover or touch ends.

#### Scenario: Hover pauses motion
- **WHEN** a desktop visitor hovers over the teaser
- **THEN** the filmstrip stops moving until the pointer leaves

#### Scenario: Touch pauses motion
- **WHEN** a touch-device visitor presses and holds on the teaser
- **THEN** the filmstrip stops moving until they lift their finger

### Requirement: Teaser respects reduced-motion preference
For visitors whose system requests reduced motion, the teaser SHALL NOT auto-scroll. The photos SHALL instead remain reachable as a static, manually scrollable row.

#### Scenario: Reduced motion requested
- **WHEN** a visitor with `prefers-reduced-motion: reduce` views the teaser
- **THEN** the filmstrip does not auto-scroll and the photos can still be scrolled manually

### Requirement: Teaser links to the full gallery
Every teaser photo and the "View more" link SHALL navigate to the full gallery page.

#### Scenario: Clicking a teaser photo
- **WHEN** a visitor clicks or taps any photo in the teaser, or the "View more" link
- **THEN** they are taken to the full gallery page

### Requirement: Full gallery page is a placeholder, reachable only in Phase 3
The full gallery page SHALL exist only as the mockup's structural placeholder, since its final layout is deferred to Rae. Before Phase 3, opening its address directly SHALL show no gallery content and SHALL point the visitor back to the landing page.

#### Scenario: Full gallery on the wedding day
- **WHEN** a visitor opens the full gallery page in Phase 3
- **THEN** the placeholder gallery layout renders with its photos

#### Scenario: Full gallery hit directly before Phase 3
- **WHEN** a visitor opens the full gallery page's address in Phase 1 or Phase 2
- **THEN** no gallery photos are loaded or shown, and they are sent back to the landing page
