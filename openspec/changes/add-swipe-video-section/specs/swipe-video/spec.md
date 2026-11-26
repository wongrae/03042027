# Spec Delta

## Purpose

A second landing-page video, below the info section, whose frame follows horizontal swipes, while vertical swipes over it still scroll the page.

## ADDED Requirements

### Requirement: Section placement and visibility
The landing page SHALL show the swipe video section directly below the info section, in every site phase. In Phase 3 the gallery teaser SHALL render below it.

#### Scenario: Any phase
- **WHEN** a visitor opens the landing page in Phase 1, 2 or 3
- **THEN** the swipe video section appears directly below the info section

### Requirement: Horizontal swipe scrubs the video
Swiping left over the section SHALL advance the video, and swiping right SHALL move it backward, in proportion to swipe distance. The video SHALL NOT play on its own, and SHALL hold its first frame at the start and its last frame at the end (no looping).

#### Scenario: Swipe left
- **WHEN** a visitor swipes left across the section
- **THEN** the video advances in step with the finger and holds where the swipe stops

#### Scenario: Swipe right
- **WHEN** a visitor swipes right across the section
- **THEN** the video moves backward, showing the frame that matches each position

#### Scenario: Past the end
- **WHEN** the video is on its last frame and the visitor keeps swiping left
- **THEN** it stays on the last frame

### Requirement: Vertical movement scrolls the page
Vertical swipes, vertical wheel scrolling and vertical trackpad scrolling over the section SHALL scroll the page normally and SHALL NOT scrub the video. The section SHALL NOT be pinned.

#### Scenario: Swiping up over the section
- **WHEN** a visitor on a phone swipes up while their finger is on the section
- **THEN** the page scrolls down past it and the video frame does not change

### Requirement: Desktop and keyboard input
On desktop the video SHALL scrub with a horizontal trackpad swipe and with a mouse drag, without triggering browser back/forward navigation. The section SHALL be keyboard-focusable, and Left/Right arrow keys SHALL step the video backward/forward.

#### Scenario: Trackpad swipe
- **WHEN** a visitor two-finger swipes left on a trackpad over the section
- **THEN** the video advances and the browser does not navigate

#### Scenario: Keyboard
- **WHEN** the section has focus and the visitor presses the Right arrow
- **THEN** the video steps forward

### Requirement: No text overlay
The swipe video SHALL show no caption, heading or other text over the footage.

#### Scenario: Viewing the section
- **WHEN** the section is on screen
- **THEN** only the video (or its still) is visible

### Requirement: Still fallback
Before the video loads, for visitors with `prefers-reduced-motion: reduce`, and if the video fails to load, the section SHALL show a still image in the same layout. Until Rae supplies the final clip, the section SHALL use a placeholder clip and its first frame as the still.

#### Scenario: Reduced motion
- **WHEN** a visitor with `prefers-reduced-motion: reduce` views the section
- **THEN** they see the still image and swiping does nothing
