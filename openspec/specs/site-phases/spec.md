# site-phases Specification

## Purpose

Drive the site through its three life-cycle phases (RSVP open, RSVP closed, wedding day) automatically from configured dates, and define how the landing page's floating pill and gallery teaser behave in each phase.

## Requirements

### Requirement: Automatic phase determination
The system SHALL compute the current phase from the current date/time compared against two configured instants: `rsvpDeadline` and `weddingDate` (start of 3 April 2027). Both SHALL be interpreted in Singapore time (UTC+8), whatever the visitor's own time zone. There SHALL be no manual phase switch on the live site.

#### Scenario: Before the RSVP deadline
- **WHEN** the current instant is before `rsvpDeadline`
- **THEN** the site is in Phase 1 (RSVP open)

#### Scenario: Between the RSVP deadline and the wedding
- **WHEN** the current instant is on or after `rsvpDeadline` and before `weddingDate`
- **THEN** the site is in Phase 2 (RSVP closed, pre-wedding)

#### Scenario: On or after the wedding date
- **WHEN** the current instant is on or after `weddingDate`
- **THEN** the site is in Phase 3 (wedding day onward)

#### Scenario: Visitor in a different time zone
- **WHEN** a visitor whose device is set to a non-Singapore time zone loads the site at an instant after `rsvpDeadline` in Singapore time
- **THEN** the site is in Phase 2 for that visitor, the same as for a visitor in Singapore

### Requirement: Current time comes from the server, not the visitor's device
The site SHALL determine the current instant from the time reported by the web server that delivers the page, so a visitor's incorrect device clock does not change the phase shown. Only if the server time is unavailable SHALL it fall back to the device clock.

#### Scenario: Device clock is wrong
- **WHEN** a visitor's device clock is set one month ahead of the real time and they load the site
- **THEN** the phase, countdown and gallery visibility reflect the real time, not the device's

#### Scenario: Server time unavailable
- **WHEN** the server's time cannot be read
- **THEN** the site uses the device clock to determine the phase

### Requirement: RSVP deadline is a single configurable value
The `rsvpDeadline` SHALL be configurable in one documented place for the site and one for the backend, and it SHALL ship with a clearly marked placeholder until Rae sets the real date.

#### Scenario: Deadline changed before launch
- **WHEN** Rae's chosen deadline is entered in the documented configuration locations and the site is redeployed
- **THEN** phase determination and backend write acceptance both use the new deadline

### Requirement: Phase 1 floating RSVP pill
In Phase 1 the landing page SHALL show a fixed, bottom-right floating pill reading "RSVP" that links to the RSVP page. Guests who have already responded SHALL still be able to use it to view or change their response.

#### Scenario: Pill in Phase 1
- **WHEN** the landing page loads in Phase 1
- **THEN** a floating pill reading "RSVP" is shown and activating it opens the RSVP page

#### Scenario: Returning guest in Phase 1
- **WHEN** a guest who has already submitted an RSVP returns in Phase 1 and activates the pill
- **THEN** they reach their existing response (see `rsvp-flow`), and nothing blocks the repeat visit

### Requirement: Phase 2 countdown pill
In Phase 2 the floating pill SHALL show a non-interactive countdown to `weddingDate` in the format `DDD : HH : MM` with the sub-label "days · hrs · min". It SHALL not link anywhere, and it SHALL stay current while the page is open.

#### Scenario: Countdown display
- **WHEN** the landing page loads in Phase 2, 123 days, 4 hours and 20 minutes before `weddingDate`
- **THEN** the pill reads "123 : 04 : 20" with the sub-label "days · hrs · min"
- **AND** clicking or tapping the pill does nothing

#### Scenario: Countdown ticks while open
- **WHEN** the landing page stays open in Phase 2 across a minute boundary
- **THEN** the countdown updates without a page reload

### Requirement: Phase 3 removes the floating pill
In Phase 3 the floating pill SHALL be absent from the page, not merely hidden.

#### Scenario: No pill on the wedding day
- **WHEN** the landing page loads in Phase 3
- **THEN** no floating pill element exists in the page

### Requirement: Gallery teaser visibility follows phase
The landing page's gallery teaser section SHALL render only in Phase 3, positioned below the info section. In Phases 1 and 2 it SHALL not render at all.

#### Scenario: Teaser absent before the wedding
- **WHEN** the landing page loads in Phase 1 or Phase 2
- **THEN** no gallery teaser section and no link to the full gallery is present

#### Scenario: Teaser present on the wedding day
- **WHEN** the landing page loads in Phase 3
- **THEN** the gallery teaser renders below the info section (behavior per `gallery`)

### Requirement: Phase can be previewed for testing without affecting guests
For QA, the site SHALL allow simulating a different current date/time only when served from a local development host. On the deployed site, any such override SHALL be ignored.

#### Scenario: Local preview of Phase 3
- **WHEN** the site is served locally and loaded with a simulated date of 2027-04-03
- **THEN** the site renders in Phase 3

#### Scenario: Override ignored in production
- **WHEN** the deployed site is loaded with a simulated-date override
- **THEN** the override is ignored and the real current date determines the phase
