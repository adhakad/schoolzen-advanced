# Leave Module Redesign — Approvals + Bulk Assignment

IMPORTANT: Existing Phase 8 LeaveType, LeaveRequest models, approve/reject logic,
DailyAttendance override behavior, and teacher self-apply flow stay exactly as
built. This is a UI/UX reorganization plus one new backend capability
(bulk assignment) — no existing logic is replaced.

## Part 1 — Reorganize the Leave page into two tabs

Replace the current single leave-request table view with two tabs on the same page:

### Tab 1: "Approvals"
- Filter chips at top: Pending (default, shows count) / Approved / Rejected / All
- Each leave request shown as a CARD (not a table row):
  - Avatar (initials) + person name + role/designation + leave type name
  - Status pill (Pending=yellow, Approved=green, Rejected=red)
  - Three fields in a row: From date, To date, Days (working days count)
  - A balance preview strip: "Balance after approval: X of Y [leave type] days remaining"
    — calculate using the existing balance logic, show what balance WOULD be if approved
  - Action buttons (only on Pending cards): Approve (green) / Reject (red)
  - Clicking Approve/Reject uses the exact existing approve/reject backend logic — no change there
- This replaces the existing plain table for leave requests with the card layout described

### Tab 2: "Leave balance and assignment"
See Part 2 below — this is the new bulk assignment grid.

## Part 2 — Bulk Assignment Grid (NEW)

### Purpose
Let admin see everyone's leave balances at a glance, and assign leave types to
multiple people at once, instead of one person at a time.

### Grid layout
- Sticky checkbox column (leftmost) + sticky Name column
- Department column
- One column PER ACTIVE LEAVE TYPE (dynamically generated from LeaveType list)
- Each cell shows ONE of two states:
  - **Assigned**: a thin progress bar (5px height, rounded) showing remaining/total
    ratio — green fill if >30% remaining, orange/warning fill if ≤30% remaining.
    Below the bar: "X of Y days left" in small text (bold X, muted "of Y days left")
  - **Not assigned**: muted text "Not assigned" + a small "Assign" link/button that
    opens the same assignment flow for just that one person + leave type

### Selection and bulk action
- Header checkbox = select all visible rows
- Row checkboxes = select individual people
- A selection bar above the grid always shows: "N people selected" (bold count)
- "Bulk assign leave" button (top right) — disabled/greyed when 0 people selected,
  enabled once ≥1 person is selected

### Bulk assign panel (opens on button click)
- Slide-in panel from the right (not a full-screen modal) showing:
  - Title: "Assign leave types"
  - Subtitle: "N people selected" (reflects current selection)
  - Checklist of ALL active leave types (checkbox each) — admin can select multiple
    leave types to assign in one action
  - Footer: Cancel button + Assign button
- On Assign: for every selected person × every checked leave type, create/update
  a balance record. If a person already has that leave type assigned, do nothing
  (idempotent) — don't reset their used/remaining counts.

### Backend
- New model: `PersonLeaveAssignment`
  ```
  adminId: String, required
  personType: String, enum ['staff','teacher','student'], required
  personId: String, required
  leaveTypeId: String, required
  allocatedDays: Number  // copied from LeaveType.maxDaysPerYear at assignment time
  usedDays: Number, default 0
  createdAt: Date, default Date.now
  ```
  Unique compound index: `{ adminId, personType, personId, leaveTypeId }`

- `POST /v1/leave-assignment/bulk-assign`
  - Body: `{ leaveTypeIds: [String], persons: [{ personType, personId }] }`
  - For each person × each leaveTypeId: upsert a PersonLeaveAssignment
    (skip if one already exists — do not overwrite existing usedDays)
  - Returns `{ assignedCount, skippedCount }`

- `GET /v1/leave-assignment/grid?adminId=&personType=`
  - Returns all people of that type with their PersonLeaveAssignment records
    joined against all active LeaveTypes, in the shape the grid needs:
    `[{ personId, name, department, balances: { [leaveTypeId]: { allocated, used } | null } }]`
  - One query for people, one query for assignments, joined in memory — not
    N+1 queries per person

