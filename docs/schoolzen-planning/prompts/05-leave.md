# Build: Leave module (all 3 pages)

Depends on Staff and Student modules — build those first.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/leave/leave-requests.{html,md}`
3. `docs/schoolzen-planning/v1/leave/leave-create.{html,md}`
4. `docs/schoolzen-planning/v1/leave/leave-assign.{html,md}`

## Build
**Backend**: `models/leave/leave-request.js`, `leave-type.js`, `leave-limit.js`; `controllers/leave/*.controller.js`; matching routes.
**Frontend**: `leave/leave-requests/`, `leave/leave-create/`, `leave/leave-assign/`; `shared/services/leave/*.service.ts`; `shared/models/leave/*.model.ts`.

## Critical rules
- Both Staff and Student can request leave — filter shapes differ (Dept+Designation vs Class+Stream+Group+Section) but share the same Person Type toggle pattern used in Attendance.
- Leave Requests' action per row depends on STATUS, never all actions shown at once: Pending→Approve/Reject, Approved→Cancel, Rejected→Delete.
- Approving a request transactionally increments the matching `LeaveLimit.usedDays` — never a separate unguarded write (concurrent approvals must not exceed an allocation). Cancelling reverses it, also transactionally.
- Leave Create's `isPaid:false` flag is read by Payroll's generation logic later — build the field now even though Payroll isn't built yet.
- Leave Assign's table has ONE COLUMN PER LEAVE TYPE dynamically — not a fixed column set.

## Design rules
Zero native `<select>`. Bootstrap Icons only. Requests and Assign share the same 6-col-grid-plus-second-row filter toolbar shape (many filters); Create is a plain single-row toolbar (few controls) — match each page's own shape.

## When done
Show all 3 pages next to their references. Confirm the per-status action switching on Requests, and that Assign's leave-type columns are genuinely dynamic.
