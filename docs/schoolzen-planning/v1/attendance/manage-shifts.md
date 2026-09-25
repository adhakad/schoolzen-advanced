# Attendance — Manage Shifts

Status: **FINAL**
Reference: `manage-shifts.html`

Define punch windows, grace periods, half-day/late rules that Overview and Roster both read from.

---

## Frontend

**Toolbar**: single row — search + Create (this page has no filters worth a second row; a Status filter may be added if genuinely useful, check the actual reference for its current toolbar before assuming).

**Table**: No./Name/Start/End/Early In/Grace/Half Day After/Early Out/Late Out/Status(tag)/Action.

**Add/Edit modal**: grouped — "Punch-In Settings" (applies to staff AND students: Early Punch minutes, Grace minutes) then "Staff Only" (optional: Half Day After minutes, Early Checkout minutes, Late Checkout minutes — students' day is decided by arrival punch alone) then Status `.dd`.

**Delete**: blocked with a message naming the assigned-count if the shift is currently in use — reassign via Roster first.

## Backend

Schema — `Shift`: `adminId`, `name`, `startTime`, `endTime`, `earlyInMinutes`, `graceMinutes`, `halfDayAfterMinutes` (staff-only), `earlyOutMinutes` (staff-only), `lateOutMinutes` (staff-only), `status`. Unique `(adminId, name)`. Delete endpoint counts references in `StudentEnrollment`/`Staff` before allowing, returning a `ConflictError` with the count if any exist.
