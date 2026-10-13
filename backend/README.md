# Backend: Google Sheet + Apps Script

The guest list and every RSVP live in **one private Google Sheet**. A small Google Apps Script (`Code.gs`, in this folder) is attached to that Sheet and published as a web app. The website talks only to that web app, which looks up a guest, saves a response, and never reveals the list.

```
Guest's browser ──▶ site (GitHub Pages) ──▶ Apps Script web app ──▶ your Google Sheet (private)
```

You and Rayven edit the Sheet like any spreadsheet. Changes show up on the live site immediately — nothing to redeploy.

## 1. Create the Sheet

1. In the Google account that should own the wedding data, create a new Google Sheet. Name it anything (e.g. "Rae & Rayven guest list").
2. Rename the first tab to exactly **`Guests`**.
3. Type these headers in **row 1** (the names must match; the order doesn't matter, and you can add your own extra columns):

| Column | You fill in | Meaning |
|---|---|---|
| `Name` | ✅ | How the guest is greeted: "Hi, **Alex & Sam Tan**". If blank, the surname is used. |
| `Surname` | ✅ | Used to verify. Case, spaces and punctuation are ignored. |
| `Phone` | ✅ | Their mobile number. Only the **last 4 digits** are used to verify. Never shown on the site. |
| `Seats` | ✅ | Most people the invitation covers (a whole number, 1 or more). Caps their party size. |
| `Code` | auto | Hidden device code, created when the guest first verifies. Don't edit. |
| `Attending` | auto | `Attending` / `Declined` once they reply |
| `Party size` | auto | |
| `Dietary` | auto | |
| `Parking` | auto | `Yes` / `No` |
| `Well wishes` | auto | |
| `Updated at` | auto | Singapore time of their latest save |
| `Notes` | ✅ (optional) | Your own notes. Ignored by the site. |

4. **Format the `Phone` column as plain text** (select the column → Format → Number → Plain text) *before* pasting numbers in, so `+65` and leading zeros aren't lost.
5. Add a test row, e.g. Name `Test Guest`, Surname `Test`, Phone `+65 8123 4567`, Seats `2`. **Delete it before launch.**
6. Click **Share** and add Rayven as an **Editor**. Leave "General access" as **Restricted** so only the two of you can open the Sheet.

### Rules that keep the site working
- Keep the tab named `Guests` and the header names above.
- Keep **Surname** and **Phone** filled in for every guest.
- Two guests with the same surname **and** the same last 4 phone digits can't be told apart. Run **Wedding → Check guest list** (below) to find them.
- To sign a guest's devices out, clear their `Code` cell. They can verify again right away.
- Sorting, filtering, colouring and adding rows are all fine.

## 2. Add the script

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the placeholder code, paste in the whole of [`Code.gs`](Code.gs), and click **Save** (💾). Name the project e.g. "Wedding RSVP".

## 3. Set the RSVP deadline

1. In the Apps Script editor: **Project Settings** (⚙️) → **Script Properties** → **Add script property**.
2. Property: `RSVP_DEADLINE` — Value: the last moment RSVPs are accepted, with the Singapore offset, e.g. `2027-03-01T23:59:59+08:00`.
3. **This must be the same moment as `rsvpDeadline` in `site/js/config.js`.** The site uses its copy to decide what to show; the script uses this one to refuse late saves.

Until this property is set, every request returns a `config` error.

## 4. Authorise and deploy

1. In the editor, pick the function **`onOpen`** in the toolbar and click **Run**. Google asks you to authorise the script. You will see *"Google hasn't verified this app"*: that's normal for your own script. Click **Advanced → Go to Wedding RSVP (unsafe) → Allow**. (It can only touch this Sheet.)
2. Click **Deploy → New deployment**.
3. Click the ⚙️ next to "Select type" and choose **Web app**.
4. Set **Execute as: Me** and **Who has access: Anyone**. (Anyone = the website can call it; they can only reach it via the actions in `Code.gs`, and the Sheet itself stays private.)
5. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
6. Paste it into `apiUrl` in `site/js/config.js`.

### Changing the script later
Use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. This keeps the **same URL**. If you choose "New deployment" instead you get a *different* URL and the site would need updating.

## 5. The "Wedding" menu

Reload the Sheet and a **Wedding** menu appears.

**Wedding → Check guest list** highlights (in light red) every row with a missing surname, missing or invalid seats, a phone with fewer than 4 digits, or two guests sharing the same surname + last 4 digits, and shows a summary. Fix them and run it again; the highlights clear themselves (your own colours are left alone). Run it until it says **"No problems found"** before sharing the site.

## 6. Quick manual test (optional)

After deploying, with a test row in the Sheet (replace `<URL>`):

```bash
# verify — returns the guest's name, seats and a hidden code (never the phone number)
curl -sL -X POST -H "Content-Type: text/plain" \
  -d '{"action":"verify","surname":"Test","last4":"4567"}' "<URL>"

# wrong digits — returns {"ok":false,"error":"not_found"}
curl -sL -X POST -H "Content-Type: text/plain" \
  -d '{"action":"verify","surname":"Test","last4":"0000"}' "<URL>"

# look up by the code returned above
curl -sL "<URL>?action=get&k=<code>"
```

Error values: `not_found` (no/ambiguous match or unknown code), `closed` (past the deadline), `invalid` (bad form values; includes `fields`), `bad_request`, `busy` (try again), `config` (RSVP_DEADLINE missing/invalid), `server` (e.g. a column header is missing — see Executions in the Apps Script editor).

## Privacy

- The Sheet is private to you and Rayven. The website never receives the guest list.
- The web app URL is public, but it can only: verify one guest (surname + last 4), read one invitation by its code, or save one invitation's RSVP by its code. It cannot list or search guests, and never returns phone numbers.
- There is no limit on wrong guesses for the last 4 digits (a choice made for simplicity). If you ever notice odd `Updated at` times or changed answers, clear that row's `Code` and tell Claude — a per-surname cooldown can be added.

---

## Test log

### Automated — `npm test` (`tests/backend.test.mjs`)
`Code.gs` is loaded in Node against fake Google services (Sheet, locks, properties), so the real script code runs for each scenario below. A parity test also checks that the script's matching and validation rules agree with the website's (`site/js/verify-rules.js`, `site/js/rsvp-rules.js`).

| Spec scenario | Test |
|---|---|
| guest-list: Matching with formatting differences | verify matches surname + last 4 ignoring case, spacing and punctuation · last 4 comes from the stored number whatever its formatting |
| guest-list: Wrong digits | wrong digits and wrong surname give identical generic responses |
| guest-list: Rae adds / removes a guest | deleting a row removes access · columns are found by header name |
| guest-list: Ambiguous rows flagged / Missing phone flagged | Check guest list flags missing data and ambiguous rows, and only those |
| guest-list: Code created on first verification | a code is created on first verification and reused after · each invitation gets its own unique code |
| guest-list: Revoking device access | clearing a code revokes every device that held it |
| guest-list: Failed verification or bad code | a failed verification changes nothing · malformed, unknown and empty codes are all generic not_found |
| guest-list: Inspecting responses for guest data | phone numbers are never returned to the browser · the backend offers no way to list or enumerate invitations |
| guest-list: Rae reviews responses (one row, timestamp) | submitting a new RSVP records it on the same row, with a timestamp, and adds no row |
| rsvp-flow: Failed verification / Ambiguous match creates nothing | a failed verification changes nothing in the sheet · two rows with the same surname and last 4 are ambiguous |
| rsvp-flow: Access revoked | clearing a code revokes every device that held it |
| rsvp-flow: New RSVP | submitting a new RSVP records it on the same row |
| rsvp-flow: Guest edits their response (no second record) | editing overwrites the same record and creates no second one |
| rsvp-flow: Declining guest | declining clears party size, dietary and parking but keeps well wishes |
| rsvp-flow: Invalid input | invalid responses are rejected with field messages and write nothing · party size is limited by the row seats |
| rsvp-flow: Late write attempt | after the deadline the backend rejects verify and save · the deadline is judged by the backend clock · one millisecond before the deadline is still open |
| Formula injection (design) | guest text starting with a formula character is stored as literal text |
| Concurrency / sorting (design) | a save finds its row by code even after Rae sorts the sheet · a busy lock returns busy instead of writing |

Run `npm test` after any change to `Code.gs`.

### Live deployment — fill in after deploying (tasks 4.6 and 4.8)

| Check | Result | Date |
|---|---|---|
| `verify` with a test row returns name, seats, code and **no phone** | | |
| Wrong digits return `not_found` | | |
| `get` by code returns the same row | | |
| Cross-origin GET and `text/plain` POST work from the local site | | |
| A failed `verify` changes nothing in the Sheet | | |
| A save updates that row only; row count unchanged | | |
| A second save overwrites; `=1+1` in well wishes shows as text | | |
| With `RSVP_DEADLINE` set in the past, a save returns `closed` and the row is unchanged | | |
