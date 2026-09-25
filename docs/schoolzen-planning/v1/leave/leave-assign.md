# Leave — Leave Assign

Status: **FINAL**
Reference: `leave-assign.html`

Gives each person their yearly leave allowance per leave type — overrides the type's default.

---

## Frontend

**Toolbar**: same shape/filters as Leave Requests (Person Type/Dept/Class/Designation/Stream/Group/Section cascade), plus a "Set Leave Limit" button (disabled until rows selected).

**Table**: checkbox, Name, Department, then **one column per active Leave Type** (dynamic columns, not fixed) — each cell shows the days set ("12 days") or "Not set" with an inline "Set" link.

**Bulk-assign modal**: sets one leave type's day-count for every selected person at once — existing per-person values it doesn't touch stay as they are (not reset).

## Backend

Schema — `LeaveLimit`: `adminId`, `personType`, `personId`, `leaveTypeId`, `sessionId`, `allocatedDays`, `usedDays` (incremented transactionally by Leave Requests' approve action, per that page's `.md`). Bulk-set is one `bulkWrite`, not N single updates.
