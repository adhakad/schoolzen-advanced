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
1. Shared layer, built once (global stylesheet + shared components): Overview-style filter grid with the month filter as its last cell (R14), 3-letter month names (R20), bulk button naming and equal size, 2 per row on mobile (R15), sticky shadow token (R16), no overflow at 390px (R17), R21 toolbar, R22 skeleton, R23 model names (`node backend/scripts/v2-test-model-names.js`).
2. Session source (R18): do `shared/shared-fix2.md` fully, including its page-by-page audit table.
3. Sweep every page of every module (Dashboard, Student, Academic Setup, Staff, Attendance, Leave, Holiday, Payroll, Fees, Examination, Certificates, Approvals, Settings): switch to the shared pieces, remove per-page copies, check at 390px and desktop. Do not change the date columns of calendar grids in tables.
4. The module fix file named in the prompt (e.g. `attendance/attendance-fix4.md`, A, B, C). Today column is a normal date column that scrolls with the others, opened at the right end of the visible area (R19).
5. Run the tests the files list. Fill the Status table (R1-R23, one row per module) and the Notes here and in shared-fix2.md.

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

14. **Filter system = Attendance Overview (final standard: `shared/shared-fix3.md`).** ONE shared filter grid in the global layer (`.sz .toolbar-row2`): `repeat(6, minmax(0,1fr))`, gap 8px, `repeat(2, minmax(0,1fr))` at <=640px; every cell fills its grid cell, height 38px; no per-page widths or copies. Each page shows ONLY the filters its data needs, named for what they filter ("All departments", "All classes", ...), in the Overview order (Person Type, Department, Designation, Class, Stream, Stream Group, Section, then page-specific ones). All of a page's filters are always visible together; one that does not apply yet is DISABLED with its "All …" label. Person Type NEVER hides or shows other filters, EXCEPT in Roster (opt-in `hideByPersonType`, Roster only: Staff shows Department, Designation; Student shows Class, Stream, Stream Group, Section). Every filter starts on "All …" and a parent change resets its children to "All …". The calendar/month filter is the LAST cell of that same grid, never its own row. Search 340 x 38 on the row above, buttons 130 x 38. Reference: `v1/attendance/attendance-overview.html`.
15. **Bulk actions.** Buttons that act on checked rows are named "Bulk Assign", "Bulk Edit", "Bulk Delete" (never "Assign to Selected", "Delete Selected"). All toolbar buttons on a page are the same width and height (130px x 38px, label centred, no wrapping). On mobile they sit 2 per row, full width of their cell. Disabled until rows are checked.
16. **Sticky (fixed) columns.** Sticky columns keep the white surface background. The LAST left sticky column gets a light theme shadow on its right edge: `--sticky-shadow: 6px 0 8px -6px rgba(140,82,255,.22), 1px 0 0 var(--line)`, defined once in the global stylesheet. On mobile the name column is the last sticky column and carries the shadow. Same on desktop and mobile.
17. **No overflow.** At 390px nothing overflows the page horizontally: toolbars, button groups, filter rows, cards and modals wrap or shrink. Only a table wrapper scrolls sideways. Check every page of every module at 390px.
18. **Academic session (header + data).** The header session dropdown reads the `v2` academic-session collection (name/year/dates), never legacy. The selected session id is sent with every request and every page filters its data by it. Default selection = the session whose dates cover today (else the latest one), and the choice is remembered. Per-page audit and the fix are in `prompts/fixes/shared/shared-fix2.md`.
19. **Today column (day-by-day grids).** Today is a NORMAL date column: same position, same size, same scrolling as every other day. Not sticky, not pinned, not raised (no extra z-index or shadow), only the light highlight it already has. Date columns are never moved or removed. On load the grid scrolls (the grid wrapper only, never the page) so Today sits at the right end of the visible area with earlier days to its left. Desktop and mobile. Applies to Attendance Overview, Roster and every future day grid.
20. **Month names = 3 letters in every calendar filter/month label, in ALL modules and ALL pages** ("Jan", "Feb", "Mar" ... "Sep 2026"): filter label, its popup title, headings that show a month. Sweep every page. Table calendar grids (day columns) are not touched by this rule.
21. **Toolbar (shared-fix4).** ONE shared toolbar component (`app-data-toolbar`): search + Actions menu + primary button. No page writes its own toolbar or button CSS.
 a. One row on desktop: search, then **Actions**, then the black **primary** button last (right-most). Filters are the rows below (Rule 14 grid).
 b. Search: one size everywhere, flex, min 200px, max 280px, 38px high.
 c. Primary = the black "Add .../Create/main" button: 38px high, width by text, min 130px, max 180px, ellipsis + full text in the tooltip.
 d. Every non-primary button is an item of ONE button named exactly "Actions" (with chevron), even if there is only one. No loose secondary buttons, no "Bulk Actions". If there is no primary, Actions is the last item on the right.
 e. Item names use bulk naming (Bulk Print, Bulk Enter Marks, Bulk Generate, Bulk Assign, Bulk Delete, Import, Export ...); never "... Selected". A count shows inside the item only when rows are ticked: "Bulk Delete (3)".
 f. Each item declares `needs`: `[]` always enabled, `['sel']` needs ticked rows, `['Class','sel']` needs a filter value + rows. An unmet item stays visible but disabled, shows the reason on its right ("select rows", "choose a class"), and its tooltip starts with the reason. Recomputed live.
 g. Danger item (Delete) is red, last, under a separator. Menu hint line: "Some actions unlock when you tick rows or choose a filter".
 h. Menu opens under the button, `width: max-content`, never wider than the card (card - 36px), closes on outside click / Esc, keyboard usable.
 i. Card width <= 640px: row 1 search alone (full width, no button); row 2 Actions (left) + primary (right) in two equal columns; if only one exists it sits on the right at its normal width (min 110px). Menu opens left-aligned inside the card.
 j. Filter grid by card width: 6 per row, 4 per row at 641-819px, 2 per row at <= 640px. Month filter last.
 k. No horizontal overflow at 390px; long text ellipsis + full text in the tooltip.
 l. UI disabling is not security: data-changing actions keep their Roles & Permissions key and activity log on the backend.