- When a LeaveRequest is approved (existing Phase 8 flow), also decrement
  `PersonLeaveAssignment.usedDays` by the approved dayCount for that person +
  leaveType (in the same transaction as the existing DailyAttendance write).
  If no PersonLeaveAssignment exists for that person+leaveType (i.e. never
  bulk-assigned), skip this decrement — don't block the existing approval flow.

### Frontend
- New component under the existing leave-request module (same Angular module,
  just a new tab + new sub-components) — no separate routing needed if using
  tabs within the existing page; add a route only if a page-level split is
  cleaner in the existing codebase's pattern (follow whatever the Roster page
  did for its Staff/Teacher/Student tabs — same tab pattern, don't reinvent)
- New service methods: `bulkAssignLeave()`, `getLeaveAssignmentGrid()`

## What NOT to change
- LeaveType model and its create/edit form — untouched (that's Part A from the
  earlier improvements doc, if not yet done, do it separately)
- LeaveRequest model, fields, validators — untouched
- Approve/reject business logic (balance check, DailyAttendance write,
  transaction handling) — untouched, only ADD the PersonLeaveAssignment
  decrement inside the existing transaction
- Teacher self-apply and class-student-apply flows — untouched

---

## Part 3 — Additional improvements (from earlier real-usage testing)

These were identified from actually running the app and are additive on top of
Parts 1 and 2 above.

### 3a. Auto-reject on balance exceed
- In the existing approve flow (and the new bulk-apply flow from Part 2):
  before writing DailyAttendance, calculate working days in range (excluding
  Sundays + existing Holiday rows — same logic already used).
- Compare against remaining balance (from PersonLeaveAssignment if assigned,
  else the existing balance calculation).
- If requested days > remaining: auto-set status = 'Rejected', with
  rejectionReason = "Balance exceeded: {remaining} day(s) left, {requested} requested"
- Admin override: add `forceApprove: true` flag on the approve request body —
  when set, skip the balance check and approve anyway. Frontend shows a
  confirmation dialog when balance would be exceeded, offering "Approve anyway".

### 3b. Cancel / unassign an approved leave
- On an Approved request card (Approvals tab): add a "Cancel" action.
- Modal requires a cancellation reason (text, required) and a confirmation
  message: "This will remove the Leave attendance marks for these dates."
- Backend: `PATCH /v1/leave-request/:id/cancel`, body `{ cancellationReason }`.
  Only allowed when status = 'Approved'. Sets status = 'Cancelled', stores
  cancellationReason. In a transaction: delete DailyAttendance rows where
  leaveRequestId = this request's _id AND isOverridden = true AND
  source = 'MANUAL'. If a PersonLeaveAssignment exists for that person+type,
  add the dayCount back to usedDays (reverse the earlier decrement from Part 2).
  Return the count of removed attendance rows.

### 3c. Date picker restriction
- Apply form (single and bulk): `fromDate` minimum = today, past dates
  disabled in the picker. `toDate` minimum = `fromDate`.
- Frontend validation error if a past fromDate is submitted: "Leave can only
  be applied from today onwards."
- Backend validation: if fromDate < today (UTC midnight) → 400 "Cannot apply
  leave for past dates" — UNLESS the request includes `allowPastDates: true`,
  which is only honored when the requester is an admin (not the teacher route).
  This lets admin backfill/correct a leave record when genuinely needed.

## Implementation order
1. Part 1 (Approvals tab redesign) + balance badges
2. Part 2 (PersonLeaveAssignment + bulk assignment grid)
3. Part 3a (auto-reject + override) — depends on Part 2's balance source
4. Part 3b (cancel) — depends on Part 2's PersonLeaveAssignment for the usedDays reversal
5. Part 3c (date restriction) — independent, can go anytime