# shared-fix4 — one toolbar (Rule 21) + one loading skeleton (Rule 22) on EVERY page

Applies to: ALL modules, ALL pages. Rule 21 = pages with a search box and/or buttons above the table. Rule 22 = every page that loads data.
Reference: approved preview `toolbar-preview.html` (v5). Where an old reference html differs, THIS file wins.

## Step 0 — register the rule (do first)
1. `prompts/fixes/global-fixes.md`: add Rules 21 and 22 (text below), add R21 and R22 columns to the Status table, add "R21 toolbar, R22 skeleton" to step 1 of "Global sweep run order".
2. `v1/_core/design-system.md`: add one line: "Toolbar = search + Actions menu + primary button (Rule 21)".

## Rule 21 — Toolbar
1. Order in one row (desktop): search, then Actions button, then primary button last (rightmost). Filters are in the rows below (Rule 14 grid).
2. Search: one size everywhere, flex, min 200px, max 280px, height 38px.
3. Primary button = the black "Add ..."/main create button. Height 38px, width by text, min 130px, max 180px, text ellipsis + full text in tooltip.
4. Every non-primary button goes inside ONE button named exactly "Actions" (with chevron). No "Bulk Actions", no loose secondary buttons. Actions sits right after the search box, left of the primary button. If there is no primary, Actions is the last item on the right.
5. Actions menu items: use bulk naming (Bulk Print, Bulk Enter Marks, Bulk Generate, Bulk Assign, Bulk Delete, Import, Export ...). No "Print Selected (n)", "Generate for Selected", "Assign to Selected", "Delete Selected". Show a count only inside the item if rows are ticked, e.g. "Bulk Delete (3)".
6. Each item declares `needs`: `[]` always enabled, `['sel']` needs ticked rows, `['Class','sel']` needs a filter value + rows. Unmet item stays visible but disabled; its right side shows the reason ("select rows", "choose a class"); tooltip starts with the reason. Enabled/disabled recomputes live when rows are ticked or filters change.
7. Danger item (Delete) is red and separated by a line at the bottom. Menu hint line: "Some actions unlock when you tick rows or choose a filter".
8. If a page has only one non-primary button it still goes in Actions.
9. Menu: opens under the button, `width:max-content`, never wider than the card (`max-width: card - 36px`), closes on outside click/Esc, keyboard usable.
10. Mobile (card width <= 640px):
   - Row 1: search alone, full width. NO button in the search row.
   - Row 2: Actions (left) + primary (right), two equal columns. If only one of them exists, it sits on the right at its normal width (min 110px).
   - If neither exists: search only, then filters.
   - If only a primary exists and no search: primary alone on the right.
   - Menu opens left-aligned, stays inside the card.
11. Filter grid (Rule 14) by card width: 6 per row, 4 per row for 641–819px, 2 per row at <= 640px. Month filter is the last cell.
12. No horizontal overflow at 390px, no clipped text; long text ellipsis + tooltip with the full text.

## Rule 22 — Loading skeleton
1. Where: every page, on the table, cards, dashboard tiles and the data of filters. On first load and when a filter or month changes.
2. Shape = real shape: tables use the real column widths and 8-10 skeleton rows; cards use the card size; avatars are round. No layout jump when data arrives.
3. One shared skeleton component, theme colour (light grey-purple), shimmer 1.2s. No per-page skeleton CSS.
4. Search, Actions, primary button and filter boxes are shown at once and stay enabled; only their data is skeleton.
5. Spinner only inside a button during save/delete/bulk action. No spinner or blur on the page or table.
6. No flicker: if data arrives in under 150ms show no skeleton. After 10s show an error with "Retry".
7. Empty data after load shows "No records", never a stuck skeleton.
8. Mobile 390px: no overflow; wide tables keep the same skeleton shape.
9. Do: build the component once, replace every page's old blur/spinner/loading text with it, remove old loading CSS. Add an R22 note per page in the audit table.
10. Test (Playwright): slow the API; skeleton shows, goes away after load, no layout shift; one page per module.

## Do
1. Build/repair ONE shared toolbar component (search + actions menu + primary + needs logic). Do not copy it per page.
2. Replace the toolbar of every page in every module with it. Convert existing secondary buttons into Actions items with the right `needs`. Remove old per-page toolbar CSS.
3. Approvals: add Stream Group filter (pending from shared-fix3).
4. Test data: add fixtures for Structure, Marksheet Structure, Subject Groups, Leave Assign so their toolbars and filters can be tested.
5. Backend: actions that change data keep their Roles & Permissions key and activity log. UI disabling is not security.
6. Fill the audit table below, one row per page.

## Tests (essential only, Playwright; Rule 22 tests are in Rule 22 point 10)
- 390 / 1366 / 1920 widths: search and buttons sizes equal on all pages (measure), no overflow.
- Mobile: search row has no button; Actions and primary are equal width in one row.
- Actions: item disabled with no rows; enabled after ticking rows; filter-dependent item enabled only after choosing the filter.
- One page per module opens the menu and it stays inside the card.

## Notes
- Reference html files still show the old toolbar. Rule 21 wins; update html only if the owner sends them.
- Open choices (default used): single secondary button goes in Actions; Import/Export always enabled; 4 filters per row at 641–819px; search max 280px (replaces 340px in shared-fix3).

