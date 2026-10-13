# Spec Delta

## Purpose

Make the landing page hero play a short animation of the couple whose progress is tied to the visitor's scroll position, forward and backward, rather than autoplaying. The hero degrades gracefully to a still image.

## ADDED Requirements

### Requirement: Hero playback follows scroll position
While the visitor scrolls through the hero section, the animation's visible frame SHALL advance in proportion to scroll progress through that section. It SHALL NOT play independently of scrolling.

#### Scenario: Scrolling down through the hero
- **WHEN** a visitor scrolls from the top to the end of the hero section
- **THEN** the animation advances from its first frame to its last, in step with scroll progress

#### Scenario: Not scrolling
- **WHEN** the visitor stops scrolling partway through the hero
- **THEN** the animation holds on the frame matching that scroll position

### Requirement: Hero playback is reversible
Scrolling back up through the hero section SHALL scrub the animation backward to match the scroll position.

#### Scenario: Scrolling back up
- **WHEN** a visitor scrolls upward through the hero section
- **THEN** the animation moves backward, showing the frame that matches each scroll position

### Requirement: Single uploaded asset drives the effect
The hero animation SHALL be driven by a single asset supplied by Rae: a video, or an equivalent image sequence. This is one of only two manual media uploads in the design, the other being the info section's collage photo.

#### Scenario: Asset supplied
- **WHEN** Rae's hero asset is added to the site and deployed
- **THEN** the hero scrubs through that asset with no other media changes required

### Requirement: Static still fallback
Until the asset is supplied, and for visitors who request reduced motion or whose browser cannot scrub the asset, the hero SHALL show a static still image in the same layout.

#### Scenario: No asset yet
- **WHEN** the site is deployed before Rae supplies the hero asset
- **THEN** the hero shows the placeholder still image and the rest of the page works normally

#### Scenario: Reduced motion requested
- **WHEN** a visitor with `prefers-reduced-motion: reduce` views the hero
- **THEN** they see a still image instead of scroll-driven animation
