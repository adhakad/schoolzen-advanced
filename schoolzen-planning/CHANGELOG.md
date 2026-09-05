# Changelog

## v1 — 2026-08-31

**Core** (`v1/_core/`):
- Initial refactor plan: R1 (Staff/Teacher unification) through R7
  (academic session scoping), sequenced R1→R2→R3→R7→R4→R5→R6.
- Design system finalized: Schoolzen-branded header with profile-dropdown
  school identity, solid-fill active-parent sidebar with connector-line
  sub-items, summary-strip pattern, toolbar (search grows + fixed filter
  pills + primary action), scrollable checkbox-table with fixed-width
  status chips and consistent icon-action states.
- Reusable shared-component architecture specified (page-shell, summary-
  strip, data-toolbar, status-chip, row-avatar, icon-action, confirm-
  modal, data-table, back-link) with scalability/performance/bug-
  prevention quality bar.

**Attendance / Overview** (`v1/attendance/overview.md`):
- Simplified person-type filter (Staff/Student — Teacher merged into
  Staff), mutual-exclusion filter disabling (Department vs Class),
  single-source top summary strip (no duplicated counts elsewhere),
  today-anchored horizontal scroll with day-name+date headers, subtle
  today-column tint (no borders), pending-punch pulse indicator distinct
  from settled status chips, split Staff/Student recent-arrivals panel
  with click-to-reveal ID info (Staff ID / Roll No).

**Payroll / Generate payroll** (`v1/payroll/generate-payroll.md`):
- This page is the REFERENCE implementation the shared component
  library was extracted from. Three-state row pattern (Pending→
  Generate, Draft→Regenerate+Lock, Locked→View+Unlock behind
  confirmation), neutral (not red) deduction-amount color, fixed-width
  action column, two-layer table-overflow scroll handling.

## v1 (update) — 2026-08-31 (same day)
- Added global toolbar rules to _core: Department filter mandatory
  wherever a Staff-type filter exists; search box mandatory on every
  list page; fixed filter order (Search -> scope filters -> status/mode
  filters -> combined Month+Year period picker, always last).
