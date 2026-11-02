# Shared fix 4 — toolbar buttons: global layout, sizes, names, tooltips (all modules, all pages)

Read `prompts/fixes/global-fixes.md` first. Do not edit earlier fix files. One run, do everything.

## Step 0 — add the rule to the permanent files
1. In `prompts/fixes/global-fixes.md` add Rule 21 (text below), add column R21 to the Status table, and add a line to "Global sweep run order" step 1 ("toolbar buttons per R21").
2. In `v1/_core/design-system.md`, in the Bulk buttons paragraph, add one line: "Toolbar button layout, sizes, names and tooltips follow Rule 21 (global-fixes.md)."

## Rule 21 — Toolbar buttons (text to paste into global-fixes.md)
21. **Toolbar buttons.** One shared toolbar component/CSS in the global layer; no page has its own button sizes or order.
 a. **Primary button** = the black filled button (Sync now, Add Staff, Generate, Save...). There is at most one per toolbar. It is always the RIGHT-most button, never with another button to its left in its row.
 b. **Desktop (>640px):** search box, then buttons right-aligned in the same row, primary last. Other buttons are 130px x 38px. Primary is 38px high, width follows its text, min 130px, max 180px.
 c. **Mobile (<=640px), toolbar has a primary AND other buttons:** row 1 search box (full width). Row 2 the primary button alone, right-aligned. Row 3+ the other buttons, 2 per row, each exactly as wide as one filter cell ((100% - 8px) / 2) and 38px high. Then the filter grid.
 d. **Mobile, toolbar has ONLY the primary button (no other buttons):** one row: the search box shrinks and sits on the LEFT, the primary button sits to its RIGHT. Primary width follows its text, min 110px, max 180px; the search box takes the remaining width (min 140px).
 e. **Mobile, toolbar has no primary (only outline buttons):** search row, then the buttons 2 per row as in (c).
 f. **Text:** button labels are never cut randomly or wrapped to a second line: 12.5px, one line, 8px side padding, icon + label. If a label still does not fit, it ends with an ellipsis and the FULL text is in the tooltip. Every button has a tooltip (`title` for mouse plus the shared tooltip directive that also opens on tap/long-press on touch) showing the full label, and a disabled button's tooltip also says why it is disabled ("Select at least one row").
 g. Names follow Rule 15: "Bulk Assign", "Bulk Edit", "Bulk Delete", and also "Bulk Print", "Bulk Enter Marks", "Bulk Generate" (never "... Selected"). A count may follow in brackets, "Bulk Print (3)".
 h. Applies to every page of every module, including modals' footers only for sizes (modal footers keep their own two-button layout).

## Do
1. Build/repair the shared toolbar once (suggested CSS idea: `.toolbar-row1{display:flex;flex-wrap:wrap}`; on mobile the button group uses `display:contents` so search, primary and other buttons can be ordered: search `order:1; flex:1 1 100%`, primary `order:2; margin-left:auto`, others `order:3; flex:0 0 calc((100% - 8px)/2)`; add a modifier set by the component when the primary is the only button, then search `flex:1 1 0` and primary `order:2` stay on one row).
2. Replace every page's own toolbar/button CSS with it. Rename the buttons per (g): "Print Selected (n)", "Bulk Enter Marks (n)", "Generate for Selected" and any other "... Selected" button.
3. Pending from shared-fix3: Approvals has no Stream Group filter. Add it where Approvals has class filters (Class -> Stream -> Stream Group -> Section, all visible, All by default). Where Approvals has no class filters at all, write one line saying why and mark it not applicable.
4. Pending from shared-fix3: Structure, Marksheet Structure, Subject Groups and Leave Assign were only checked for the filter being visible because the test data was empty. Create temporary fixtures (clean up after) and check selecting a value and the parent -> child reset on those four pages.
5. Fill the audit table in Notes: page | buttons before | what was wrong | fixed.

## Tests (essential, one Playwright spec that loops all audited pages)
- 390px, page with primary + others: search row, then the primary alone and right-aligned (no button to its left in that row), then the others 2 per row, each width equal to a filter cell (within 1px), height 38px. No horizontal page overflow.
- 390px, page with only a primary: search left and primary right in the same row, primary width between 110 and 180px.
- 1366px: others 130x38, primary <=180px and right-most, search 340px.
- Text: no button label wraps to 2 lines; any label that is truncated has the full text in its tooltip. Check the longest label ("Bulk Enter Marks (12)") at 390px.
- Build passes. One line per page: PASS/FAIL with the measured numbers. Do not report PASS for a page you did not run.

## Note
The reference html files (`attendance-overview.html`, `roster.html`) were not updated for this mobile toolbar layout. Rule 21 wins over them for the mobile toolbar. Do not change those html files.

## Notes (Claude Code fills the audit table here)

### Audit (2026-10-31) — page | buttons before | what was wrong | fixed
Shared pieces: global `.toolbar-btn-group` rules (Rule 21 desktop + the 640px `display:contents` ordering, `tb-solo` modifier), `ToolbarButtonsDirective` (selector `.toolbar-btn-group`: sets `title` = full label + `data-why` reason when disabled, sets `tb-solo`, tap/long-press bubble), `[szTip]` directive, `.sz-tip` bubble, `.btn-edit-outline`. Every label is `<span class="btn-label">` (12.5px, one line, ellipsis). Measured by `e2e/shared-fix4-toolbar.spec.ts` (36/36 at 1366 and 390).
Common to every row before: 13px labels, bare text labels (no ellipsis possible), primary forced to 130px (not 130-180), on mobile the primary sat in the 2-per-row grid beside other buttons, no tooltips (or a few hand-written `title`s), no disabled reasons.