22. **Loading skeleton (shared-fix4).** ONE shared skeleton component (`app-skeleton`), theme grey-purple, 1.2s shimmer; no per-page skeleton CSS.
 a. Every page, on tables, cards, dashboard tiles: first load and every filter/month change.
 b. Real shape: tables keep the real columns (the skeleton is a second `<tbody>` of the same table) with 8-10 rows; cards use the card size; avatars round. No layout jump when data arrives.
 c. Search, Actions, primary and filter boxes are shown at once and stay usable; only their data is skeleton.
 d. Spinner only inside a button during save/delete/bulk action. No spinner, blur or fade on the page or table, no "Loading..." text.
 e. Nothing for the first 150ms; after 10s an error with "Retry". Empty data after load shows "No records", never a stuck skeleton.
 f. 390px: no overflow; wide tables keep the same skeleton shape (they scroll inside their wrapper).

23. **v2 naming (shared-fix5).** Everything v2 is named v2, so you can tell what runs.
 a. Every model used by v2 code starts with "v2" (file, export, `mongoose.model` name), in the same style as the already-correct v2 models.
 b. Every collection of a v2 model starts with "v2-" (example `v2-activity-logs`). Renamed only by the one-time migration script (`renameCollection`, dry-run first, counts compared, run once per database after a backup). Never copy or move data; never touch legacy collections.
 c. v2 code uses no legacy model; only the read-only legacy `device` read stays (WDMS terminal serials). Where no v2 model exists, create a v2 one (fresh collection), never copy legacy documents.
 d. Services, helpers, scripts and tests that wrap a v2 model are named v2 too. Never rename API URLs, route paths, permission keys, env keys or response shapes.
 e. Legacy files, models and collections stay as they are. Delete only v2 files with zero references and zero documents.
 f. Guard test fails on a v2 model/helper without the v2 name, on a v2 import of a legacy model (except `device`), and on a v2 model with a non-"v2-" collection.

## Status (Claude Code updates this after each module run)
| Module | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | R10 | R11 | R12 | R13 | R14 | R15 | R16 | R17 | R18 | R19 | R20 | R21 | R22 | R23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Attendance | partial | done | done | done | partial | done | done | done | partial | done | done | done | done | done | - | - | - | - | - | - | done | done | done |
| Student | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Academic Setup | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Staff | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Leave | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Holiday | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Fees | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Certificates | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Approvals | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Settings | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | partial | done |
| Dashboard | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | n/a | partial | done |
| Payroll | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |
| Examination | - | - | - | - | - | - | - | - | - | - | - | - | - | done | - | - | - | - | - | - | done | done | done |

`-` = not checked yet. Add a short "Notes" list under the table for every partial / not done.