- New page: Payroll / Salary Payouts (renamed from legacy "Payment
  History" - avoids the customer-payment connotation of "Payment").
  Top summary strip, collapsible info-icon for explanatory notes
  (replaces permanent paragraph blocks), per-instalment confirmation
  chips, Record Payment vs View Slip action states, reused Record
  Payment modal and Salary Slip modal logic from the original component.

## v1 (update) — 2026-08-31 (same day)
- Added global rule to _core: any modal with potentially long/growing
  content (repeatable rows, long lists) uses sticky header+footer,
  only the middle content scrolls.
- New page: Payroll / Salary Groups. Search+Add toolbar (no staff-type
  filter, so no Department filter needed here), inline
  allowance/deduction row editor within the Add/Edit modal, Delete
  confirmation with the "inactive instead of delete" business rule.

## v1 (update) — 2026-08-31 (same day)
- Added global rule to _core: Designation filter alongside Department
  wherever staff are bulk-selected for something pay-band-sensitive
  (mutual-dependency with Department, not mutual-exclusion).
- New page: Payroll / Assign Salary. No person-type filter (Teacher
  merged into Staff). Department+Designation filters for precise
  pay-band selection, bulk vs single assignment with collapsed-by-
  default override section (Basic/HRA + inline allowance/deduction
  rows), link-out empty state when no salary groups exist yet.

## v1 (update) — 2026-08-31 (same day)
- Added global rules to _core: legend built only from currently-visible
  data (not full settings list), person-type dropdown (not tabs) for
  pages with structurally different sub-views, type-to-confirm pattern
  for bulk-destructive actions (with ActivityLog logging per R6).
- New page: Attendance / Manage Shifts. "Staff Only" (not "Staff/
  Teacher Only"), grouped modal sections (Punch-In Settings vs Staff
  Only), 11-column table with standard horizontal scroll.
- New page: Attendance / Roster. Person-type dropdown (Staff grid vs
  Student class-list, including 11th/12th stream sub-rows), legend
  strip showing only assigned shifts, dual bulk actions (Assign to
  Selected / Delete Selected) with the new type-to-confirm delete flow.

## v1 (update) — 2026-08-31 (same day)
- Superseded the earlier "block delete if in use" rule with a final
  cascade-delete rule: deleting a main record with dependents is always
  allowed, requires type-to-confirm naming the cascade scope, and is
  logged to ActivityLog. "Set Inactive" remains an offered alternative,
  never the only option. Salary Groups' delete flow updated to match.
- Added soft-delete-with-grace-period rule for sensitive/already-
  happened data (attendance, payroll, payments) — recoverable for a
  set window, with per-item restore blocked if the same scope was
  since re-created (avoids duplicate/conflicting records).
- Added a global tone rule for all warning/confirmation copy: calm and
  informative, one clear consequence sentence, never stacked alarming
  language — the type-to-confirm step is what prevents mistakes, not
  a scarier message.

## v1 (update) — 2026-08-31 (same day)
- Global filter rules finalized and applied everywhere: Designation
  filter now sits next to Department on EVERY page that has Department
  (not just pay-band-sensitive ones), Stream filter now sits next to
  Class wherever 11th/12th appear, disabled-not-hidden confirmed as the
  universal rule, and dependent filter pairs must always be adjacent
  in the toolbar (never separated by an unrelated filter).
- Updated to match: Attendance/Overview (added Designation+Stream),
  Payroll/Salary Payouts (added Designation), Attendance/Roster (added
  Designation) — both .md specs and .html references updated.

## v1 (update) — 2026-08-31 (same day)
- Added Section filter (alongside Class, everywhere Class exists) as a
  global rule, with Class -> Stream -> Section ordering for 11th/12th.
- Clarified two-stage visibility for Section/Stream filters: (1)
  existence — don't render at all if the school hasn't created any
  Section/Stream; (2) mutual-dependency — once they exist, render
  disabled until the parent Class is selected.
- Noted Class Teacher as a Class+Section-scoped role for R3's
  permission system to account for, and flagged a not-yet-designed
  Class/Section management screen (near Admissions/Settings).

## v1 (update) — 2026-08-31 (same day)
- Implemented Section filter (existence-check + parent-dependency) in
  Attendance/Overview's HTML reference and .md spec — demonstrates both
  rules live: a class with sections shows Section immediately enabled;
  a class with none configured shows no Section filter at all; 11th/
  12th show Stream first, then Section once a stream with sections is
  picked.

## v1 (update) — 2026-08-31 (same day)
- Fixed: added the mandatory Department + Designation filters (adjacent
  pair, Designation disabled until Department chosen) to Payroll /
  Generate Payroll — the one page in the Payroll module that had been
  missed when this global rule was first applied elsewhere.
- Payroll module plan is now fully consistent across all 4 pages
  (Generate Payroll, Salary Payouts, Salary Groups, Assign Salary).

## v1 (update) — 2026-08-31 (same day) — FINAL PASS
- Verified Section/Stream applicability across all Payroll and
  Attendance pages: Payroll has no Class/Student filters at all (staff-
  only module, correct as-is). Attendance/Overview already had
  Section+Stream implemented. Attendance/Manage Shifts has no Class
  filter (correct — shifts aren't class-scoped). Only Attendance/Roster
  was missing Section — fixed: Student view's class-list rows now show
  Section as a further existence-based indent level, both directly
  under a class (e.g. 6th -> Section A/B) and under a stream (e.g.
  11th -> Science -> Section A/B), while classes/streams with no
  sections created stay flat, single, directly-assignable rows.
- This closes out the Section/Stream/Designation global-filter rollout
  across the entire Payroll and Attendance modules.

## v1 (new module) — 2026-08-31 (same day)
- NEW MODULE: Leave (3 pages) — Requests, Leave Create (renamed from
  "Leave Type"), Leave Assign (renamed from "Leave Limit"). Both Staff
  and Student can request leave. Full Department+Designation /
  Class+Section filter treatment applied consistently with Payroll and
  Attendance. Approve/Reject/Cancel/Delete are four distinct actions,
  never merged. "Apply Leave" / "Create" / "Set Leave Limit" buttons
  all sit inside their toolbar row, never in a separate header row.
- NEW MODULE: Approval Requests — a separate, top-level, cross-module
  unified inbox (not nested under Leave), deliberately minimal
  (Search + Type + Status only). Approving/rejecting here is identical
  to doing so on the request's home module page.

## v1 (new module) — 2026-08-31 (same day)
- NEW MODULE: Holiday (3 pages) — split from the legacy 3-tab single
  component into 3 SEPARATE pages (Holidays, Templates, Assign),
  matching the app-wide sidebar-sub-item convention (Payroll, Leave).
  Full Department+Designation / Class+Section filter treatment on
  Assign. Live-assignment edits gated behind an explicit confirm
  checkbox before the change controls activate. Cascade-delete rule
  applied to both Holidays-in-templates and Templates-with-assignees.

## v1 (fix) — 2026-08-31 (same day)
- FIXED inconsistency: .sw-select-pill width varied across files
  (120px-150px depending on which page it was built on). Standardized
  to 128px everywhere and locked it as a fixed dimension in the core
  design system doc so it can't drift again.

## v1 (fix) — 2026-08-31 (same day)
- FIXED real bug: Leave Assign, Leave Requests, and Holiday Assign used
  display:none/flex to hide Department+Designation when switching
  person-type to Student, instead of the established disabled-not-
  hidden pattern (classList toggle). This caused Designation to
  disappear permanently after switching Student->Staff, since the
  Staff branch never restored its display. Fixed all three files to
  match the correct pattern (same as Attendance/Overview and Roster):
  Department/Designation/Class always visible, toggled via
  classList.add/remove('disabled') only; display:none/flex reserved
  exclusively for Section/Stream's existence-based show/hide. Locked
  this distinction explicitly in the core design system doc so it
  can't be reintroduced.

## v1 (new module) — 2026-08-31 (same day)
- NEW MODULE: Staff (3 pages) — Manage Staff (Add/Edit/Delete on one page,
  plus Assign Card / Bulk Assign Cards / Resync-to-Device as distinct
  actions), Departments, Designations. Department+Designation filter
  pair on Manage Staff; Department filter added to Designations (not in
  the legacy component) since these two pages are the actual source
  data behind every other module's Department/Designation filters.
  Cascade-delete rule applies throughout; Manage Staff's delete goes
  through the soft-delete-with-grace-period flow since staff records
  carry already-happened attendance/payroll/leave history.

## v1 (fix) — 2026-08-31 (same day)
- Renamed Staff module's "Directory" page to "Manage Staff" (common
  ERP naming convention) - file renamed to manage-staff.md/.html,
  sidebar labels and titles updated across all 3 Staff module pages.

## v1 (new module) — 2026-08-31 (same day)
- NEW MODULE: Student (2 pages designed - Manage Students, Admission;
  Classes & Sections is pre-existing, not (re)designed here). Manage
  Students follows the Manage Staff pattern (Add/Edit/Delete on one
  page) with circular avatars distinguishing student rows from staff's
  rounded-square avatars, photo upload in the form, and Admission No.
  shown read-only (flows from Admission, not typed here). Admission is
  a separate intake workflow with a document-checklist upload group
  and two distinct footer actions (Save as Draft vs Confirm Admission
  — the latter generates the Admission Number and the live student
  record that Manage Students then lists).

## v1 (rebuild) — 2026-08-31 (same day)
- REBUILT Student/Admission and Student/Manage Students to match the
  full field set from the actual legacy components (previous versions
  were simplified placeholders). Admission Info/Student Info/Parents
  Info three-group structure in both create/edit forms. Admission
  page: Class/Stream/Admission No./Roll No. are editable (still an
  application); added a read-only View modal and a letterhead-styled
  printable Admission Letter modal. Manage Students page: those same
  fields become READ-ONLY (already-admitted student), added Date of
  Admission/First Enrolled Class instead; Class+Stream gates Search/
  Excel Import-Export/Create (disabled + empty-state hint until
  chosen); Delete uses the cascade type-to-confirm pattern naming real
  dependent data (login, fees, admit cards, results); Assign Card/Bulk
  Assign Cards match Staff's pattern but keyed by Admission Number.

## v1 (fix) — 2026-08-31 (same day)
- Reverted Student/Admission and Student/Manage Students modal layouts
  from the dense two-column grid back to the original clean m-row
  (paired-field) stacked layout used across every other module - all
  the added fields, filters, buttons, View/Letter modals, gating, and
  cascade-delete logic from the fuller reference are kept, just laid
  out consistently with the rest of the app instead of a one-off dense
  grid.

## v1 (fix) — 2026-08-31 (same day)
- Fixed inconsistencies in Student module: modal-box width standardized
  to 460px (was 500px, off from Staff/Payroll's established 440-460px);
  added missing Status chip CSS to Manage Students; added missing
  Section filter (Manage Students had only Class+Stream, no Section at
  all) with correct two-stage existence-check + parent-dependency logic
  (disabled until parent chosen, hidden entirely if the school never
  configured sections for that class/stream); added Class + Status
  filters to Admission's toolbar (was Search-only).

## v1 (rebuild) — 2026-08-31 (same day)
- Rebuilt Student/Manage Students and Student/Admission: both now show
  ALL records by default (Class/Stream/Section and Class/Status are
  optional narrowing filters, not a mandatory gate) - only Excel
  Import/Export stays scope-gated since a bulk file operation needs a
  defined scope. Added checkbox multi-select with bulk action bars
  (Manage Students: Assign Card to Selected / Delete Selected;
  Admission: Print Letters) alongside the existing one-row-at-a-time
  actions. Redesigned both View modals as professional profile-style
  layouts (photo/avatar header, labeled two-column sections). Fully
  redesigned the Admission Letter as a genuine formal certificate
  document: double-border frame, serif letterhead, dotted-underline
  field values, highlighted fee-paid band, proper signature lines.

## v1 (new module) — 2026-08-31 (same day)
- NEW MODULE: Academic Setup (3 pages) — Classes & Sections, Subjects,
  Subject Groups. Separate from Student (which is for actual student
  records) - this is the config/master-data source behind every
  Class/Section/Stream filter used across the whole app. Classes &
  Sections uses fixed-width count pills (not inline tags) for
  Streams/Sections so 2 vs 10 streams render identically, with a
  click-to-reveal popover; the stream toggle in its Add/Edit modal
  restructures the whole sections area (flat sections vs per-stream
  independent section lists). Subjects is a flat Core/Elective master
  list. Subject Groups bundles subjects into named combinations
  (Class+Stream dependency-gated filters), pulling its checklist live
  from the Subjects master list.

## v1 (new page) — 2026-08-31 (same day)
- NEW: Settings / Admission Form Fields — a single source of truth
  controlling which fields exist across the entire Student module
  (Admission form, Manage Students form, table columns on both, and
  Excel Import/Export columns). Locked "Always Required" group (Name/
  Class/DOB/Gender) can't be hidden; every other field gets an
  independent Show/Hide switch + Required checkbox. Includes "Add
  Custom Field" for school-specific fields. Cross-referenced from
  both Student/Admission.md and Student/Manage Students.md.

## v1 (fix) — 2026-08-31 (same day)
- Extended Settings/Admission Form Fields: each field now shows its
  validation rule inline (e.g. "Aadhar: exactly 12 digits") in the
  settings list itself, and this same rule drives BOTH the form's
  inline error messages AND Excel import's row-level rejection reasons
  - never separately configured per surface. Added an "Add Custom
  Field" modal (Field Label, Field Type, and an inline validation-rule
  input for Text/Number types) so school-specific fields get the same
  validation treatment as built-in ones.

## v1 (fix) — 2026-08-31 (same day)
- Extended field validation to support MULTIPLE stacked rules per
  field (e.g. Aadhar: 12 digits AND numeric-only AND unique; Parents
  Contact: 10 digits AND starts with 6/7/8/9 AND not all identical) -
  Add Custom Field's validation area now supports "+ Add another rule"
  to stack several checks. Added best-practice rules beyond simple
  format checks: uniqueness (Aadhar, Admission No. school-wide, Roll
  No. within class+section), date sanity (DOB can't be future/
  implausible for the class), and non-negative numeric (Family Annual
  Income). DOB/Admission No./Roll No. are always-on locked rules, same
  treatment as the "Always Required" field group. Form shows the first
  failing rule at a time; Excel import reports which specific rule a
  row failed.

## v1 (fix) — 2026-08-31 (same day)
- Fixed: validation rules section now shows for EVERY field type (Date,
  Dropdown, Phone Number), not only Text/Number - each type gets a
  type-appropriate placeholder and hint. Added a settings/edit icon to
  every existing configurable field row, opening the same Add/Edit
  Field modal pre-filled with that field's current label, type, rules,
  and Required state, plus a "Remove Field" option (edit mode only) -
  built-in fields are now just as editable as newly-added custom ones.

## v1 (fix) — 2026-08-31 (same day)
- FIXED a real implementability gap: validation rules were free-text
  ("must be unique" typed as a sentence) which a system genuinely
  cannot parse or enforce. Replaced with a STRUCTURED rule builder: a
  dropdown of known rule types (Exact/Min/Max length, Numeric/Letters
  only, Starts/Not-starts-with, Min/Max value, Must be unique, Cannot
  be future date, Digits not all identical) - rules needing a
  parameter show a value box, self-contained ones don't. This is what
  makes stacked rules (e.g. Aadhar: length 12 + numeric-only + unique)
  actually enforceable by the system, not just descriptive text.

## v1 (fix) — 2026-08-31 (same day)
- Fixed: locked fields (Date of Birth, Admission Number, Roll Number)
  were missing the settings/edit icon entirely - a school had no way
  to adjust their validation rules even though the fields themselves
  must stay shown+required. Added the edit icon to these rows; opening
  it now disables only the Label and Required controls (and hides
  Remove Field) while leaving Validation Rules fully editable -
  "locked" means the field can't be hidden/made-optional/removed, not
  that its format checks are frozen.

## v1 (fix) — 2026-08-31 (same day)
- Split the combined "Name, Class, Date of Birth, Gender" row into 4
  separate rows, each with its own settings icon. Each carries ONE
  non-removable default rule (Name: must be text; Class: must match
  Academic Setup; DOB: cannot be future date; Gender: Male/Female/
  Other) rendered as a fixed row with no delete button in the Edit
  Field modal, but "+ Add another rule" is still available below it -
  a school can layer extra checks (e.g. Name: max 50 characters) on
  top of the fixed default. Removed the now-duplicate DOB row that
  previously also appeared under Student Info.
