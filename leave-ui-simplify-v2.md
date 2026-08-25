# Leave Module — Simplify for Non-Technical Users (v2)

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
   leave types" and "apply for leave" into one crowded view.
4. **Fewer fields per screen.** Any form with more than 5 visible inputs at once
   should hide advanced/rare options (encashment, carry forward) behind an
   "Advanced settings" collapsible section, closed by default.
5. **Plain-language labels.** Replace technical terms with what a school clerk
   would actually say. Specific renames required:
   - "Limit" → "Assigned Days" (e.g. maxDaysPerYear field label)
   - "Waiting" status → "Pending" (match whatever the app's default/first-shown
     status filter already says elsewhere)
6. **Bigger, clearer action buttons.** One primary action per screen.
7. **REMOVE ALL RADIO BUTTON GROUPS from the entire Leave module, no exceptions
   in this module.** Replace every one with a select/dropdown. This includes
   status filters, personType filters, allocation frequency, and any other
   choice currently shown as radio buttons anywhere in Leave Type, Leave
   Request, or Bulk Assignment screens.
8. **Filter select boxes go directly above the table**, in the same
   row/toolbar as the page's action buttons (e.g. "Apply Leave", "Bulk
   Assign") — not in a separate section floating above that.
9. **Confirmations in plain words.** Any confirmation dialog must say what
   will actually happen in one sentence a non-technical person understands.

## Specific screens to fix

### Leave Type "Create New Leave" form
- Keep only: Name, Who it's for (Staff/Teacher/Student/All), Assigned Days per
  year, Paid or Unpaid (simple toggle)
- Move Carry Forward and Encashment into a collapsed "Advanced" section

### Leave Requests / Approvals page
- Plain TABLE layout (not cards), matching every other list page in this app
  (Shift, Roster, Staff — same table pattern, same pagination)
- Columns: Name, Leave Type, From, To, Days, Status, Action
- Status column shows a colored badge PLUS a short plain-language line:
  - Pending → "Waiting for approval"
  - Approved, leave still upcoming or ongoing → "Approved"
  - Approved, leave dates fully in the past → "Completed" (display-only label;
    backend status field stays 'Approved', this is purely a UI distinction
    based on toDate < today)
  - Rejected → "Rejected — was never applied to attendance"
  - Cancelled → "Cancelled — leave was undone, days returned to balance"
- Action column: Approve/Reject buttons for Pending rows. Cancel button for
  Approved rows ONLY if toDate is today or in the future — once a leave is
  "Completed" (toDate has passed), remove the Cancel button entirely; that row
  becomes read-only/locked.
- Reject and Cancel are two separate, clearly labeled actions — never merge
  into one button or menu:
  - Reject = only for Pending requests, declines it, nothing written to
    attendance, no balance impact
  - Cancel = only for Approved (and not yet completed) requests, undoes an
    already-approved leave — removes its DailyAttendance Leave rows and adds
    the days back to the person's balance

### Bulk Assignment page
- Move this OUT of the main Leave Requests page/tabs entirely. Put it under
  Settings, matching how other admin settings pages are organized (e.g. Shift,
  AttendanceRule) — a settings-style link/icon, not a tab on the requests page.
- Rename to something a clerk understands: "Set Leave Limits for Staff" (not
  "Leave balance and assignment")
- Each cell: plain text only — "10 days" or "Not set" — no bars
- Keep: selecting people + leave types + one "Assign" button

### Apply Leave forms (admin single, admin bulk, teacher)
- Show the person's name and remaining balance in plain words BEFORE they pick
  dates: "Priya has 8 sick leave days left"
- Real-time validation as dates are picked: calculate working days as soon as
  fromDate/toDate change, compare against remaining balance — if it exceeds,
  show an inline error immediately and disable Submit until corrected
- Class dropdown for students: MUST show "Class 5" style label, never a raw
  number or ID — this is a known bug, audit specifically
- Reason field: keep it short and optional-looking unless truly required

## Critical bugs to fix (backend enforcement, not just UI)

1. **No balance validation on submit**: the apply form currently lets someone
   enter more days than they have remaining, with no block. Fix both the
   frontend (see "real-time validation" above) AND the backend — the create
   endpoint must reject a request whose working-day count exceeds remaining
   balance, unless forceApprove/admin override is explicitly used at approval
   time (not at creation time).

2. **Approval allowed with no assignment**: a person with NO
   PersonLeaveAssignment record for a leave type can currently still get a
   request for that leave type approved. Fix ApproveLeaveRequest: if no
   PersonLeaveAssignment exists for this person+leaveType, block approval
   with a 400 error: "This person has not been assigned this leave type —
   assign it first before approving." Enforce this on the backend regardless
   of what the frontend shows or hides.

3. **Lock completed leave requests server-side**: CancelLeaveRequest must
   return a 400 "This leave has already been completed and cannot be
   cancelled" if toDate < today (server wall-clock date) — this must be a
   real backend check, not just a hidden button on the frontend.

## What to test after this change
- Show the Approvals page to someone unfamiliar with the codebase — could they
  tell the difference between Approved, Completed, Rejected, and Cancelled
  just from reading the row, without asking anyone?
- Check every dropdown and table cell for raw IDs/numbers that should be names
- Confirm no progress bars and no radio button groups remain anywhere in the
  Leave module
- Try submitting an apply form with more days than the balance allows — it
  must be blocked, both visually and on the server
- Try approving a request for someone with no leave type assignment — it must
  be blocked with a clear error
- Try cancelling a completed (past-dated) approved leave — it must be blocked
