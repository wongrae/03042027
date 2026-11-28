# photo-field Specification

## Purpose

A landing-page section below the swipe video that shows a scattered wall of photos. Visitors drag it around in any direction, and it repeats endlessly.

## Requirements

### Requirement: Section placement and visibility
The landing page SHALL show the photo field section directly below the swipe video section, in every site phase. In Phase 3 the gallery teaser SHALL render below it.

#### Scenario: Any phase
- **WHEN** a visitor opens the landing page in Phase 1, 2 or 3
- **THEN** the photo field appears directly below the swipe video section

#### Scenario: Wedding day
- **WHEN** a visitor opens the landing page in Phase 3
- **THEN** the gallery teaser appears directly below the photo field

### Requirement: Afterdusk's arrangement, with no overlay
The section SHALL arrange the photos in the same composition as the narrow-screen field of afterduskmedia.com: its block of 11 photo slots, with their measured positions, sizes, gaps and overlaps, repeated once per 11 photos. Each photo SHALL keep its own aspect ratio (no cropping) and have no added frame, border, caption, heading or wordmark.

#### Scenario: Viewing the section on a phone
- **WHEN** the section is on screen on a phone, with the placeholder photos
- **THEN** it shows the same arrangement as the afterdusk phone layout, at about the same size relative to the screen, with only photos on the page background, each uncropped

### Requirement: Densely filled, with overlapped photos still visible
The photos SHALL cover about as much of the section as the reference (about 92% with photos shaped like their slots), and every photo SHALL remain at least 40% visible where photos overlap. A photo SHALL NOT appear twice on a phone screen when there are at least 12 photos.

#### Scenario: Phone screen
- **WHEN** a visitor on a phone looks at the section at any drag position
- **THEN** it is filled like the reference, no photo is mostly hidden behind another, and no photo shows twice

### Requirement: Section height leaves room to scroll
The section SHALL be full-bleed and shorter than the screen (about three quarters of the visible screen height), so that on any screen part of the page above or below it is always visible while it is centred.

#### Scenario: Phone in portrait
- **WHEN** a visitor on a phone scrolls the section to the middle of the screen
- **THEN** some page content or background is visible above and below it, and swiping there scrolls the page

### Requirement: Drag moves the field in any direction
Dragging over the section with a finger or a mouse SHALL move the photos with the pointer, horizontally, vertically or diagonally. While dragging, the page SHALL NOT scroll.

#### Scenario: Diagonal drag
- **WHEN** a visitor drags up and to the left across the section
- **THEN** the photos move up and to the left with the finger or mouse, and the page does not scroll

#### Scenario: Dragging starts on a photo
- **WHEN** a desktop visitor presses on a photo and drags
- **THEN** the field moves, and the browser does not start dragging the image file or selecting text

### Requirement: The field never runs out
The photo layout SHALL repeat in both directions, so no amount of dragging in any direction reaches an edge or an empty area. Photos that leave one side SHALL reappear from the opposite side with no visible jump.

#### Scenario: Long drag one way
- **WHEN** a visitor keeps dragging left for many screen-widths
- **THEN** photos keep arriving from the right with no gap, end or visible snap

### Requirement: Momentum after a flick
When a drag is released while still moving, the field SHALL keep moving in the same direction and slow to a stop, travelling further after a faster flick. A drag that stopped before release SHALL stay where it is. Touching the field while it is still gliding SHALL stop it.

#### Scenario: Flick
- **WHEN** a visitor flicks the field and lifts their finger while it is moving
- **THEN** the photos keep gliding in that direction and ease to a stop

#### Scenario: Stopping before letting go
- **WHEN** a visitor stops their finger and then lifts it
- **THEN** the field stays where it is

#### Scenario: Catching a gliding field
- **WHEN** the field is still gliding and the visitor touches it again
- **THEN** it stops where it is

### Requirement: Subtle depth effect
While the field is moving, groups of photos SHALL trail the drag by slightly different amounts, so the field feels layered. When movement stops, every photo SHALL settle back into its place in the layout, so the arrangement does not drift however long the field is dragged.

#### Scenario: Dragging the field
- **WHEN** a visitor drags the field and stops
- **THEN** during the drag some photos lag slightly behind others, and once stopped the layout is exactly as before, just moved

### Requirement: Every screen size
The section SHALL work on phones, tablets and desktops in any orientation. Photo sizes SHALL scale with the screen so that a phone and a desktop show a comparably dense field, and resizing or rotating the screen SHALL keep the field filled with no gaps.

#### Scenario: Rotating a phone
- **WHEN** a visitor rotates their phone while the section is on screen
- **THEN** the field still fills the section with photos and remains draggable

#### Scenario: Wide desktop
- **WHEN** a visitor views the section in a 1920px-wide window
- **THEN** the section is filled with photos with no empty bands, and mouse dragging works in every direction

### Requirement: Page scrolling outside a drag
Vertical mouse-wheel scrolling over the section SHALL scroll the page and SHALL NOT move the field. A sideways trackpad swipe over the section SHALL move the field sideways without triggering browser back/forward navigation.

#### Scenario: Mouse wheel over the section
- **WHEN** a desktop visitor scrolls the mouse wheel down with the pointer over the section
- **THEN** the page scrolls past the section and the photos do not move relative to it

#### Scenario: Trackpad sideways swipe
- **WHEN** a visitor two-finger swipes left on a trackpad over the section
- **THEN** the field moves left and the browser does not navigate

### Requirement: Keyboard access
The section SHALL be keyboard-focusable with an accessible label explaining how to move it, and the arrow keys SHALL move the field in the matching direction while it has focus.

#### Scenario: Arrow key
- **WHEN** the section has focus and the visitor presses the Down arrow
- **THEN** the field moves and the page does not scroll

### Requirement: Reduced motion
For visitors with `prefers-reduced-motion: reduce`, the field SHALL still follow a drag directly but SHALL NOT glide after release and SHALL NOT use the depth effect.

#### Scenario: Reduced motion flick
- **WHEN** a visitor with reduced motion enabled flicks the field
- **THEN** it stops as soon as they let go, and all photos move together with no lag

### Requirement: Hand-made layout
Rae SHALL be able to arrange the photos by hand in a local, unpublished visual editor, and save the result to the site's settings. The photo field SHALL then show that arrangement, repeating and draggable as before, with each photo uncropped, until she switches back to the automatic arrangement.

#### Scenario: Saving a hand-made layout
- **WHEN** Rae moves photos in the editor, saves, and opens the site preview
- **THEN** the photo field shows them where she put them

#### Scenario: Editing
- **WHEN** Rae opens the editor
- **THEN** she can add, move, resize, duplicate, remove and re-layer photos in one repeating frame, and sees how its edges join its repeats

#### Scenario: Saving from another device
- **WHEN** a save request reaches the preview server from any address other than this computer
- **THEN** it is refused and nothing is written

### Requirement: Replaceable placeholder photos
Until Rae supplies real photos, the section SHALL use about 20 numbered placeholder images in the shapes of the arrangement's slots. Replacing a placeholder file with a photo of the same name SHALL show that photo with no code change, whatever its shape. Changing the number of photos SHALL need only an edit to the site's settings.

#### Scenario: Swapping a photo
- **WHEN** Rae replaces placeholder `07` with a landscape photo of the same file name and redeploys
- **THEN** that photo appears in the field in its landscape proportions

#### Scenario: A photo fails to load
- **WHEN** one configured photo is missing or fails to load
- **THEN** the field still works and lays out the remaining photos with no gap or broken-image icon
