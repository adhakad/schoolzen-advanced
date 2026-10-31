# Shared fix 3 — filters: one consistent system on EVERY page (final, do it completely)

Read `prompts/fixes/global-fixes.md` first. Do not edit `shared-fix1.md` or `shared-fix2.md`. Reference for the look and placement: `v1/attendance/attendance-overview.html` (filters, month filter, search, buttons). Roster reference: `v1/attendance/roster.html`.

## What went wrong
1. Rule 14's Person Type sentence ("choosing the type shows only that type's filters") was meant for Roster only. It was applied to every page, so Attendance Overview and others now hide/show filters when Staff/Student is chosen.
2. Filters on other modules are still not sized or placed like Overview (own flex rows, fixed widths, uneven cells, month filter in its own row or its own width).

## The rule (this is the whole standard, apply it to every page)
1. ONE shared filter-grid component/style in the global layer: `display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:8px;` and `repeat(2, minmax(0,1fr))` at <=640px. Every filter cell fills its grid cell: same width, height 38px. No per-page widths, no `flex` rows with fixed px pills, no copies.
2. All of a page's filters are always visible together. A filter that does not apply yet is shown DISABLED with the normal "All ..." text (Class -> Stream -> Stream Group -> Section enable step by step, Department -> Designation, and so on). Person Type NEVER hides or shows other filters, EXCEPT in Roster (point 6).
3. Only the filters a page needs, named for what they filter, in the same order as the Overview (Person Type, Department, Designation, Class, Stream, Stream Group, Section, then page-specific ones such as Status, Shift, Fee head, Exam).
4. The calendar/month filter is the LAST cell of the same grid, 3-letter month ("Sep 2026"), never in its own row, never its own width.
5. Search box: 340px wide, 38px high, on the row above the filters, with the page's buttons right-aligned, all buttons 130px x 38px, 2 per row on mobile. Nothing overflows the card or the page at 390px.
6. Roster ONLY: Person Type shows just the chosen type's filters and hides the other type's (Staff: Department, Designation. Student: Class, Stream, Stream Group, Section). Make this opt-in through one explicit input (for example `hideByPersonType`), default off, used only by Roster.

7. Defaults and resets: every filter starts at "All ..." (never pre-selected, no value left over from earlier use). Exceptions only where the html says so (Person Type starts on its first option as in the Overview, a General-group class preselects its Stream Group, disabled). When a parent filter changes, every filter below it resets to "All ...". Some modules still show only the filters of the chosen option instead of all filters: that is wrong everywhere except Roster, find and fix every such page.

## Do (in this order, one run)
1. Build/repair the shared filter-grid once. Make the Person Type hiding opt-in (point 6) and restore the all-visible behaviour on Attendance Overview and on every page the sweep changed (use `git log` / `git diff` of the sweep).
2. Audit EVERY page of EVERY module that has a filter row (Student, Academic Setup, Staff, Attendance Overview / Roster / Manage Shifts, Leave, Holiday, Payroll, Fees, Examination, Certificates, Approvals, Settings, Dashboard). Fill the table in Notes: page | filters before | what was wrong (size / placement / hidden / month own row / search size / buttons) | fixed.
3. Switch each page to the shared grid, remove the page's own filter CSS, and fix search/buttons sizes (points 3 to 5). Do not touch table calendar grids (day columns).
4. Update `prompts/fixes/global-fixes.md` Rule 14 and the Filters paragraph in `v1/_core/design-system.md` so they say exactly this rule (Person Type hiding is Roster only).

## Tests (essential, one Playwright spec that loops all pages in the audit table)
- At 1366px: each filter row has at most 6 cells, all cells in a row have equal width (within 1px) and height 38px, month filter is the last cell, search is 340px, buttons are 130x38.
- At 390px: 2 cells per row, no horizontal page overflow (document scrollWidth <= viewport).
- Overview: switching Person Type keeps all filters visible (inapplicable ones disabled). Roster: switching Person Type hides/shows the type's filters.
- On every audited page: all filters show "All ..." on load, and changing a parent resets its children to "All ...".
- Build passes. Print one line per page: PASS/FAIL with the measured numbers. Do not report PASS for a page you did not run.

## Notes (Claude Code fills the audit table here)

### Audit (2026-10-31) — page | filters before | what was wrong | fixed
Measured by `e2e/shared-fix3-filters.spec.ts` at 1366px and 390px (hermetic build + fixtures). Shared pieces: `.sz .toolbar-row2` grid (cells 38px), `--search-width: 340px`, `.toolbar-btn-group` (130 x 38), `app-person-filter` (`hideByPersonType`, Roster only), `app-class-cascade-filter`, `app-month-nav`.

