# Build: Attendance module (all 3 pages)

Depends on Student and Staff modules — build those first.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/attendance/attendance-overview.{html,md}`
3. `docs/schoolzen-planning/v1/attendance/manage-shifts.{html,md}`
4. `docs/schoolzen-planning/v1/attendance/roster.{html,md}`

## Build
**Backend**: `models/attendance/attendance-record.js`, `shift.js`; `controllers/attendance/*.controller.js`; matching routes.
**Frontend**: `attendance/attendance-overview/`, `attendance/manage-shifts/`, `attendance/roster/`; `shared/services/attendance/*.service.ts`; `shared/models/attendance/*.model.ts`.

## Critical rules
- `AttendanceRecord`: one doc per person per day, `punches[]` array — never one per punch event. Unique `(adminId, personType, personId, date)`.
- Each of these 3 pages has its OWN toolbar row structure — Overview uses a 6-column filter grid (row2), Roster uses a plain flex row of 3 filters, Manage Shifts has no filter row at all. Match each page's own `.html` exactly; do not force one page's row-split onto another (this exact mistake was made once already and had to be corrected).
- Sync (Overview) and Delete Selected (Roster) both require confirmation before firing — never on a single click.
- Manage Shifts blocks deleting an in-use shift, naming the affected count.

## Design rules
Zero native `<select>`. Bootstrap Icons only. `.dd-label` never wraps.

## When done
Show all 3 pages next to their references. Confirm the filter cascade works on both Overview and Roster, and that each page's toolbar genuinely matches its own reference's row shape.
