# Attendance fix 5 — full test round for attendance-fix4 (all kinds of tests)

Read `prompts/fixes/global-fixes.md` first. Source of truth: `attendance-fix4.md` (A, B), `v1/attendance/roster.html|md`, `attendance-overview.html|md`. Do not edit earlier fix files. This file is the TEST round: write and run tests; fix any bug the tests find in the app code and say what you fixed.

## 1. Failing suite
Fix `test-attendance-mark-v2`: pick a real working day dynamically (not a Sunday or roster week-off) so it passes on any weekday.

## 2. Backend (API) tests, `attendance-edit-past`
1. Allowed: past date + roster exists + working day + no device punch + user has `attendance-edit-past` + inside session -> edit works, status read back.
2. Each refusal is its own test and returns 403 with a clear message: no roster; Holiday; approved Leave; roster week-off; device punch exists; no permission; other session; today or future date.
3. Activity log: old status, new status, user, `source:'manual'`, no time stored.
4. Another tenant (`adminId`) can not read or change this data.
5. `attendance-edit-past` is seeded, shows in Roles & Permissions next to `attendance-mark`, and the backend refuses without it.
6. Route table: every frontend service URL exists in the real route table.
7. v2 isolation: no write to legacy collections (only the read-only legacy `device` read for terminal serials).

## 3. Live DB tests (clean up after)
1. Roster for a whole month incl. past days; re-assign whole month; re-assign with date range; week-off toggle.
2. Past day with roster and no record shows Absent; edit then read back.
3. Device punch added -> device wins, edit refused.
4. Bulk Assign / Bulk Edit / Bulk Delete write only the intended rows.
5. Remove every test record at the end.

## 4. Browser tests (Playwright, widths 390 / 1366 / 1920)
1. Roster: Person Type switches the type filters (hidden, not disabled) ONLY in Roster; filters default to "All ..."; parent change resets children; month filter is the last cell, 3-letter month.
2. Roster: Bulk Assign, Bulk Edit, Bulk Delete inside the Actions menu (Rule 21), enabled only with the needed rows/filters; no overflow at 390px.
3. Overview: Today is a normal date column, scrolls with the others, no sticky/shadow, fully visible at the right end on load (desktop and mobile).
4. Overview: past chip popover and each tooltip text from attendance-fix4 B3; locked dates are not clickable.
5. Overview and Roster sticky column shadow (Rule 16); no horizontal page overflow.
6. Header session comes from the v2 academic-session collection and is the same on every attendance page.

## 5. Final run
Build, then run ALL attendance tests (new and old) together. Give one table: test name, PASS/FAIL, run or not run. Never report PASS for a test you did not run.

## 6. Not in this run
Real device punches (owner task) and real production data; list any test that needs them as "needs owner".
