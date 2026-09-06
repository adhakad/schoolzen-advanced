# Schoolzen — UI/UX Planning Package

**Status: FINAL.** All 12 modules below are locked and approved.
Before writing any code, read
`v1/_core/claude-code-implementation-strategy.md` — it explains the
module-wise build order and the rules for not breaking the existing
legacy app while implementing this.

Complete, approved design reference for Schoolzen ERP's rebuilt UI —
Angular 14 + Express/MongoDB, MEAN stack. Every page here is a
pixel-accurate HTML/CSS reference (Tabler Icons, no framework) with a
matching `.md` file explaining every design decision. Give both to
Claude Code as-is when implementing.

## How to use this package

1. Start with `v1/_core/refactor-plan-and-design-system.md` — every
   global rule (filters, modals, delete/cascade, tables, chips) is
   locked there. Every module below follows it.
2. Open a module folder. Each page has:
   - `<page>.html` — exact approved render, drop into a browser to see it
   - `<page>.md` — what it does and why, for implementation
3. Build in this order (matches dependency): Academic Setup → Student
   → Staff → Attendance → Leave → Holiday → Payroll → Fees →
   Examination → Certificates → Approvals → Settings → Dashboard
   (built last since it only aggregates data every other module
   already produces).

## Module map — all FINAL

| Module | Pages | Purpose |
|---|---|---|
| **Dashboard** | Dashboard | Home landing page — white-card hero with today's date badge, attendance/fee panels built from reused components, a calendar with today highlighted, upcoming holidays, pending approvals, quick actions |
| **Academic Setup** | Classes & Sections, Subjects, Subject Groups | School's academic structure — source data for every Class/Section/Stream/Subject filter app-wide |
| **Student** | Manage Students, Admission, Class Promotion | Student records — intake, ongoing management, year-end class promotion |
| **Staff** | Manage Staff, Departments, Designations | Staff records and org structure |
| **Attendance** | Overview, Manage Shifts, Roster | Biometric attendance, shift definitions, shift assignment |
| **Leave** | Requests, Leave Create, Leave Assign | Leave application/approval, leave-type config, per-person limits |
| **Holiday** | Holidays, Templates, Assign | Holiday calendar, reusable templates, per-person/class assignment |
| **Payroll** | Generate Payroll, Salary Payouts, Salary Groups, Assign Salary | Monthly payroll run, payment history, pay-band config, per-staff assignment |
| **Fees** | Fees, Fee Structure, Fee Statement, Fee Reminder | Fee collection (incl. arrears), annual fee config, per-student history, WhatsApp reminders |
| **Examination** | Marksheet Structure, Marksheet Structure Setup, Generate Marksheet, Admit Card Structure, Generate Admit Card | Exam-linked printable documents — subject/marks/grading config and result entry, admit card config and issuance |
| **Certificates** | TC Structure, Generate TC | Student-exit administrative documents (Transfer Certificate; room for Bonafide/Character certificates later) |
| **Approvals** | Requests | Cross-module unified approval inbox |
| **Settings** | Academic Sessions, Admission Form Fields, Roles & Permissions | Multi-year session lifecycle; dynamic field/validation config for Student forms; role-based permission matrix (R3) |

## Locked global rules (see `_core` for full detail)

- Filter order: Search → scope filters → status filters → period picker (last)
- Department/Designation/Class: disable via `classList`, never hide
- Stream/Section: exist only if configured, hide via `display:none`
- All modals: sticky header/footer, scrollable middle
- Cascade delete: always allowed, type-to-confirm when dependents exist
- Status chips: fixed-width, full-word label, colored pill — one
  design used everywhere a status is shown (list-page "quick stat"
  strips stay plain bold text, chips belong only where an actual
  per-row/per-field status is being shown)
- Every printable document (Admission Letter, Fee Receipt, Admit
  Card, Marksheet, Transfer Certificate) shares one letterhead
  language: bordered frame, serif school name, dotted-underline field
  values, signature lines
- List pages default to showing everything (filters narrow, they
  don't gate) unless a page explicitly documents a scope requirement
  (e.g. Excel Import/Export needing a chosen class)

## Files

- `prompts/` — one ready-made Claude Code prompt per PAGE, grouped
  into a folder per module (e.g. `prompts/07-payroll/01-generate-
  payroll.md`) — see `prompts/README.md` for single-line usage and
  the strict build order
- `v1/_core/` — design system reference (read first), plus
  `shell/app-shell.html` (the definitive, responsive, role-aware
  header+sidebar every page renders inside — read this before
  building any page's navigation),
  `claude-code-implementation-strategy.md` for how to actually build
  this against the legacy codebase without breaking it,
  `frontend-backend-folder-structure.md` for how the generated code
  should be organized on disk (module-first, page-subfolders inside),
  `error-handling/` for the centralized backend+frontend error
  handling architecture, and `additional-technical-considerations.md`
  for cross-cutting concerns (notifications, i18n, print/PDF, file
  upload, pagination, job queue, rate limiting, caching, search)
- `v1/<module>/` — one folder per module, as mapped above
- `CHANGELOG.md` — full history of every revision made during design review
