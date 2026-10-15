# Spec Delta

## Purpose

Give Rae & Rayven one directly editable guest list (a spreadsheet) that is the source of truth for who is invited, how to verify them, and how they responded. The list is never exposed to site visitors.

## ADDED Requirements

### Requirement: Spreadsheet is the editable guest list
The guest list SHALL live in a spreadsheet owned by Rae, with one row per invitation. Each row SHALL hold at least a display name, a surname, a phone number and the maximum number of seats offered. Rae SHALL be able to add, edit or remove invitations directly in the spreadsheet without redeploying the site.

#### Scenario: Rae adds a guest
- **WHEN** Rae adds a new row with a display name, surname, phone number and seat count
- **THEN** that guest can verify and RSVP on the live site without a redeploy

#### Scenario: Rae removes a guest
- **WHEN** Rae deletes an invitation's row
- **THEN** that invitation can no longer be verified, and any device that had opened it loses access to it

### Requirement: Invitations are identified by surname and phone last 4 digits
An invitation SHALL be matched when the entered surname equals the row's surname, ignoring case, spacing and punctuation, and the entered 4 digits equal the last 4 digits of the row's phone number, ignoring spaces, `+`, dashes and country code.

#### Scenario: Matching with formatting differences
- **WHEN** a row has surname "Tan" and phone "+65 8123 4567", and a guest enters "  tan " and "4567"
- **THEN** that invitation is matched

#### Scenario: Wrong digits
- **WHEN** a guest enters surname "Tan" and digits that do not end any Tan row's phone number
- **THEN** no invitation is matched

### Requirement: Rae can check the guest list for problems
The system SHALL provide a check, run from within the spreadsheet, that flags every row missing a surname or a phone number with at least 4 digits, and every set of rows sharing the same normalised surname and phone last 4 digits.

#### Scenario: Ambiguous rows flagged
- **WHEN** two rows have surname "Lim" and phone numbers both ending "8888", and Rae runs the check
- **THEN** both rows are flagged as ambiguous so Rae can fix them before launch

#### Scenario: Missing phone flagged
- **WHEN** a row has no phone number and Rae runs the check
- **THEN** that row is flagged

### Requirement: Each invitation has a hidden device access code
Every invitation row SHALL carry a unique random access code of at least 10 characters, created automatically when first needed and never shown to guests. A successful verification SHALL hand that code to the guest's device. Clearing a row's code SHALL revoke access for every device that holds it.

#### Scenario: Code created on first verification
- **WHEN** a guest verifies against a row that has no code yet
- **THEN** a new unique code is stored on that row and given to the guest's device

#### Scenario: Revoking device access
- **WHEN** Rae clears an invitation's code
- **THEN** devices that previously verified for that invitation must verify again

### Requirement: Guest list is never exposed to visitors
The backend SHALL only return data for the single invitation matched by a verification or a valid access code. It SHALL offer no way to list or enumerate invitations, and the site SHALL never ship the guest list to the browser. Phone numbers SHALL never be returned to the browser.

#### Scenario: Failed verification or bad code
- **WHEN** a request reaches the backend with a non-matching surname/digits pair, or with a missing, malformed or unknown access code
- **THEN** it receives a generic "not found" response containing no guest data, and the response is the same whether the surname or the digits were wrong

#### Scenario: Inspecting the site's files
- **WHEN** someone downloads every file the website serves
- **THEN** no guest names, codes, phone numbers or responses are present

### Requirement: Responses are recorded on the invitation's row
A guest's RSVP response SHALL be stored in the same row as their invitation, with a last-updated timestamp, so Rae can see every invitation and its current response in one place.

#### Scenario: Rae reviews responses
- **WHEN** a guest submits or edits their RSVP
- **THEN** the corresponding row shows the current response fields and the time of the latest change
- **AND** no additional row is created
