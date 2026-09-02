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
