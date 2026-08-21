Revise the plan with these changes before executing:

REVISION 1 — PUNCH INGEST FILTER (punch-ingest.js):
When fetching WDMS transactions for a school+date, apply this filter BEFORE insertMany so only meaningful punches reach the DB:
- Determine each person's shift windows from their Roster (staff/teacher) or ClassShift (student).
- For staff and teacher: keep only the FIRST punch within the punch-in window AND the FIRST punch within the punch-out window. Maximum 2 PunchLog rows per person per day.
- For student: keep only the FIRST punch within the punch-in window. Maximum 1 PunchLog row per person per day.
- All other punches from WDMS are discarded before insertMany — never saved to DB at all.
- If a person has no shift assigned (no Roster/ClassShift), apply the MIN_PUNCH_INTERVAL_SECONDS=60 filter only and save all remaining punches (they will be skipped during reconcile with an unshiftedCount warning).

REVISION 2 — ROSTER PAGE STUDENT TAB (frontend):
Do NOT create a separate ClassShift frontend page or sidebar entry. Instead, add a Student tab to the existing Roster page/module alongside the Staff and Teacher tabs. The Student tab shows: 1) a Shift dropdown (from ShiftService), 2) multi-select class chips (Class 1 through 12, fetched from distinct student classes) with quick-link shortcuts (Select All, Clear, Class 1-5, Class 6-10), 3) a selected-count label, and 4) a single 'Assign Shift' button that calls POST /v1/class-shift/bulk-assign with {shiftId, classes: []}. Below the assignment form, show a table of current class-shift assignments with a Change button per row. Staff and Teacher tabs show the existing individual day-cell roster grid — completely untouched. No roster grid for students — student shift is class-level, not individual. Period picker (month/year) is only shown for Staff/Teacher tabs, not for Student tab (ClassShift is not month-specific — it is permanent until changed).

REVISION 3 — STUDENT RECONCILE RULES:
For personType student in attendance-reconcile.js: use only the punch-in window firstIn to determine status — Present (firstIn <= shiftStart + graceMinutes) or Late (firstIn > shiftStart + graceMinutes). No HalfDay status for students. No lastOut tracking for students. Fields earlyCheckoutMinutes, lateCheckoutMinutes, halfDayAfterMinutes remain in the Shift model schema (for staff/teacher) but are never read when processing a student.

REVISION 4 — SHIFT FORM UI:
The Shift create/edit form must show all fields but clearly group and label them. Show earlyCheckoutMinutes, lateCheckoutMinutes under a "Staff/Teacher Only" section label so school owners understand these don't apply to students. halfDayAfterMinutes should also be under that label.

Keep all other parts of the plan exactly as approved.

REVISION 5 — SHIFT FORM NO DEFAULTS + PUNCH INTERVAL:
In the Shift create form, all numeric fields (graceMinutes, earlyPunchMinutes, halfDayAfterMinutes, earlyCheckoutMinutes, lateCheckoutMinutes) must have NO default values pre-filled — fields start empty and are required. School owner must fill every field manually. Validators must reject empty/null values. Also change MIN_PUNCH_INTERVAL_SECONDS from 60 to 18000 (5 hours = 300 minutes) in .env and in punch-ingest.js — this ensures only one meaningful punch per window per person reaches the DB even without shift-based filtering.

REVISION 6 — PROTECT EXISTING ROSTER UI:
The existing Staff and Teacher tabs in the Roster page are working perfectly — do NOT modify any existing roster component HTML, CSS, or TypeScript for staff/teacher functionality. Only ADD the new Student tab alongside existing tabs. Do not touch any existing roster grid, cell click handlers, bulk assign modal, or month navigation for staff/teacher. Only the backend ClassShift model/controller/routes are new — frontend change is additive only (new Student tab, rest untouched).

REVISION 7 — ATTENDANCE CALENDAR GRID UI:
Replace the existing attendance page with a calendar grid view. Each row = one person (staff/teacher/student). Each column = one date (1-31 of selected month). Two sticky columns on the left: Name (140px, with the person's current/most-recent shift shown as small muted text below their name) and Code/Roll No (56px) — these stay fixed while date columns scroll horizontally. Each date cell (64px wide, 52px tall) shows two things stacked: 1) status chip (P=green, L=yellow, HD=orange, A=red, H=grey), 2) in-time and out-time on two lines below the chip (10px muted). Shift name is NOT shown in every cell — it appears once per row in the Name column only. Future date cells are dimmed (opacity 0.4) and non-interactive. Today's column has a blue accent highlight and a 'Today' badge in the header. On page load, auto-scroll so today's column is the first visible date column (past dates are accessible by scrolling left). Student tab requires a class selector before showing data. Staff and Teacher tabs show all persons. Clicking a cell opens the existing day detail modal. Reuse the same CSS/table pattern as the existing Roster grid for visual consistency.