| Page | Filters before | What was wrong | Fixed |
|---|---|---|---|
| Academic Setup / Classes & Sections | none (search + 2 buttons) | search 300px | search 340, buttons 130x38 |
| Academic Setup / Subjects | none | search 300px | yes |
| Academic Setup / Subject Groups | Class, Stream | page `.toolbar-pill {128px}`; disabled Stream showed a hint instead of "All streams" | grid cells, "All …" kept |
| Student / Manage Students | Class, Stream, Group, Section | page search 260px; cascade `app-dd {150px}`; "All groups" | search 340, grid cells, "All stream groups" |
| Student / Admission | Class, Stream, Group, Section | page search 300px; cascade width | yes |
| Student / Class Promotion | Class (required), Stream, Group, Section | page search 260px; button outside the button group (auto width) | yes (Class stays "Select class" by design) |
| Staff / Manage Staff | Department, Designation, Status | page `.toolbar-pill {180px}`; Designation showed "Select a department first"; "Any status" | grid cells, "All designations", "All statuses" |
| Staff / Departments | none | button outside group | yes |
| Staff / Designations | Department | page `.toolbar-pill {180px}`; button outside group | yes |
| Attendance / Overview | Person Type + 6 + month | type switch HID the other type's filters | all 8 cells always visible (other type disabled), via `app-person-filter` |
| Attendance / Roster | Person Type + type filters + month | own copy of the filter markup | `app-person-filter [hideByPersonType]="true"` (the only page) |
| Attendance / Manage Shifts | none | search 300px | yes |
| Leave / Requests | Person Type + 6 + Leave Type, Status, month | person-filter HID the other type; "Any status" | all visible/disabled, "All statuses" |
| Leave / Assign | Person Type + 6 | hid the other type | all visible/disabled |
| Leave / Create | none | search 300px | yes |
| Holiday / Holidays | month (Holiday Calendar) | — | last (only) cell |
| Holiday / Templates | none | search 300px | yes |
| Holiday / Assign | Person Type + 6 | hid the other type | all visible/disabled |
| Payroll / Generate Payroll | Department, Designation, Status, month | Designation hint text | "All designations" |
| Payroll / Salary Payouts | Department, Designation, Mode, Status, month | "Any mode", "Any status"; hint text | "All modes", "All statuses" |
| Payroll / Assign Salary | Department, Designation | hint text | yes |
| Payroll / Salary Groups | none | own `.sg-toolbar` flex row, search 300px, button outside group | standard toolbar |
| Fees / Fees, Fee Structure | Class, Stream, Group | cascade width, "All groups" | yes |
| Fees / Fee Reminder | none | own `.fr-toolbar`, search 300px | standard toolbar |
| Examination / Admit Card Structure | Class, Stream, Group, Section | page search 260px, button outside group | yes |
| Examination / Generate Admit Card | Class, Stream, Group, Section | search 260px, button outside group | yes |
| Examination / Marksheet Structure | Class, Stream | own `.single-row` flex toolbar, no grid | grid row |
| Examination / Generate Marksheet | Class, Stream, Term | search 260px, `.term-pill {150px}` | yes |
| Certificates / Generate TC | Class, Stream, Section, Status | "Any status" | "All statuses" |
| Approvals | Applicant + type filters + Type, Status | applicant switch HID the other type's filters; "Any status" | all 8 visible/disabled, "All statuses" |
| Settings / Academic Sessions | none (1 button) | button outside group | yes |
| Settings / Roles & Permissions | Department, Designation, Role, Assigned | hint text; "Assigned + Unassigned"; "Selected Delete (n)" outside group | "All assignments", "Bulk Delete" 130x38 |
| Dashboard, Settings / Admission Form Fields, Marksheet Templates, Certificates / TC Structure | no filter row | — | not applicable |

Not done / open:
- Approvals has no Stream Group filter (its API has no group filter); not added.
- Buttons hidden by permissions in the hermetic run (Payroll, Fees, Exam structure pages) were not measured.
- Reset was not exercised where the fixture gave nothing to pick (Class Promotion, Admit Card Structure, Marksheet Structure, Subject Groups, Leave Assign).
- Labels "Print Selected (n)", "Bulk Enter Marks (n)", "Generate for Selected" were not renamed (filters-only run).
