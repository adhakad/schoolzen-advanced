# Global fixes — rules for every module (single file)

Permanent cross-module rules plus a status table. Run together with a module's fix file, e.g. `attendance/attendance-fix3.md`.
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
   (`--month-filter-w` = exactly one filter cell: 1/6 of the row on desktop, 1/2 on mobile), used by every page. Month names are 3 letters ("Jan", "Sep 2026") in the label and in the calendar title. Never a per-page width override.
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
| Attendance | partial | done | done | done | partial | done | done | done | partial | done | done | done | done |
| Student | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Academic Setup | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Staff | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Leave | - | - | - | - | - | - | partial | - | - | - | - | - | - |
| Holiday | - | - | - | - | - | - | partial | - | - | - | - | - | - |
| Fees | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Certificates | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Approvals | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Settings | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Dashboard | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Payroll | - | - | - | - | - | - | partial | - | - | - | - | - | - |

`-` = not checked yet. Add a short "Notes" list under the table for every partial / not done.

### Notes — Attendance (2026-10-17)
- R1 partial: Overview mark popover verified 8px under its cell (Playwright); Roster "Applies to Month" picker is a popover. Other `.dd` overlays not re-checked one by one in this run.
- R5 partial: live `GET /grid` measured at 1.9–3.5 s (staff, 3 people) and ~0.95 s (students) on the remote cluster. No optimisation done in this run, so there is no before/after.
- R9 partial: ran unit/spec (Karma), backend pure tests, live real-DB tests (`test-attendance-mark-v2`, `test-working-day`) and browser tests (Playwright parity for Overview, Roster, Manage Shifts). There is no dedicated failure/rollback suite; refusal paths are covered inside the live tests.
- Device punches: the pipeline code works, but zero punches reach v2. The terminal (GED7261701240) has sent nothing to WDMS since 2026-08-27, and its 2 enrolled codes belong to legacy `staffs` ids, not v2 Staff. v2 staff are never enrolled on WDMS. Needs a v2 Staff → WDMS enrolment (Staff module) plus re-enrolment on the device.
### Rule 7 update (2026-10-18)
Month filter is now exactly one filter cell wide (not 178px) and month names are 3 letters ("Sep 2026"). Every module with a month filter must be re-checked: R7 = not done until fixed (Attendance Overview, Roster, Leave, Holiday, Payroll and any other).

### Notes — Attendance (2026-10-18, attendance-fix3.md A/B/C/E; D skipped, needs the owner)
- R5 partial: grid is now ONE DB stage on a cache hit (Redis member hint per filter, self-checking: a stale hint re-reads, never a wrong cell; live test `test-attendance-grid-hint`). Server-side median of 11 (API on the dev machine, remote cluster): staff 277→191 ms, student 468→286 ms, filter change 271→184 ms, month change staff 257→186 ms / student 406→246 ms. What remains is the ~80 ms DB round trip plus ~55 ms Upstash Redis round trip — network latency, not query cost. "Client" numbers were taken with a Node HTTP client on the same machine (≈ server + 10 ms), not in a real browser. Frontend: in-flight grid request cancelled, previous grid kept with `is-loading` dim, next month prefetched in idle time (60 s). `Server-Timing` header now on every API response.
- R7 done: Overview and Roster month filter = one filter cell, 3-letter names; Playwright checks 12 months at 1440 px and 390 px.
- A: Overview tooltips/captions match the html ("Upcoming date (from roster)", "Attendance window is closed (7:45 AM - 2:00 PM)", "You do not have permission to mark attendance", "Time comes from the server (AM/PM).", "Saving..."). B: Roster row 2 is a flex-wrap row of 150 px pills (2 per row ≤640 px), Playwright-checked against roster.html. E: PM2 commands in `v1/attendance/README.md`.
- Known: `test-attendance-mark-v2` has 4 failures on 2026-10-18 (a Sunday → "day off"); the same 4 fail on HEAD without these changes — date-dependent test data, not fixed here.

### Notes — Leave / Holiday / Payroll (2026-10-18, R7 only)
- Holiday: its own month filter (`holiday-calendar-filter`, min-width 190 px) removed; now the shared `app-month-nav` (holiday bands, chips, "Holiday Calendar", "Show all months", 314 px calendar). Payroll Generate / Salary Payouts: month `app-dd` replaced by `app-month-nav`. Leave already used it. R7 partial: unit spec + build only, no browser run on these pages yet.

### Notes — Shared (2026-10-18, shared-fix1.md)
- S1 done: one `TokenRefreshInterceptor` base (`shared/interceptors/token-refresh.interceptor.ts`) for admin/teacher/sales: only 401 refreshes (one shared refresh, one retry, else logout); 403 passes through. Teacher refresh URL was `/api/teacher-user/refresh` (404) → `/v1/teacher-user/refresh`. Backend auth middlewares + refresh endpoints answer 401 (not 403) for missing/expired/forged tokens. Tests: Karma interceptor spec (4), `test-auth-refresh` (21, incl. refresh URLs in the route table).
- S2 done: `resolveRequestSessionId` (client label wins; unknown label → 404 SESSION_NOT_FOUND; active flag only when nothing is sent). Before: Attendance, Leave, Holiday, Dashboard (and Approvals via Leave) silently fell back to the active session; Recent Arrivals and reconcile used the active flag directly — reconcile now uses the session covering the day. Fees and Certificates were already strict. Live test `test-session-resolution` (4).
- S2 data (not changed): school 69bad565… has 2027-2028 flagged **active** and 2026-2027 **closed**; today (2026-10-18) is in 2026-2027, so the flag looks wrong. Owner to decide. Other schools: 2026-2027 active (correct).
- S3 done: one `--month-filter-w` (= one filter cell) + one `app-month-nav` host rule in the global stylesheet; no per-page width left. `monthLabel` is 3-letter everywhere.
- S4 done: the 4 older parity specs stalled in parallel on external CDN/Google Fonts loads; `e2e/hermetic.ts` serves Bootstrap Icons from node_modules and blocks external fonts on both pages. Full suite passes in parallel (10/10, twice, ~40 s; was 4 timeouts).
