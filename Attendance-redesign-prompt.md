Redesign the attendance configuration and reconciliation completely. Read CLAUDE.md first.

PART 1 — SHIFT MODEL CHANGES:
Add these fields to the existing Shift model: earlyPunchMinutes (Number, default 30), halfDayAfterMinutes (Number, default 120), earlyCheckoutMinutes (Number, default 30), lateCheckoutMinutes (Number, default 60). These are set by the school owner and apply to all person types (student/staff/teacher) using that shift. Update the Shift frontend form to show all these fields with clear labels in two groups: "Punch-In Settings" (earlyPunchMinutes, graceMinutes, halfDayAfterMinutes) and "Punch-Out Settings" (earlyCheckoutMinutes, lateCheckoutMinutes).

PART 2 — REMOVE ATTENDANCERULE COMPLETELY:
Delete AttendanceRule model, controller, routes, validator, and frontend page (component, service, module, routing). Remove its route mount from routes.js. Remove any import or reference to AttendanceRule from all files including attendance-reconcile.js.

PART 3 — ADD CLASSSHIFT MODEL AND BULK ASSIGNMENT:
Create a new ClassShift model: adminId (String required), class (String required), shiftId (String required FK to Shift), unique compound index on {adminId, class}. Create backend controller and routes at /v1/class-shift: GET all (by adminId), POST bulk-assign (body: {shiftId, classes: []}  — upsert one record per class), DELETE one. Create a frontend page at pages/admin/class-shift with a simple form: Shift dropdown (populated from ShiftService) + multi-select checklist of classes (fetched from existing student data distinct classes) + one "Assign" button that calls bulk-assign. Add to sidebar nav. Follow CLAUDE.md New Module Checklist and naming conventions.

PART 4 — RECONCILE LOGIC REWRITE:
Rewrite attendance-reconcile.js with this exact logic, O(n) using aggregation + bulkWrite:
1. Load all ClassShift records for this adminId into a Map keyed by class (one DB read).
2. Load all active Roster records for this adminId+dateKey into a Map keyed by personId (one DB read).
3. For each person in the PunchLog aggregation result (min/max punchTime grouped by personId+personType): determine their shift — staff/teacher: lookup Roster Map → get Shift; student: lookup ClassShift Map by their class field → get Shift; if no shift found → skip this person (no DailyAttendance row, they are Absent by omission).
4. For each person with a shift: compute punch-in window = shiftStart - earlyPunchMinutes to shiftStart + halfDayAfterMinutes; compute punch-out window = shiftEnd - earlyCheckoutMinutes to shiftEnd + lateCheckoutMinutes. firstIn = earliest punch within punch-in window; lastOut = latest punch within punch-out window; punches outside both windows are completely ignored.
5. If no valid firstIn exists → skip (Absent by omission, no row written).
6. Status: if firstIn <= shiftStart + graceMinutes → Present; else if firstIn <= shiftStart + halfDayAfterMinutes → Late; else → HalfDay.
7. Write via single bulkWrite updateOne+upsert. Skip persons with isOverridden:true.

PART 5 — PUNCH INTERVAL FILTER:
In punch-ingest.js, before insertMany, filter the fetched punches: sort by personId+punchTime, discard any punch within MIN_PUNCH_INTERVAL_SECONDS (env var, default 60) of the previous accepted punch for the same person. Add MIN_PUNCH_INTERVAL_SECONDS=60 to .env.

PART 6 — ROSTER AUTO-RECONCILE ON CHANGE:
When a Roster entry is created, updated, or deleted, enqueue an attendance-reconcile job for that adminId+dateKey so DailyAttendance is automatically recomputed with the new shift assignment.

Use .lean() on all Mongoose reads. Ensure all indexes used. Follow CLAUDE.md conventions throughout.

PART 7 — VERIFY MODE + WDMS RESYNC:
Add verifyMode field (Number, default 4 = Card Only) to BiometricMapping model. Pass it as verify_mode in wdms-employee.js buildEmployeePayload when creating or updating a WDMS employee. After every WDMS employee create or update (both from Assign Card and from verifyMode change), call WDMS resync endpoint POST /iclock/api/terminals/resync_data/ (or the correct resync endpoint from the WDMS API manual) so the device immediately gets the updated employee settings — non-blocking, log warning if it fails but never fail the Schoolzen save. Also add a manual "Resync to Device" button in the Assign Card modal and in the Staff/Teacher/Student list table row actions that triggers the same WDMS employee update + device resync for that person on demand.

PART 8 — ATTENDANCE LIST VIEW (CALENDAR GRID):
Replace the current select-to-view attendance approach with a full list view: show all staff/teachers/students in rows, with dates as columns (month calendar grid). Sticky columns: person name and roll/emp code must stay fixed (sticky left) while date columns scroll horizontally. Each cell shows status chip (Present=green, Late=yellow, HalfDay=orange, Absent=red, Holiday=grey, Leave=blue). Clicking a cell opens the existing day detail modal (punch trail + manual entry). Add month/year picker at top. Separate tabs or toggle for Staff, Teacher, Student views. This matches the Roster grid pattern already built — reuse the same table/CSS pattern for consistency.