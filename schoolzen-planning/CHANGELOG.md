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

## v1 (new module) — 2026-08-31 (same day)
- NEW MODULE: Fees (4 pages) — Fee Structure, Fees (Collection), Fee
  Statement, Fee Reminder. Class+Stream existence+dependency filter
  pair throughout. Fee Structure's checklist-driven Particulars editor
  (tick to reveal an amount field, live-computed total) mirrors Salary
  Groups' allowance/deduction pattern; its delete is a cascade type-
  to-confirm since it destroys real financial history for every
  student generated from it. Fees page shows "Collect" or a fixed
  "Fee Paid" chip, never both; payment submission leads into a
  professional printable receipt (same letterhead treatment as the
  Admission Letter) with amount-in-words and a signature line. Fee
  Statement is a standalone profile-style page (summary strip +
  particulars + payment history with per-receipt reprint). Fee
  Reminder is a two-step flow — save a filter rule, then always
  review/select the actual matching students (checkbox, pre-checked)
  before sending — never a blind bulk WhatsApp send.

## v1 (fix) — 2026-08-31 (same day)
- Fees module fixes: removed Bulk Collect (wasn't a real requirement).
  Added arrears/carry-forward tracking throughout — Due Fee now
  includes any unpaid previous-year balance with an inline note (e.g.
  "incl. ₹6,500 from 7th"), a fixed-width Status chip ("Fully Paid" /
  "Has Arrears") on both Fees and Fee Statement, a "Collected By"
  column (Fees table and Fee Statement's Payment History, renamed from
  the legacy "Recipient"), and a Due Breakdown block in the Fee
  Payment modal separating current-year vs prior-year amounts before
  collection. Fee Structure's toolbar gained the standard Class+Stream
  filter pair. Fee Statement gained a "Previous Year Dues" table
  (Class/Session/Amount) making exactly which past years are owed
  explicit. Fee Receipt now shows a Previous Year Due line item when
  applicable, in the same amber tone as the arrears chip.

## v1 (fix) — 2026-08-31 (same day)
- Added the summary-strip pattern (pulsing "Live" badge + count pairs,
  same shape/CSS as Attendance Overview's status strip) to the top of
  Fees Collection: Total Collected, Fully Paid, Has Arrears (amber),
  Total Due (red) — same color language as their matching status chip
  and Due Fee column.

## v1 (fix) — 2026-08-31 (same day)
- Fees summary strip: switched to the colored fixed-size short-code
  chip pattern (FP/AR/DU) referenced from Attendance's own status-chip
  design (P/L/HD/A/LV/H), replacing the plain colored-number style.
  Added a "Current Class" tag at the end of the strip, updating live
  with the Class filter ("Class: 8th" / "All Classes") - the strip
  previously had no visible tie to which class its numbers described.

## v1 (fix) — 2026-08-31 (same day)
- Removed the "Live" badge from Fees' summary strip - that pulsing
  indicator means "a punch is happening right now" on Attendance; fee
  collection has no real-time equivalent, so it didn't belong here.
  Total Due is now plain bold red text, not a chip - it's an amount,
  not a categorical state like Fully Paid/Has Arrears, so it shouldn't
  get the same chip treatment. Added Class and Stream columns directly
  to the Fees table (previously only visible via the toolbar filter,
  not in the row itself) - relevant when viewing "All classes" at once.

## v1 (fix) — 2026-08-31 (same day)
- Rebuilt the Fees summary strip to match the Attendance reference's
  exact `summary-strip`/`summary-item`/`status-chip` structure (small
  2-letter colored chip + label + count: FP/AR/UN) instead of the
  previously invented layout. Removed the "Current Class" tag entirely
  - it wasn't part of the reference and duplicated what the toolbar's
  Class filter already shows. Renamed the table's own wide labeled
  status chip (used in the Status column - "Fully Paid"/"Has Arrears")
  to `.row-status-chip` to avoid a CSS class collision with the new
  small strip chips, which both used base class `.status-chip`.

## v1 (fix) — 2026-08-31 (same day)
- Design consistency fix across the whole Fees module, matching the
  Payroll reference's principle exactly: plain amount TEXT stays
  neutral-colored (dark/grey, like the reference's Gross/Deductions/
  Net columns) - color is reserved ONLY for status chips (Fully Paid/
  Has Arrears/Unpaid) and warning-action icons (delete/unlock), never
  for raw numbers. Fixed Paid Fee/Due Fee columns, Fee Statement's
  summary strip values, and the Fee Receipt's Total/Paid/Due lines,
  all of which were incorrectly colored green/red as plain text.

## v1 (fix) — 2026-08-31 (same day)
- Fixed structural placement: the summary-strip was incorrectly nested
  INSIDE sw-card-main (alongside the title/toolbar/table). Per the
  Payroll/Attendance reference, the strip is its own separate white
  card sitting OUTSIDE sw-card-main, directly inside sw-main above it.

## v1 (fix) — 2026-08-31 (same day)
- Unified the two mismatched chip designs into one: merged the small
  2-letter code chip (used in the summary strip) and the wide labeled
  pill (used in the table's Status column) into a single
  `.fee-status-chip` class - full-word label, colored pill, used
  identically in both places (Fully Paid green, Has Arrears amber,
  Unpaid red). No more visual inconsistency between the two locations
  on the same page.

## v1 (fix) — 2026-08-31 (same day)
- Corrected the summary strip design: the Payroll reference's own
  ls-strip never uses chips/pills at all - it's plain bold numbers
  with a text label ("28 locked", "14 pending drafts"). Removed the
  chips I'd incorrectly added to Fees' strip; chips now appear ONLY
  in the table's Status column (.fee-status-chip), matching exactly
  how the reference separates the two: plain counts in the strip,
  colored pills only in the table.

## v1 (major addition) — 2026-09-05
- NEW: Full MongoDB/Mongoose database design for the whole app,
  designed for scale (~2,000 schools, ~2M students) and correctness:
  - `_core/database-architecture.md` — 10 cross-cutting principles
    (multi-tenancy via schoolId-first indexes, session scoping,
    embed-vs-reference rules, indexing strategy, AttendanceRecord's
    one-doc-per-person-per-day design with archival, transactional
    cascade delete, schema+config-driven validation, structured error
    handling, lean/aggregation read-path performance, and Approvals as
    a computed view rather than a duplicated collection).
  - `_schema/*.schema.js` — actual Mongoose models for every module:
    core (School/AcademicSession), academic-setup (Class with embedded
    streams/sections, Subject, SubjectGroup), settings (FieldConfig
    with structured validationRules), student (Student split from
    session-scoped StudentEnrollment), staff (Staff/Department/
    Designation with denormalized name snapshots), attendance (Shift,
    shift assignments, and the high-volume AttendanceRecord with its
    critical unique dedup index), leave (LeaveType/LeaveLimit/
    LeaveRequest), holiday, payroll (SalaryGroup/StaffSalaryAssignment/
    PayrollRun/PayrollPayment), fees (FeeStructure/StudentFeeRecord
    with arrears array/FeePayment/FeeReminderFilter+Log), and
    activity-log (R6 audit trail). Every file's header comment states
    its index list and the UI page it exists to support.

## v1 (reverted) — 2026-09-05
- Removed the database schema work (_schema/*.js, database-architecture.md)
  added earlier this session — premature at this stage. Focus stays on
  UI/UX design; schema design will come later once all module pages
  are finalized.

## v1 (fix) — 2026-09-05
- Fee Statement's "Previous Year Dues" table upgraded from a single
  lump-sum row to a proper year-by-year ledger: Session, Class, Total
  Fee, Paid, Remaining Due, Status - per past session, not just
  whichever year still owes money. Now shows every session the student
  was enrolled in (including fully-cleared ones, marked Fully Paid),
  and correctly supports more than one prior year carrying a balance
  at once, not just "the previous year."

## v1 (fix) — 2026-09-05
- Fee Statement: added a real digital footprint for past sessions.
  Previous Year Dues table gained a "Payments" action (receipt icon)
  per row, opening a Year Payments modal that shows that specific
  session's full installment history (Receipt No., Amount, Payment
  Date, Collected By) - previously past years only showed a lump
  total/paid/due with no way to see WHEN or in HOW MANY installments
  the money actually came in. Every payment row (current year and
  past) now has an explicit "Regenerate / reprint this receipt"
  tooltip on its printer icon, confirming a lost historical receipt
  can be reissued identically to a fresh one.

## v1 (FINAL) — 2026-09-05
- Fee Statement page finalized and locked, including the Previous
  Year Dues ledger (per-session Total/Paid/Remaining/Status) and the
  Year Payments modal (per-installment digital footprint + receipt
  regenerate for any past session). No open items remain on this page.

## v1 (new module) — 2026-09-05
- NEW MODULE: Examination (5 pages) — Marksheet Structure, Marksheet
  Structure Setup, Generate Marksheet, Admit Card Structure, Generate
  Admit Card. Sidebar groups the module into two labeled sub-sections
  (Marksheet / Admit Card). Naming follows Payroll's "Generate X"
  convention. Marksheet Structure uses a 3-state landing page (empty
  hint / existing structure table / template-picker grid) then a
  single-scroll Setup page (subject checkboxes by marks-type group,
  per-term max-marks tabs, co-scholastic grade options, supplementary
  fail-limit) driven entirely by the chosen template. Generate
  Marksheet's per-term status chips and grouped marks-entry modal are
  fully driven by that structure - no hardcoded subject list. Admit
  Card Structure is deliberately simpler (name/dates + a fields-to-
  show checklist, same pattern as Admission Form Fields). Both
  Generate pages produce printable documents using the exact
  letterhead/signature-line language already established for the
  Admission Letter and Fee Receipt, so every printable document in the
  app shares one visual identity.

## v1 (major upgrade) — 2026-09-05
- Upgraded the entire Examination module to the full Payroll/
  Attendance polish level:
  - All 5 pages now carry the profile dropdown (school identity, My
    Profile, Settings, Logout), previously missing entirely.
  - Generate Marksheet and Generate Admit Card rebuilt from plain
    HTML tables into the flex-row pattern (avatar+name, fixed-width
    chips, icon-button actions) used by Generate Payroll - added
    checkbox multi-select feeding a "Print Selected (N)" action
    instead of a blanket "Bulk Print" with no visible scope.
  - Added ls-strip summary cards above the main card on all 4 list/
    config pages (student counts, term entry progress, exams
    configured) - previously only the two Generate pages had any
    context strip, and even those were plain "Bulk Print" buttons
    with no summary at all.
  - Add/Edit Result modal footer now shows a live "N of M fields
    filled" progress note next to the action buttons.

## v1 (exact-match fix) — 2026-09-05
- Corrected precise deviations from the Generate Payroll reference in
  Generate Marksheet and Generate Admit Card: avatar was 36px/11px-
  radius (now exact 38px/12px-radius), ls-badge/ls-dot/pulse-keyframe
  was missing entirely from the summary strip (now present with
  "Session active", matching Payroll's exact badge), the bulk print
  button used a muted .sw-secondary-btn instead of the reference's
  primary gradient .sw-gen-btn (now matches, including its disabled-
  state grey), search box min-width was 140px instead of 160px, and
  an extra unreferenced margin-left:auto on admit-card's button is
  removed. sw-select-pill, sw-thead, sw-row, sw-icon, and sw-footer
  were already exact matches - verified byte-for-byte against the
  reference CSS.

## v1 (new module) — 2026-09-05
- NEW MODULE: Certificates (2 pages) — TC Structure, Generate TC.
  Separate from Examination (exam-linked documents) and Student
  (record-keeping) - holds student-exit administrative documents,
  with room for future certificates (Bonafide, Character) to join
  later. TC Structure is deliberately school-wide, not per-class
  (unlike Marksheet/Admit Card Structure) since a TC's content never
  varies by class - locked "Always Included" fields plus a toggleable
  "Optional Fields" group, and an auto-incrementing serial number.
  Generate TC shows all students by default (Class/Status are
  optional filters, matching Manage Students), uses the exact Payroll
  flex-row table pattern, and its Issue TC modal only captures
  leaving-specific facts (reason, conduct, dues cleared) - Attendance
  % is pulled read-only from the real Attendance record rather than
  re-typed. The printable TC reuses the app's established letterhead
  language with three signature lines (Class Teacher/Accountant/
  Principal).

## v1 (new page + full README update) — 2026-09-05
- NEW: Student / Class Promotion — year-end bulk Promote/Detain
  decision per student, with a bulk "Promote to" target-class
  selector (per-student override still available), Exam Result chip
  (Pass/Fail/Not Set, read from Generate Marksheet when available),
  and a Confirm Promotion modal that states plainly it CREATES next-
  session placements without touching current records, names the
  exact Promoting/Detaining/Not-decided counts, and labels its submit
  button with the exact count being acted on.
- README fully updated: module map now includes Examination (5
  pages) and Certificates (2 pages), Student now lists Class
  Promotion, build order updated to include both new modules, and two
  new locked global rules documented (shared printable-document
  letterhead language; list pages default to showing everything
  unless a page explicitly documents a scope requirement).

## v1 (fix) — 2026-09-05
- Class Promotion's Confirm modal now explicitly lists the full
  cascade that promotion triggers, not just the class-field change:
  new enrollment created for next session; unpaid fee balance carries
  forward as an arrear (the actual mechanism behind Fee Statement's
  Previous Year Dues ledger); Roll Number cleared (reassigned fresh in
  the new class, not carried over); Leave balances reset per the new
  session's own limits; a Stream+Subject Group gate for students
  moving into 11th/12th; and a Fee Structure existence check for the
  target class+session. The two gap-warnings (stream/subject-group
  missing, fee structure missing) use the amber "needs attention, not
  blocking" tone - a school can still confirm and fix them after, but
  the gap is surfaced rather than silently created.

## v1 — DESIGN PACKAGE MARKED FINAL — 2026-09-05
- All 12 modules (Academic Setup, Student, Staff, Attendance, Leave,
  Holiday, Payroll, Fees, Examination, Certificates, Approvals,
  Settings) and their 34 pages are now locked and marked FINAL in
  every .md file's status line.
- NEW: `_core/claude-code-implementation-strategy.md` — the handoff
  guide for actually building this against the legacy MEAN codebase.
  Recommends MODULE-WISE build order (not phase-wise: backend-then-
  frontend-then-test-everything risks nothing being verifiable until
  the very end, across 12 modules that's too much to untangle at
  once). States the exact dependency-based build order (Academic
  Setup first since nearly everything filters against it, Settings
  last since it modifies an already-stable Student module, Approvals
  only after Leave exists since it's a computed view over it).
  Defines the isolation rules for not breaking the live legacy app:
  new collections/routes only (never modify legacy schema/routes
  in-place until an explicit, separately-reviewed migration step),
  feature-flagged /v2/ routes running alongside legacy ones until each
  module is verified, one module per Claude Code session/branch (never
  "build everything" in one pass), and the shared component library
  built once early and treated as a versioned dependency every module
  consumes rather than reimplementing. Includes a per-module 8-step
  checklist (read .md → build schema/API → build frontend against
  the .html reference pixel-for-pixel → feature-flag → verify → 
  regression-check dependencies → cut over → move to next module).
- README updated: banner marks the whole package FINAL and points to
  the new implementation strategy doc before any code is written.

## v1 (major addition) — 2026-09-05
- NEW: Centralized error handling architecture, backend and frontend,
  designed for scale (millions of users, more modules later):
  `_core/error-handling/README.md` explains the design (category-wise
  organization, not module-wise — HTTP status codes and UI treatment
  are category-driven, so a new module never needs new error-handling
  code, it just tags its own `module` string on the existing 8
  categories), the chosen packages (express-async-errors, winston,
  @sentry/node on the backend; a single HttpInterceptor,
  @sentry/angular, Angular's ErrorHandler, MatSnackBar on the
  frontend), the correlation-ID design tying frontend/backend/logs
  together, the one-shape API error response contract, and
  scalability notes (Sentry sampling by category, structured JSON
  logs, the isOperational flag distinguishing expected failures from
  real bugs).
  Actual code included: `backend/errors/` (AppError base class plus
  ValidationError, NotFoundError, ConflictError — with a
  fromMongoDuplicateKey helper that turns a raw Mongo 11000 into a
  friendly message automatically — AuthenticationError,
  PermissionError, RateLimitError, ExternalServiceError, InternalError,
  and a barrel index.js), `backend/middleware/` (requestId.js,
  errorHandler.js — the single Express error middleware, wired via
  express-async-errors so no route needs try/catch), `backend/utils/
  logger.js` (Winston setup), and an example-route-usage.js showing
  the pattern in practice. Frontend: `frontend/api-error.model.ts`
  (the shared TypeScript contract), `error.interceptor.ts` (the single
  HttpInterceptor, category-to-UI-treatment switch), `global-error-
  handler.ts` (catches uncaught runtime errors separately from HTTP
  errors), and example-component-usage.ts showing how a form component
  maps ValidationError.fields onto inline field errors.

## v1 (new page) — 2026-09-05
- NEW: Settings / Academic Sessions — manages the multi-year session
  lifecycle every page's header selector depends on. Exactly one
  session is Active per school at a time; every new record anywhere
  in the app saves against the Active session regardless of which one
  the header is currently showing (viewing a Closed session is
  read-only browsing, never a write-context switch - all create/edit/
  delete is disabled while viewing a non-Active session). Table shows
  Active/Upcoming/Closed status with the right actions per state
  (Upcoming gets Set-as-Active + Delete; Closed gets a read-only View;
  Active gets no action - you activate a different session instead,
  which closes it as a side effect). Create Session offers an optional
  "Copy Forward" checklist (Fee Structure, Marksheet/Admit Card
  Structure, Salary Groups, Holiday Templates) that copies
  CONFIGURATION only, explicitly never student placements or financial
  records - a new session is always created as Upcoming, never
  directly Active. Set as Active is the one type-to-confirm action on
  this page (heavier than the app's usual single-confirm) since its
  blast radius is the whole school, every user, immediately. Documents
  the recommended operational order with Class Promotion: create
  session → promote students into it → verify configs → set Active.
  Cross-referenced from Class Promotion's own doc. Added "Academic
  Sessions" to the Settings sidebar on both pages for consistency.

## v1 (new page + new doc) — 2026-09-05
- NEW: Settings / Roles & Permissions — implements R3's permission
  system as an actual admin UI. Role tab strip (Super Admin locked/
  uneditable; Class Teacher and similar roles marked scoped) + a
  module×action checkbox matrix (View/Create/Edit/Delete/Approve,
  with a dash where an action doesn't apply to a module). Scoped
  permissions show a clickable "Scoped" tag opening a Class+Section
  picker per R3's specific rule (Class Teacher = scoped to a Class+
  Section, one teacher can hold several such scopes). Create Role
  asks for scope mode (whole-school vs. scoped) up front. Linked
  consistently into all three Settings pages' sidebars.
- NEW: `_core/additional-technical-considerations.md` — cross-cutting
  concerns beyond module pages and error-handling: Cloudinary file
  storage convention (existing, documented for completeness), a
  proposed unified Notifications service (category-tagged like
  errors, in-app bell + WhatsApp/SMS/Email channels), i18n readiness
  (all current UI text is hardcoded English, needs @angular/localize
  or ngx-translate before scaling beyond English-medium schools),
  print-CSS vs. server-generated PDF for official documents
  (Marksheet/TC), standardized file upload handling, cursor-based
  pagination, skeleton loading states, dark mode readiness (CSS
  custom-properties refactor, not a per-page redesign), a background
  job queue (bullmq/Redis) for slow bulk operations (Excel import,
  WhatsApp sends, bulk PDF generation) that shouldn't block requests,
  rate limiting (express-rate-limit with a Redis store for multi-
  instance deployments), environment configuration practices, a
  health-check endpoint, a Redis caching layer for slow-changing
  config data, and a note on migrating Student search to Elasticsearch/
  Atlas Search if MongoDB text search doesn't scale to the ~2M-student
  target. Backup/disaster-recovery explicitly deferred per instruction.

## v1 (fix) — 2026-09-05
- Search-at-scale recommendation changed from Elasticsearch to MongoDB
  Atlas Search - Atlas Search runs inside the existing Atlas cluster
  with no separate infrastructure to provision or pay for, whereas
  Elasticsearch requires its own hosted cluster and adds real ongoing
  infra cost. Elasticsearch is now only mentioned as a last resort if
  Atlas Search genuinely can't meet a specific need.

## v1 (fix) — 2026-09-05
- Removed Dark Mode section from additional-technical-considerations.md per instruction - out of scope.

## v1 (new module) — 2026-09-05
- NEW: Dashboard — the home landing page after login, previously
  entirely missing from this package. Replaces the legacy 4-card
  layout (Students/Teachers/WhatsApp Messages/Marksheets on bespoke
  gradient-card CSS) with real cross-module metrics on the
  established stat-card/panel system: Students (+ admitted this
  month), Staff (Teaching/Admin split), Fees Collected (+ arrears-
  aware Due total), Attendance Today (% + absent/late) - every card
  links through to its source module. Added an Attendance Trend
  7-day bar panel and a Fee Collection Status donut, both lightweight
  CSS visualizations appropriate for a glanceable dashboard rather
  than a full charting library. Added a CALENDAR WIDGET (explicit
  requirement) with today's date rendered in the same purple gradient
  used for primary actions app-wide, holiday dots pulled from the
  Holiday module, and month navigation matching the existing month-
  picker convention. Added Upcoming Holidays and Pending Approvals
  panels, both linking to their full modules rather than duplicating
  them. Build order updated: Dashboard is built genuinely last, since
  it has no data of its own and is only meaningfully testable once
  the modules it aggregates are real.

## v1 (redesign) — 2026-09-05
- Dashboard rebuilt from scratch (v2): the first draft's flat 4-cards-
  then-panels layout read too similar to the legacy page's own
  structure. New design: a full-width gradient hero banner (name/date/
  school + four headline stats as translucent chips) replacing the
  plain white welcome row, followed by an ASYMMETRIC bento grid (8/4,
  5/7, full-width rows) instead of a uniform grid - larger 20px card
  radius throughout. Attendance overview now nests three color-coded
  mini-stat tiles above the 7-day trend inside one richer card.
  Pending Approvals and Upcoming Holidays merged into one card (both
  are "needs attention soon" lists). Added a new Quick Actions row
  (New Admission, Collect Fee, Apply Leave, Issue TC, Generate
  Marksheet) making the dashboard a genuine action starting point, not
  only a summary screen. Calendar's today-highlight and holiday-dot
  behavior is unchanged from the first draft - only the surrounding
  visual language was revised.

## v1 (redesign) — 2026-09-05
- Dashboard hero redesigned again (v3): the gradient banner from v2
  was a generic, overused SaaS trope and mismatched the app's own
  established look (no other page anywhere in this package uses a
  full-bleed color background - every surface is a white card, purple
  is reserved for buttons/active-nav/chips). Rebuilt as a white card:
  distinctiveness now comes from a bold gradient date-badge (day+month,
  reinforcing "today" before the calendar tile loads), soft blurred
  pastel blob shapes as quiet background texture, and clean right-
  aligned stat pairs instead of translucent glass chips on color. Rest
  of the bento grid (Attendance/Calendar/Fees/Approvals/Quick Actions)
  unchanged from v2.

## v1 (FINAL) — 2026-09-05
- Dashboard locked at v5 after iterating through several approaches:
  a plain-4-cards first draft, a gradient-hero banner (rejected as a
  generic overused SaaS trope mismatching the app's own all-white-card
  look), a fully component-reused version with no hero at all, and
  finally this version merging both — a white-card hero (gradient date
  badge + welcome text + right-aligned stat pairs + soft pastel blob
  decoration, no chips, no duplicate summary strip) on top of a body
  built entirely from already-established components (ls-strip's
  sibling `layout-row` two-column structure, `sw-card-main` cards,
  the same calendar/approval-row/status-chip patterns used elsewhere).
  dashboard.md documents the full design history so the reasoning
  behind the final shape isn't lost.
- Package marked FINAL and repackaged in full - this is the complete,
  locked design reference across all 13 modules (12 module folders +
  Dashboard), 35 pages, the _core design system + implementation
  strategy + error-handling architecture + additional technical
  considerations.
