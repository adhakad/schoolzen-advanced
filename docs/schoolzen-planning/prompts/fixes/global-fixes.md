# Global fixes — rules for every module (single file)

Permanent cross-module rules plus a status table. Run together with a module's fix file, e.g. `attendance/attendance-fix3.md`.
Fresh Claude Code session, no agents, don't commit, short replies.

Before you say done: re-read the reference html/.md and list one line per item what you matched and what you could not;
run the build and the tests you wrote; do not report PASS for anything you have not run.

## How to run with a module fix file
1. Read this file, then the module's fix file. Do both in one run.
2. Global means ALL modules and ALL pages. Apply every global rule below to every page of every module that is already built, not only the module of the fix file. Fix it once in the shared layer (global stylesheet, shared components), then sweep each page and confirm it uses the shared piece (no per-page copies). Print the Status table with one row per module.
3. Shared components (date/range picker, overlay `.dd`, spinner button, Good-to-know panel, pager) are built ONCE in the
   shared layer and reused. If one already exists, reuse it; do not duplicate.
4. At the end, update the **Status** table at the bottom: for that module, per rule mark `done` / `partial` / `not done`
   with one short reason. Print the same table in your final report. Never mark done what you did not run or see.
5. A module not yet in the table is added when it is first fixed.

## Global sweep run order (use when the prompt says "global sweep")
Global means ALL built modules and ALL pages. Do in this order, in one run:
1. Shared layer, built once (global stylesheet + shared components): Overview-style filter grid with the month filter as its last cell (R14), 3-letter month names (R20), bulk button naming and equal size, 2 per row on mobile (R15), sticky shadow token (R16), no overflow at 390px (R17).
2. Session source (R18): do `shared/shared-fix2.md` fully, including its page-by-page audit table.
3. Sweep every page of every module (Dashboard, Student, Academic Setup, Staff, Attendance, Leave, Holiday, Payroll, Fees, Examination, Certificates, Approvals, Settings): switch to the shared pieces, remove per-page copies, check at 390px and desktop. Do not change the date columns of calendar grids in tables.
4. The module fix file named in the prompt (e.g. `attendance/attendance-fix4.md`, A, B, C). Today column is a normal date column that scrolls with the others, opened at the right end of the visible area (R19).
5. Run the tests the files list. Fill the Status table (R1-R20, one row per module) and the Notes here and in shared-fix2.md.

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
   height and width. The calendar (month) filter is NOT special: it is the LAST cell of the same filter grid (Rule 14), so it is always exactly one filter wide. ONE shared month-filter component in the global stylesheet, used by every page. Month names are 3 letters ("Jan", "Sep 2026") in the label and in the calendar title. Never a per-page width override.
8. **Disabled filters** show the same text as enabled ("All departments"), never "Select a department".
9. **Tests (market-ready):** Unit/spec, Backend API, Live (real DB), Failure/rollback, Browser/UI. Run as the separate
   test round, not inside a module fix run, unless the fix file asks.
10. **Pagination** sizes include 75 and 100.
11. **Every submit button** shows a spinner on the disabled button after submit (existing disabled behaviour stays).
12. **Filter rows:** at most 6 filters per row on desktop, extra filters wrap to the next row (all equal width, `minmax(0,1fr)` columns).
    On mobile (<=640px) every filter row shows **2 filters per row**, never 1.
13. **Wide tables on mobile (see also Rule 16):** sticky/fixed columns may take at most ~40% of the viewport width. On <=640px keep only checkbox + name
    sticky (narrower), hide secondary fixed columns (type, avatar) or move them under the name, and shrink day/data columns so real
    data is visible beside the sticky columns (about 4 columns at 390px). Page never scrolls horizontally; only the table wrapper does.