### Notes — Attendance (2026-10-17)
- R1 partial: Overview mark popover verified 8px under its cell (Playwright); Roster "Applies to Month" picker is a popover. Other `.dd` overlays not re-checked one by one in this run.
- R5 partial: live `GET /grid` measured at 1.9–3.5 s (staff, 3 people) and ~0.95 s (students) on the remote cluster. No optimisation done in this run, so there is no before/after.
- R9 partial: ran unit/spec (Karma), backend pure tests, live real-DB tests (`v2-test-attendance-mark`, `v2-test-working-day`) and browser tests (Playwright parity for Overview, Roster, Manage Shifts). There is no dedicated failure/rollback suite; refusal paths are covered inside the live tests.
- Device punches: the pipeline code works, but zero punches reach v2. The terminal (GED7261701240) has sent nothing to WDMS since 2026-08-27, and its 2 enrolled codes belong to legacy `staffs` ids, not v2 Staff. v2 staff are never enrolled on WDMS. Needs a v2 Staff → WDMS enrolment (Staff module) plus re-enrolment on the device.
### Notes — shared-fix3 (2026-10-31)
- R14 done on every page with a filter row (audit table and measurements in `shared/shared-fix3.md`; `e2e/shared-fix3-filters.spec.ts` 35/35). Approvals partial: no Stream Group filter. Dashboard has no filter row. Other rule columns were not re-checked in this run.

### Notes — shared-fix4 (2026-10-31)
- R21: shared `.toolbar-btn-group` (global CSS + `ToolbarButtonsDirective`, auto-applied to every group) and `[szTip]` tooltip; every page's own toolbar/button CSS removed. Measured by `e2e/shared-fix4-toolbar.spec.ts` (36/36); audit table in `shared/shared-fix4.md`.
- R21 partial (Student, Staff, Attendance, Holiday): Manage Students, Manage Staff, Roster and Holidays have 3-4 buttons; at 1366px they need 766-906px beside a 340px search but the card row is 736px, so the button row moves under the search (still right-aligned, primary last, 130 x 38). Mobile layout is to spec on all of them.
- R21 n/a: Certificates (Generate TC), Approvals, Dashboard have no toolbar buttons (Payroll Salary Payouts and Exam Marksheet Structure neither; their modules have other pages that do).
- R14 Approvals now done: Stream Group filter added (Class -> Stream -> Stream Group -> Section), sent to the API as `groupId`.

### Notes — shared-fix4 v2: Rules 21 + 22 (2026-11-02)
- R21: `app-data-toolbar` (search 200-280px, one "Actions" menu with `needs`, primary right-most) on all 32 toolbar pages; the old `.toolbar-btn-group` CSS and `ToolbarButtonsDirective` are removed. Layout follows the CARD width (ResizeObserver), not the viewport. Measured by `e2e/shared-fix4-toolbar.spec.ts` at 390/1366/1920; audit table in `shared/shared-fix4.md`.
- R21 Dashboard n/a: no toolbar.
- R22: `app-skeleton` replaces every page's "Loading..." text and Attendance Overview's table fade. Settings partial: Roles & Permissions Step 1 (role pills) has no skeleton (its own pill row, not a table). Dashboard partial: widgets use the lines skeleton, not a tile-shaped one. Filter dropdowns still load their options without a skeleton (the boxes are shown and usable at once). Modal-internal "Checking..." hints with a spinner (Admission Form Fields, Marksheet Templates, Fee Reminder "Sending" note) were left as they are.

### Rule 7 update (2026-10-18)
Month filter is now exactly one filter cell wide (not 178px) and month names are 3 letters ("Sep 2026"). Superseded on 2026-10-19 by Rules 14 and 7: it is the last cell of the filter grid. Every module with a month filter must be re-checked: R7 = not done until fixed (Attendance Overview, Roster, Leave, Holiday, Payroll and any other).

### Notes — shared-fix5: Rule 23 v2 naming (2026-11-11)
- R23 done for every module: v2 models/collections are `v2-*` (5 collections renamed on the dev DB by `backend/scripts/migrate-v2-collection-names.js`, counts identical; production NOT run — command in `shared/shared-fix5.md`), v2 code imports no legacy model except the read-only `device`, wrapper helpers/services/scripts/tests are `v2-*`. Guard: `node backend/scripts/v2-test-model-names.js`.
- Owner follow-ups: no v2 School Profile page writes `v2-school-profiles` yet (letterhead shows "SCHOOL" until it exists); see `shared/shared-fix5.md` "Also list".
