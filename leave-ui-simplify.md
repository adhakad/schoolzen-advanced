# Leave Module — Simplify for Non-Technical Users

The Leave module (Leave Type form, Leave Requests/Approvals, Bulk Assignment grid,
Apply forms — admin, bulk, and teacher) is too complex and confusing right now.
A school owner or clerk with no technical background must be able to use every
screen here without help. Simplify using the app's EXISTING Bootstrap/Material
look and components (the same buttons, tables, modals already used elsewhere in
this codebase, e.g. Roster/Shift pages) — do not introduce a new design system,
new colors, or new component library.

## General rules for every Leave screen

1. **Never show a raw ID or number where a name belongs.** Audit every template
   for cases like a class showing as "200" instead of "Class 5", or a person
   showing as an ObjectId. Every field visible to the user must be a readable
   label, resolved on the backend or via existing lookup services already used
   elsewhere (e.g. person-lookup.js).
2. **Remove all progress bars.** Replace every progress-bar balance indicator
   with plain text: "3 din bache hain" / "3 days left" — no bars, no percentages.
3. **One screen, one job.** Do not combine "see everyone's balance" and "assign
   leave types" and "apply for leave" into one crowded view. Each screen should
   have a single, obvious purpose stated in one line at the top.
4. **Fewer fields per screen.** Any form with more than 5 visible inputs at once
   should be reconsidered — hide advanced/rare options (encashment, carry
   forward) behind an "Advanced settings" collapsible section, closed by default.
5. **Plain-language labels.** Replace technical terms with what a school clerk
   would actually say: "Leave balance" not "PersonLeaveAssignment", "Who can
   take this leave" not "applicableTo enum", "Approved days used" not "usedDays".
6. **Bigger, clearer action buttons.** One primary action per screen (e.g.
   "Apply Leave", "Approve", "Assign") — visually obvious, not competing with
   3-4 equally-styled buttons.
7. **Use select/dropdown boxes, not radio button groups.** Wherever the current
   Leave screens use a mat-radio-group or a set of radio buttons for a choice
   (status filter, personType filter, allocation frequency, etc.), replace it
   with a plain select/dropdown (mat-select or the existing dropdown pattern
   already used elsewhere in this app, e.g. Shift/Staff forms). Radio buttons
   are only acceptable where the app's other modules already use them for the
   exact same kind of choice (e.g. if Roster already uses a radio group for
   Staff/Teacher/Student tabs, that one stays as-is for consistency) — but for
   any NEW choice being simplified here, default to a select box first.
8. **Confirmations in plain words.** Any confirmation dialog (cancel, delete,
   approve) must say what will actually happen in one sentence a non-technical
   person understands — not backend terminology.

## Specific screens to fix

### Leave Type "Create New Leave" form
- Keep only: Name, Who it's for (Staff/Teacher/Student/All), Total days per year,
  Paid or Unpaid (simple toggle)
- Move Carry Forward and Encashment into a collapsed "Advanced" section — most
  schools won't touch these on day one

### Leave Requests / Approvals page
- REVERT the card layout — go back to a plain TABLE, matching every other list
  page in this app (Shift, Roster, Staff — same table pattern, same pagination)
- Columns: Name, Leave Type, From, To, Days, Status, Action
- One clear heading: "Leave Requests Waiting for Your Approval"
- Status column shows a simple colored badge (Pending/Approved/Rejected) —
  keep this, it's the one visual element worth keeping from the card version
- Action column: Approve/Reject buttons for Pending rows, Cancel button for
  Approved rows — small icon buttons like the rest of the app's tables use
- Remove the balance-preview strip from inline display — if needed, show
  remaining balance as a plain text tooltip or a small "X left" next to the
  leave type name in the same row, not as a separate block

### Bulk Assignment grid
- Rename the tab to something a clerk understands: "Set Leave Limits for Staff"
  (not "Leave balance and assignment")
- Each cell: plain text only — "10 days" or "Not set" — no bars
- Selecting people + leave types + one "Assign" button — keep exactly this,
  but simplify the visual weight (smaller checkboxes, clearer row highlighting
  on hover, no dense borders everywhere)

### Apply Leave forms (admin single, admin bulk, teacher)
- Show the person's name and remaining balance in plain words BEFORE they pick
  dates: "Priya has 8 sick leave days left"
- Date pickers: make today's date visually obvious as the starting point
- Class dropdown for students: MUST show "Class 5" style label, never a raw
  number or ID — audit this specifically, this is a known bug right now
- Reason field: keep it short and optional-looking unless truly required

## What to test after this change
- Show the Approvals page to someone unfamiliar with the codebase (mentally
  simulate this) — could they approve a request without explanation?
- Check every dropdown and table cell for raw IDs/numbers that should be names
- Confirm no progress bars remain anywhere in the Leave module
- Confirm each screen has one obvious primary action, not 3+ competing buttons