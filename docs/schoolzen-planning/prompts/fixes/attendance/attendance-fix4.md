# Attendance fix 4 — Roster rebuild, Overview past dates, Today column

Read `prompts/fixes/global-fixes.md` first (Rules 14-19). Source of truth: `v1/attendance/roster.html|md` and `attendance-overview.html|md`. Do not edit earlier fix files.

## A. Roster (match roster.html)
1. Filters follow Rule 14: one grid, 6 per row desktop, 2 per row mobile, same cell size as Overview. Person Type first. Staff shows Department, Designation. Student shows Class, Stream, Stream Group, Section (cascade Class -> Stream -> Stream Group -> Section as on Overview). The other type's filters are hidden, not disabled. Month filter is the LAST cell (3-letter month, "Aug 2026").
2. Buttons: "Bulk Assign", "Bulk Edit", "Bulk Delete" (modal titles too; the single-row pencil keeps "Edit Assignment"). All 130px x 38px, 2 per row on mobile, nothing overflows at 390px.
3. Sticky columns use the Rule 16 shadow on the last left sticky column.
4. A roster covers the WHOLE selected month (day 1 to last day), not only the days after the assign date. Bulk Assign with "Applies to Month" writes every day of that month (week-offs per the weekly-off toggle). Past days are written too. Re-assign changes the whole month unless the user picks a date range.
5. Days outside any roster show the "no roster" state and are locked.

## B. Overview (match attendance-overview.html)
1. Day columns stay exactly as in the html (chronological, none moved). Today is a normal date column that scrolls with all the others (Rule 19: no sticky, no raised look). Remove any sticky/pinned/z-index/shadow styling already added to the Today column in Overview AND Roster. On load only the grid wrapper scrolls so Today is at the right end of the visible area. Desktop and mobile. Same in Roster.
2. Past dates (before today) that have a roster day: default status is Absent when there is no record, and the status is EDITABLE (Mark Present / Mark Late / Mark Absent) only when ALL are true: a roster exists for that day, date is before today, it is a working day (not Holiday, approved Leave or Roster week-off), no device punch exists for that person/day (device always wins), the user has the new permission key `attendance-edit-past`, and the date is inside the selected session. Backend enforces every condition (403 with a clear message), writes the activity log with old status, new status, user and time, and sets `source:'manual'`. No time is shown on past manual marks. Idempotency-Key + spinner as for today.
3. Dates after the roster ends, and upcoming dates, stay locked (dashed). Tooltips: "Past date, click to change", "Recorded by the device, can't be changed", "Holiday, leave or week off can't be changed here", "You do not have permission to change past attendance", "Upcoming date", "No roster for this day".
4. Month filter is the last cell of the filter grid (Rule 14). Sticky shadow per Rule 16.
5. Add `attendance-edit-past` to Roles & Permissions (seed + UI) next to `attendance-mark`.

## C. Tests (essential)
- Fix `v2-test-attendance-mark`: its 4 failures come from using a Sunday (day off) as test data. Pick a real working day (not a roster week-off) dynamically so the suite passes on any weekday.
- Backend: past edit allowed in the allowed case; refused (403) for no roster, holiday/leave/week-off, device punch, no permission, other session; log written.
- Live DB: whole-month roster creation incl. past days; past Absent default; edit then read back; clean up.
- Browser (Playwright, parallel): Roster filters by type, bulk buttons 2 per row at 390px with no overflow, Overview Today column last, past chip popover.

## D. Not in this run
Device punches (owner task), Stream Group per-shift assign.