## Audit table (Claude Code fills)
| Module | Page | Search size ok | Actions menu | Primary | Mobile ok | Skeleton (R22) | Notes |
|---|---|---|---|---|---|---|---|
| Academic Setup | Classes & Sections | yes | Bulk Delete [sel] | Add Class | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); Add modal class list: lines |  |
| Academic Setup | Subjects | yes | Bulk Delete [sel] | Add Subject | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Academic Setup | Subject Groups | yes | Bulk Delete [sel] | Add Group | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); modal subject list: lines |  |
| Student | Manage Students | yes | Bulk Assign [sel], Import / Export [Class], Bulk Delete [sel] | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) | Import / Export kept filter-gated (needs a Class) - the import is per class; default "Import/Export always enabled" not applied |
| Student | Admission | yes | - | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Student | Class Promotion | yes | - | Confirm Promotion (spinner while running) | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Staff | Manage Staff | yes | Bulk Assign [sel], Bulk Delete [sel] | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Staff | Departments | yes | - | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Staff | Designations | yes | - | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Attendance | Overview | yes | Bulk Report [sel] (was Generate Report) | Sync now (spinner while syncing) | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); table fade (.is-loading opacity) removed |  |
| Attendance | Manage Shifts | yes | - | Create Shift | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Attendance | Roster | yes | Bulk Assign, Bulk Edit [sel + one person type], Bulk Delete [sel] | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) on staff grid and class table | extra page reasons shown after needs are met |
| Leave | Requests | yes | - | Apply Leave | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Leave | Create | yes | - | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Leave | Assign | yes (disabled for Student, business rule) | Bulk Set Limit [sel] (was Set Leave Limit) | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) on staff and class tables; expanded class: lines | permission-gated button shown (disabled "checking your access") while loading, so no layout jump |
| Holiday | Holidays | yes | Generate from Public Holidays [], Bulk Delete [sel] | Add Holiday | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Holiday | Templates | yes | - | Add Template | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Holiday | Assign | yes | Bulk Assign, Bulk Edit [sel + template state] | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) | extra page reasons shown after needs are met; permission-gated button shown (disabled "checking your access") while loading, so no layout jump |
| Payroll | Generate Payroll | yes | Bulk Generate [sel] (spinner while running) | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) | permission-gated button shown (disabled "checking your access") while loading, so no layout jump |
| Payroll | Salary Groups | yes | - | Add Salary Group | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) | permission-gated button shown (disabled "checking your access") while loading, so no layout jump |
| Payroll | Assign Salary | yes | Bulk Assign [sel] | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) | permission-gated button shown (disabled "checking your access") while loading, so no layout jump |
| Payroll | Salary Payouts | yes | - | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Payroll | Payslip (document) | n/a | n/a | n/a | n/a | n/a - print document, no list load |  |
| Fees | Fees | yes | Bulk Report [sel] (was Generate Report) | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Fees | Fee Structure | yes | - | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) | permission-gated button shown (disabled "checking your access") while loading, so no layout jump |
| Fees | Fee Reminder | yes | - | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); "Sending" note spinner left (background job status) | permission-gated button shown (disabled "checking your access") while loading, so no layout jump |
| Fees | Fee Statement | n/a (no toolbar) | n/a | n/a | n/a | cards skeleton (4 x 72px) |  |
| Fees | Fee Receipt (document) | n/a | n/a | n/a | n/a | n/a - print document |  |
| Examination | Admit Card Structure | yes | - | Create | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); modal subjects/view: lines | permission-gated button shown (disabled "checking your access") while loading, so no layout jump |
| Examination | Generate Admit Card | yes | Bulk Print [sel] | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); preview: lines |  |
| Examination | Generate Marksheet | yes | Bulk Enter Marks [Term, sel; one class], Bulk Print [sel] | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); modals: lines |  |
| Examination | Marksheet Structure | n/a (no search on this page) | - | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); setup modal: lines |  |
| Examination | Admit Card / Marksheet document | n/a | n/a | n/a | n/a | n/a - print documents |  |
| Certificates | Generate TC | yes | - | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); preview: lines |  |
| Certificates | TC Structure | n/a (no toolbar) | n/a | n/a | n/a | lines skeleton (6) |  |
| Certificates | TC Certificate (document) | n/a | n/a | n/a | n/a | n/a - print document |  |
| Approvals | Requests | yes | - | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows); Stream Group filter present (Class > Stream > Stream Group > Section) |  |
| Settings | Academic Sessions | n/a (no search on this page) | - | Create Session | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) |  |
| Settings | Roles & Permissions | yes | Bulk Delete [sel] | - | yes (390px measured) | table skeleton (tbody, real columns, 8 rows) on Step 2 matrix; Step 1 role pills: no skeleton (partial) |  |
| Settings | Admission Form Fields | n/a (no toolbar) | n/a | n/a | n/a | lines skeleton (8); impact-check hint spinner in modal left |  |
| Settings | Marksheet Templates | n/a (no toolbar) | n/a | n/a | n/a | cards skeleton (3 x 160px); preview hint spinner in modal left |  |
| Dashboard | Dashboard | n/a (no toolbar) | n/a | n/a | n/a | lines skeleton per widget (partial: not tile-shaped) |  |

`[sel]` = needs ticked rows, `[Class]` / `[Term]` = needs that filter, `[]` = always enabled. Search size ok = 280 x 38 at 1366/1920, full card width at 390 (measured, `e2e/shared-fix4-toolbar.spec.ts`). Every `Loading...` text, the Overview table fade and the old per-page toolbar markup are gone; the only spinners left are inside buttons, plus the three status hints named in the rows.
