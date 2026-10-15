# rsvp-flow Specification

## Purpose

Let each invited guest verify who they are with their surname and the last 4 digits of their phone number, submit their RSVP, and return later to view or change it while RSVPs are open. Visitors who cannot verify cannot create or change any response.

## Requirements

### Requirement: Guests verify with surname and phone last 4 digits
In Phase 1, a visitor with no remembered invitation SHALL see a verification screen asking for their surname and the last 4 digits of their phone number. It SHALL always show a note to reach out to Rae or Rayven if they are unable to verify. Matching follows `guest-list`.

#### Scenario: Successful verification
- **WHEN** a visitor enters a surname and 4 digits that match exactly one invitation
- **THEN** they are greeted with "Hi, <display name>" and shown the form, or their saved response if they already replied

#### Scenario: Help note always visible
- **WHEN** the verification screen is shown
- **THEN** it includes a note telling the guest to reach out to Rae or Rayven if they are unable to verify

#### Scenario: Invalid entry
- **WHEN** a visitor submits an empty surname, or anything other than exactly 4 digits
- **THEN** the request is not sent and the problem field is indicated

### Requirement: Failed verification creates nothing
When verification finds no matching invitation, or more than one, the page SHALL show a single generic message to check the details or contact Rae & Rayven, without revealing which field was wrong. No record SHALL be created or changed.

#### Scenario: No match
- **WHEN** a visitor enters a surname and digits that match no invitation
- **THEN** they see "We couldn't find your invitation" with the contact note and a way to try again
- **AND** no record is created anywhere

#### Scenario: Ambiguous match
- **WHEN** a surname and digits pair matches more than one invitation
- **THEN** the visitor sees the same generic message, and no invitation is opened

### Requirement: Verified device is remembered
After a successful verification the device SHALL remember the invitation, so later visits open it without verifying again. A "Not you?" option SHALL forget it and return to verification. If the remembered access is no longer valid, the device SHALL forget it and show verification.

#### Scenario: Guest returns later on the same device
- **WHEN** a guest who verified earlier opens the RSVP page again on the same device in Phase 1
- **THEN** their invitation opens without them entering anything

#### Scenario: Shared device
- **WHEN** a second guest uses a device that remembers someone else and chooses "Not you?"
- **THEN** the remembered invitation is forgotten and the verification screen is shown

#### Scenario: Access revoked
- **WHEN** a device holding access that Rae has since revoked opens the RSVP page
- **THEN** the device forgets it and shows the verification screen

### Requirement: RSVP form fields
For a verified invitation the form SHALL collect: attendance ("Joyfully attending" / "Regretfully declining" pill toggle); party size; dietary restrictions / meal preference (free text); parking needed (Yes/No); and optional well wishes (multi-line). Party size SHALL be a whole-number stepper limited to the invitation's seat count. The form SHALL NOT ask for a contact number.

#### Scenario: Attending guest fills the form
- **WHEN** a guest chooses "Joyfully attending"
- **THEN** party size (from 1 up to their invitation's seat count), dietary, parking and well wishes fields are available

#### Scenario: Declining guest
- **WHEN** a guest chooses "Regretfully declining"
- **THEN** party size, dietary and parking are not asked for or stored, and well wishes remains available

#### Scenario: Invalid input
- **WHEN** a guest submits without choosing attendance, or with a party size outside 1 to their seat count while attending
- **THEN** the form is not sent, the problem fields are indicated, and the entered values are kept

### Requirement: Submitting a first response
Submitting a valid form for an invitation with no prior response SHALL record the response on that invitation's row. The guest SHALL then see a confirmation summary of exactly what was recorded.

#### Scenario: New RSVP
- **WHEN** a verified guest with no prior response submits a valid form in Phase 1
- **THEN** the response is stored on their invitation row
- **AND** they see "Thank you, <display name>" with a summary of attendance, party size, meal and parking as stored

### Requirement: Viewing and editing an existing response
A verified guest with a saved response SHALL see that summary first, with an option to edit. The edit form SHALL be pre-filled and titled for updating ("Update your RSVP"). Saving SHALL overwrite the same invitation's response, never creating a second record.

#### Scenario: Returning guest sees their response
- **WHEN** a verified guest who has already responded opens the RSVP page in Phase 1
- **THEN** they see the confirmation summary of their saved response and an "Edit my RSVP" option

#### Scenario: Guest edits their response
- **WHEN** that guest chooses to edit, changes a field and saves
- **THEN** the form was pre-filled with their saved values and its submit action read "Update your RSVP"
- **AND** the invitation's single stored response now reflects the change, with no additional record created

### Requirement: Saving feedback and failure handling
While verifying or saving, the page SHALL show a busy state and prevent duplicate submission. If a request fails, the guest SHALL see a clear message and be able to retry without losing their entries.

#### Scenario: Slow save
- **WHEN** a guest submits and the backend takes several seconds to respond
- **THEN** the submit control shows a saving state and cannot be activated again until the save finishes

#### Scenario: Network failure
- **WHEN** the save request fails
- **THEN** the guest sees a "couldn't save, please try again" message and their entered values remain in the form

### Requirement: RSVP closed outside Phase 1
Outside Phase 1 the RSVP page SHALL show only a minimal "RSVPs have closed" notice with a link back home. No verification screen, form, summary or edit option SHALL appear. The backend SHALL independently reject any create or edit received on or after `rsvpDeadline`, judged by the backend's own clock.

#### Scenario: RSVP page in Phase 2 or 3
- **WHEN** anyone opens the RSVP page in Phase 2 or Phase 3, whether or not their device is verified
- **THEN** they see only the "RSVPs have closed" notice and a link to the landing page

#### Scenario: Late write attempt
- **WHEN** a save request reaches the backend on or after `rsvpDeadline`, even from a page loaded before the deadline or a device with a wrong clock
- **THEN** the backend rejects it, the stored response is unchanged, and the guest is shown the closed notice