| Page | Buttons before | What was wrong (beyond the common list) | Fixed |
|---|---|---|---|
| Academic Setup / Classes & Sections | Bulk Delete, Add Class | — | yes |
| Academic Setup / Subjects | Bulk Delete, Add Subject | — | yes |
| Academic Setup / Subject Groups | Bulk Delete, Add Group | — | yes |
| Student / Manage Students | Bulk Delete, Bulk Assign, Excel Import/Export, Create | page CSS forced one nowrap row and shrank the group; `[title]` bindings | page CSS removed; desktop buttons move under the search (do not fit, see Status notes) |
| Student / Admission | Create | — | yes (390: search 206 + Create 110 on one row) |
| Student / Class Promotion | Confirm Promotion | label was bare interpolation | yes (144px) |
| Staff / Manage Staff | Bulk Delete, Bulk Assign, Create | — | yes; desktop buttons under the search (do not fit) |
| Staff / Departments, Designations | Create | — | yes |
| Attendance / Overview | Generate Report, Sync now | own `.sw-gen-btn`/`.sw-report-btn` CSS (sizes, 16-18px padding); Sync now was not `.btn-primary` | `.btn-primary` + `.btn-assign`, page CSS removed |
| Attendance / Manage Shifts | Create Shift | — | yes |
| Attendance / Roster | Bulk Assign, Bulk Edit, Bulk Delete | own `.sw-report-btn`/`.sw-edit-btn` CSS, nowrap override | `.btn-assign`/`.btn-edit-outline`; reasons (past month, rows with/without shift); desktop under the search (do not fit) |
| Leave / Requests | Apply Leave | — | yes |
| Leave / Create | Create | — | yes |
| Leave / Assign | Set Leave Limit | — | yes |
| Holiday / Holidays | Bulk Delete, Generate from Public Holidays, Add Holiday | — | yes (long label ellipsizes, full text in tooltip); desktop under the search (do not fit) |
| Holiday / Templates | Add Template | — | yes |
| Holiday / Assign | Bulk Assign, Bulk Edit | own `.btn-edit-sel` CSS, 767px wrap override | `.btn-edit-outline`, page CSS removed |
| Payroll / Generate Payroll | Generate for Selected | name; own `.btn-gen` CSS | "Bulk Generate", `.btn-assign` (modal title too) |
| Payroll / Salary Groups | Add Salary Group | — | yes (135px) |
| Payroll / Assign Salary | Bulk Assign | — | yes |
| Payroll / Salary Payouts | none | — | n/a |
| Fees / Fees | Generate Report | own `.sw-report-btn` CSS | `.btn-assign`, page CSS removed |
| Fees / Fee Structure, Fee Reminder | Create | — | yes |
| Examination / Admit Card Structure | Create | — | yes |
| Examination / Generate Admit Card | Print Selected (n) | name | "Bulk Print (n)" |
| Examination / Generate Marksheet | Bulk Enter Marks (n), Print Selected (n) | name; `[title]` binding | "Bulk Print (n)"; reasons (one class only / pick a term / select rows) |
| Examination / Marksheet Structure | none | — | n/a |
| Certificates / Generate TC | none | — | n/a |
| Approvals | none | — | n/a (Stream Group filter added, step 3) |
| Settings / Academic Sessions | Create Session | no `.toolbar-row1`; own `.sess-toolbar` alignment | wrapped in `.toolbar-row1`, right-aligned |
| Settings / Roles & Permissions | Bulk Delete | own `.staff-toolbar .toolbar-row1` CSS; confirm modal title "Selected Delete" | page CSS removed; "Bulk Delete" |
| Shared / app-data-toolbar | primary only | bare label | `.btn-label` (only used by the components gallery) |

Step 3 — Approvals Stream Group: done. Approvals has class filters, so Stream Group sits between Stream and Section, "All stream groups" by default, enabled for Student on a class (+stream) that has non-General groups, reset by Applicant/Class/Stream changes, sent as `groupId` (validator + controller pass it to `findPeople`, which already filtered by `groupId`).

Step 4 — reset on the four pages: the earlier skip was the fixture, not the pages — the generic empty body made Admit Card Structure / Marksheet Structure / Leave Assign throw on `summary` (and `my-permissions`) so the cascade never re-rendered. Fixtures (in-memory in the spec, nothing to clean up) now give real shapes. Results: Admit Card Structure 11th → Science → PCM, then 6th → "All streams", "All stream groups": PASS. Marksheet Structure 11th → Science, 6th → "All streams": PASS. Subject Groups same: PASS. Leave Assign (Student) 11th → Science → PCM, 6th → both reset: PASS.

Not matched: at 1366px the 4 pages with 3-4 buttons cannot fit them beside the 340px search (row is 736px), so the buttons take their own right-aligned row under the search (Rule 21b says same row). Reference html files were not changed (as instructed).