14. **Filter system = Attendance Overview.** Every page's filter row copies the Overview grid: same cell width/height, same placement and spacing, 6 per row on desktop, 2 per row on mobile. Each page shows ONLY the filters its data needs, named for what they filter ("All departments", "All classes", ...). The calendar/month filter is the LAST cell of that same grid, never its own row. Where a page has Person Type (Staff/Student), choosing the type shows only that type's filters and hides the other type's (Staff: Department, Designation. Student: Class, Stream, Stream Group, Section), it does not show them disabled. Reference: `v1/attendance/attendance-overview.html`.
15. **Bulk actions.** Buttons that act on checked rows are named "Bulk Assign", "Bulk Edit", "Bulk Delete" (never "Assign to Selected", "Delete Selected"). All toolbar buttons on a page are the same width and height (130px x 38px, label centred, no wrapping). On mobile they sit 2 per row, full width of their cell. Disabled until rows are checked.
16. **Sticky (fixed) columns.** Sticky columns keep the white surface background. The LAST left sticky column gets a light theme shadow on its right edge: `--sticky-shadow: 6px 0 8px -6px rgba(140,82,255,.22), 1px 0 0 var(--line)`, defined once in the global stylesheet. On mobile the name column is the last sticky column and carries the shadow. Same on desktop and mobile.
17. **No overflow.** At 390px nothing overflows the page horizontally: toolbars, button groups, filter rows, cards and modals wrap or shrink. Only a table wrapper scrolls sideways. Check every page of every module at 390px.
18. **Academic session (header + data).** The header session dropdown reads the `v2` academic-session collection (name/year/dates), never legacy. The selected session id is sent with every request and every page filters its data by it. Default selection = the session whose dates cover today (else the latest one), and the choice is remembered. Per-page audit and the fix are in `prompts/fixes/shared/shared-fix2.md`.
19. **Today column (day-by-day grids).** Today is a NORMAL date column: same position, same size, same scrolling as every other day. Not sticky, not pinned, not raised (no extra z-index or shadow), only the light highlight it already has. Date columns are never moved or removed. On load the grid scrolls (the grid wrapper only, never the page) so Today sits at the right end of the visible area with earlier days to its left. Desktop and mobile. Applies to Attendance Overview, Roster and every future day grid.
20. **Month names = 3 letters in every calendar filter/month label, in ALL modules and ALL pages** ("Jan", "Feb", "Mar" ... "Sep 2026"): filter label, its popup title, headings that show a month. Sweep every page. Table calendar grids (day columns) are not touched by this rule.

## Status (Claude Code updates this after each module run)
| Module | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | R10 | R11 | R12 | R13 | R14 | R15 | R16 | R17 | R18 | R19 | R20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Attendance | partial | done | done | done | partial | done | done | done | partial | done | done | done | done | - | - | - | - | - | - | - |
| Student | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Academic Setup | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Staff | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Leave | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Holiday | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Fees | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Certificates | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Approvals | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Settings | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Dashboard | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Payroll | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Examination | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |

`-` = not checked yet. Add a short "Notes" list under the table for every partial / not done.

### Notes — Attendance (2026-10-17)
- R1 partial: Overview mark popover verified 8px under its cell (Playwright); Roster "Applies to Month" picker is a popover. Other `.dd` overlays not re-checked one by one in this run.
- R5 partial: live `GET /grid` measured at 1.9–3.5 s (staff, 3 people) and ~0.95 s (students) on the remote cluster. No optimisation done in this run, so there is no before/after.
- R9 partial: ran unit/spec (Karma), backend pure tests, live real-DB tests (`test-attendance-mark-v2`, `test-working-day`) and browser tests (Playwright parity for Overview, Roster, Manage Shifts). There is no dedicated failure/rollback suite; refusal paths are covered inside the live tests.
- Device punches: the pipeline code works, but zero punches reach v2. The terminal (GED7261701240) has sent nothing to WDMS since 2026-08-27, and its 2 enrolled codes belong to legacy `staffs` ids, not v2 Staff. v2 staff are never enrolled on WDMS. Needs a v2 Staff → WDMS enrolment (Staff module) plus re-enrolment on the device.
### Rule 7 update (2026-10-18)
Month filter is now exactly one filter cell wide (not 178px) and month names are 3 letters ("Sep 2026"). Superseded on 2026-10-19 by Rules 14 and 7: it is the last cell of the filter grid. Every module with a month filter must be re-checked: R7 = not done until fixed (Attendance Overview, Roster, Leave, Holiday, Payroll and any other).
