# Global fixes — rules for every module (single file)

Permanent cross-module rules plus a status table. Run together with a module's fix file, e.g. `attendance-fix1.md`.
Fresh Claude Code session, no agents, don't commit, short replies.

Before you say done: re-read the reference html/.md and list one line per item what you matched and what you could not;
run the build and the tests you wrote; do not report PASS for anything you have not run.

## How to run with a module fix file
1. Read this file, then the module's fix file. Do both in one run.
2. Apply every global rule below to the pages of THAT module only (not other modules).
3. Shared components (date/range picker, overlay `.dd`, spinner button, Good-to-know panel, pager) are built ONCE in the
   shared layer and reused. If one already exists, reuse it; do not duplicate.
4. At the end, update the **Status** table at the bottom: for that module, per rule mark `done` / `partial` / `not done`
   with one short reason. Print the same table in your final report. Never mark done what you did not run or see.
5. A module not yet in the table is added when it is first fixed.

## Rules
1. **Calendars/pickers:** all pages use the same picker as Roster's "Applies to Month" field (ranges especially); final
   design for all future modules. Every input/form control/filter dropdown opens as an overlay on the upper layer,
   directly below its trigger. Filter sizes come from the html; only equalize sizes (not selected-state or bulk-action
   buttons like Bulk Assign).
2. **Stream Group:** wherever Class/Stream/Section filters exist add a Stream Group filter (Class -> Stream ->
   Stream Group -> Section; a Group belongs to a Stream). Class create has Stream Group; a General-group class preselects it, disabled (show-only). Stream Group is filter + show only, never a shift/assign target.
3. **Lazy loading per page route**, not per module. If a module-level chunk is truly needed, explain why for review.
4. **Time is always 12-hour AM/PM** everywhere (display, input, picker, API-to-UI formatting).
5. **Speed:** load, create, edit, delete, filter change and transitions must feel instant and reliable. Measure and report
   before/after ms; fix slow queries (indexes, lean, projection, no N+1), no blocking animations, no full reloads after writes.
6. **"Good to know"** panel on every page: plain-language steps for non-technical users; 2-3 shown, rest under "Read more".
7. **Uniform sizes:** one fixed search-box size everywhere, same size for the buttons to its right, all filters equal
   height and width. Only calendar (month) filters have their own width, constant regardless of month text length: ONE shared month-filter component/style in the global stylesheet
   (`--month-filter-w: 178px`, sized for "September 2026"), used by every page. Never a per-page width override.
8. **Disabled filters** show the same text as enabled ("All departments"), never "Select a department".
9. **Tests (market-ready):** Unit/spec, Backend API, Live (real DB), Failure/rollback, Browser/UI. Run as the separate
   test round, not inside a module fix run, unless the fix file asks.
10. **Pagination** sizes include 75 and 100.
11. **Every submit button** shows a spinner on the disabled button after submit (existing disabled behaviour stays).
12. **Filter rows:** at most 6 filters per row on desktop, extra filters wrap to the next row (all equal width, `minmax(0,1fr)` columns).
    On mobile (<=640px) every filter row shows **2 filters per row**, never 1.
13. **Wide tables on mobile:** sticky/fixed columns may take at most ~40% of the viewport width. On <=640px keep only checkbox + name
    sticky (narrower), hide secondary fixed columns (type, avatar) or move them under the name, and shrink day/data columns so real
    data is visible beside the sticky columns (about 4 columns at 390px). Page never scrolls horizontally; only the table wrapper does.

## Status (Claude Code updates this after each module run)
| Module | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | R10 | R11 | R12 | R13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Attendance | done | done | done | done | partial | done | done | done | done | done | done | done | done |
| Student | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Academic Setup | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Staff | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Leave | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Holiday | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Fees | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Certificates | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Approvals | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Settings | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Dashboard | - | - | - | - | - | - | - | - | - | - | - | - | - |

`-` = not checked yet. Add a short "Notes" list under the table for every partial / not done.

### Notes — Attendance (2026-10-17, fix2)
- Part D (P0) fixed. "Route not found" came from `AdminAuthInterceptor`: every 403, including v2 PermissionErrors like MARK_OUTSIDE_WINDOW, triggered a token refresh at `/api/admin/refresh`. That route doesn't exist (the backend has `/v1/admin/refresh`), and the refresh's 404 replaced the real error. Fixed: correct URL, shaped 403s pass through, and a failed refresh returns the original error. Student marks used the server's active session (2027-2028) instead of the header's (2026-2027, where the 102 enrolments and class shifts are). Mark now sends session + class context and the server checks the enrolment. Student view needs a Class first. With no worker running, Sync said "already running" forever; it now returns SYNC_WORKER_DOWN. `scripts/test-attendance-routes.js` checks 19/19 frontend calls against the real route table.
- R1 done: every control on Overview, Roster and Manage Shifts is shared (`app-dd`, `app-month-nav`, `app-date-range-picker` popover, pagination `app-dd`), with no native select. The month filter now uses `--month-filter-w: 178px` (was `--month-filter-width: 210px`), and its calendar opens as a portal below the trigger. Playwright (`e2e/attendance-fix2.spec.ts`) opens every enabled control and checks it sits 8px from its trigger. It also checks equal pill widths, "All …" on disabled pills, and 178px for 12 months at 1440px and 390px.
- R5 partial: the grid now runs in 2 parallel stages with no duplicate reads. Mark, sync, shift and roster reads run in parallel. The shift cache uses DEL instead of a keyspace SCAN. getMore round-trips are gone. Reconcile enqueue no longer blocks roster writes. Mark updates the chip optimistically, and in-flight loads are cancelled. Warm p50 before → after, at the same ~80 ms RTT: staff grid 672 → 338–422 ms, student grid (102) 1743 → 630–669 ms, filter change 731 → 350–524 ms, month change 623 → 338–468 ms, roster load 291 → 185 ms, shifts load 241 → 170–188 ms, Sync 2737 → 679 ms. Writes are now transactional, which adds round-trips: shift create/edit/delete 1109/759/770 → 641/459/405 ms, roster assign/delete 370/395 ms. Still over target: the student grid (3 network stages: session → people → month data) and month change over 300 ms. Explain plans show every grid query on an index (keysExamined = returned), so the remaining time is network round-trips. Remote-cluster latency spikes (ping p90 up to 1.7 s) make single samples unreliable.
- R9 done (real counts, all run): Unit = backend `test-attendance-v2` 18/18 + Karma 35/35. Backend API = `test-attendance-api` 10/10 (real router, auth, Joi, permission, Idempotency-Key, over HTTP). Live = `LIVE_APP_DB=1 test-attendance-mark-v2` 18/18 on the app database under a throwaway school id, with 38 rows removed and 0 left. Failure/rollback = `test-attendance-failure` 6/6. Browser = Playwright 10/10 (fix2 6 + parity 4; the parity specs need `--workers=1`, because in parallel their page loads time out). Also `test-attendance-routes` 19/19 and `test-working-day` 6/6. Bug found and fixed: mark, roster and shift writes and their activity-log entries were not one transaction, so a failure could half-save. They now run inside `withTransaction`.
- Not fixed: `TeacherAuthInterceptor` has the same wrong refresh URL (`/api/teacher-user/refresh`). That's legacy, outside Attendance. Holiday's own `.month-nav` copy still has its own width (Holiday module).
- Device punches: the pipeline works, but the terminal has sent nothing since 2026-08-27, and v2 staff are not enrolled on WDMS (unchanged from fix1).
