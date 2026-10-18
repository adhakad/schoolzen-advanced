# Attendance - fix 3 (leftovers after fix 2)

Fix 2 is applied; do not edit it. Fresh Claude Code session, no agents, don't commit.
Read `prompts/fixes/global-fixes.md` first. Source of truth: `v1/attendance/*.html|md`.

Before you say done: re-read the reference html/.md and list one line per item what you matched and what you could not;
run the build and the tests you wrote; do not report PASS for anything you have not run.

## A. Texts
Tooltips and popover captions are English everywhere (the html now uses the same English strings): "Past dates can't be changed", "Upcoming date", "Upcoming date (from roster)",
"No roster for this day", "Attendance window is closed (7:30 AM - 2:30 PM)", "You do not have permission to mark attendance", "Time comes from the server (AM/PM).", "Saving...".
Make the app match the html exactly.

## B. Roster filters
`roster.html|md`: the Roster toolbar is its OWN shape, filters are flex-wrap pills of about 150px each (Person Type, Department/Class, Designation), not the 6-column grid.
Global rule 12 is satisfied (never more than 6 per row, wraps, equal width, 2 per row on mobile). Match the html; the app currently uses the 6-column grid (pills too narrow).

## C. R5 student grid and filter/month change (still over target)
Measure on the **API server** (use the `Server-Timing` header / server logs), not only in the browser: the dev machine reaches the remote DB cluster with about 80 ms per round trip, which inflates every number.
- Student grid currently needs three sequential DB trips (session -> students -> marks). Remove them: resolve session/class from a Redis-cached lookup (invalidated on write), run the independent
  queries with `Promise.all`, or use one aggregation with `$lookup`. Target: one DB round trip on a cache hit.
- Filter change and month change: cancel in-flight requests (switchMap), keep the previous grid visible with the `is-loading` dim instead of clearing it, prefetch the next month in idle time.
- Report before/after server-side ms and browser ms for staff grid, student grid, filter change, month change. If the server number is under target but the browser number is not, say it is network latency.

## D. Device punches (not a code task, only verify)
Re-check after the owner has re-enrolled devices. Do not write to WDMS. Report: punches seen in WDMS in the last day, matched to v2 staff, rows in `PunchLog`, attendance docs produced. If the terminal is still silent, say so in one line.

## E. Housekeeping
- API and worker must both be running for Sync Now. Document the two PM2 start commands in the Attendance README note (API and worker as separate processes).
- Update the Attendance row and Notes in the Status table of `global-fixes.md` (R5).
