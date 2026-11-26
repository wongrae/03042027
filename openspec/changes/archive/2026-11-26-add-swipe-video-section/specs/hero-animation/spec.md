# Spec Delta

## ADDED Requirements

### Requirement: Hero shows footage only
The hero SHALL show only the video (or its still), with no text or gradient overlaid. The invitation text ("We are getting married", the couple's names and the reception line) SHALL appear at the top of the info section instead, above Date / Time / Venue.

#### Scenario: Landing on the page
- **WHEN** a visitor opens the landing page
- **THEN** the hero shows the video with no text on it, and the names appear in the info section with the rest of the wedding details

## MODIFIED Requirements

### Requirement: Single uploaded asset drives the effect
The hero animation SHALL be driven by a single asset supplied by Rae: a video, or an equivalent image sequence. This is one of three manual media uploads in the design. The others are the info section's collage photo and the swipe video section's clip.

#### Scenario: Asset supplied
- **WHEN** Rae's hero asset is added to the site and deployed
- **THEN** the hero scrubs through that asset with no other media changes required
