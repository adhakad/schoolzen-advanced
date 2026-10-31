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
