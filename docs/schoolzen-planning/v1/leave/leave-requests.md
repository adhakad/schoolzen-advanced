# Leave — Requests

Status: **FINAL**
Reference: `leave-requests.html`

Every leave request across staff and students, in one place.

---

## Frontend

**Toolbar**: row1 (search + Apply Leave button), then a 6-col filter grid (Person Type → Department/Class → Designation/Stream → Group, cascading same as elsewhere) plus a second row (Section, Leave Type, Status, Month nav) — 9 filters total across two rows, both grids since there are genuinely many filters here.

**Table**: Name (avatar+name+code+type+"days left"), Leave Type (tag), From–To, Days, Status (tag: Pending/Approved/Rejected), Action — **the action shown depends on status, never all four at once**:
- Pending → Approve (check icon) / Reject (x icon)
- Approved → Cancel (undo icon)
- Rejected → Delete (trash icon)

**Apply Leave modal**: opens a form (person, leave type, date range) — Submit disabled until valid.

## Backend

Approving a request must **transactionally increment the matching `LeaveLimit`'s usedDays** — never a separate unguarded write, so concurrent approvals can't exceed an allocation. Rejecting does NOT touch attendance (per the side panel's own tip) — the request simply becomes a terminal `rejected` state. Cancelling an approved request should reverse the `LeaveLimit` increment (also transactional).

**Balance enforcement (backend, not just a frontend hint):**
- On `POST` create: compute working days in the requested range (excluding Sundays + existing Holiday rows — same logic the reconcile worker already uses) and compare against that person's `LeaveLimit.allocatedDays − usedDays` for the requested `leaveTypeId`. If requested days exceed remaining balance, reject the request at creation with 400 — a request that can never be honored shouldn't sit in the Pending queue.
- If no `LeaveLimit` document exists at all for that person+leaveType (never assigned via Leave Assign), **block approval** with 400 — "This person has not been assigned this leave type — set their limit first." Enforced in the Approve handler itself, regardless of what the frontend shows.
- Admin override: an `forceApprove: true` flag on the Approve request body skips the balance/assignment checks above — only honored on the admin-facing approve route, never the self-apply route. Frontend shows a confirm dialog ("This exceeds their remaining balance — approve anyway?") before sending it.
- Cancel is blocked server-side once `toDate` has passed (server wall-clock date) — 400 "This leave has already been completed and cannot be cancelled." A completed row's Cancel action is hidden on the frontend too, but the backend check is what actually matters.
