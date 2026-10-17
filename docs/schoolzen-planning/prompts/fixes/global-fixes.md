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
   height and width. Only calendar filters have their own width, constant regardless of month text length.
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
| Leave | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Holiday | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Fees | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Certificates | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Approvals | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Settings | - | - | - | - | - | - | - | - | - | - | - | - | - |
| Dashboard | - | - | - | - | - | - | - | - | - | - | - | - | - |

`-` = not checked yet. Add a short "Notes" list under the table for every partial / not done.

### Notes — Attendance (2026-10-17)
- R1 partial: Overview mark popover verified 8px under its cell (Playwright); Roster "Applies to Month" picker is a popover. Other `.dd` overlays not re-checked one by one in this run.
- R5 partial: live `GET /grid` measured at 1.9–3.5 s (staff, 3 people) and ~0.95 s (students) on the remote cluster. No optimisation done in this run, so there is no before/after.
- R9 partial: ran unit/spec (Karma), backend pure tests, live real-DB tests (`test-attendance-mark-v2`, `test-working-day`) and browser tests (Playwright parity for Overview, Roster, Manage Shifts). There is no dedicated failure/rollback suite; refusal paths are covered inside the live tests.
- Device punches: the pipeline code works, but zero punches reach v2. The terminal (GED7261701240) has sent nothing to WDMS since 2026-08-27, and its 2 enrolled codes belong to legacy `staffs` ids, not v2 Staff. v2 staff are never enrolled on WDMS. Needs a v2 Staff → WDMS enrolment (Staff module) plus re-enrolment on the device.