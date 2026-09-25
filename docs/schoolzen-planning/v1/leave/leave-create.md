# Leave — Leave Create

Status: **FINAL**
Reference: `leave-create.html`

Defines the types of leave the school offers.

---

## Frontend

**Table**: Name, Who Can Take It (tag), Assigned Days, Paid (yes/no), Status, Action.

**Add/Edit modal**: Name (required) → "Who can take this leave" `.dd` (Everyone / Staff only / Students only — controls visibility on the Apply Leave form elsewhere) → Assigned Days per year (a default, overridable per-person on Leave Assign) → a toggle-switch "Salary is paid for these days" (off = deducted from salary at payroll time) → Status `.dd`.

## Backend

Schema — `LeaveType`: `adminId`, `name`, `whoCanTake:'everyone'|'staff'|'students'`, `defaultDays`, `isPaid` (bool), `status`. `isPaid:false` is read by Payroll's generation logic to deduct salary for days taken under this type — this is a genuine cross-module dependency, not decorative.
