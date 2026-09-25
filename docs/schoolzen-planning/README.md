# Schoolzen — UI/UX Planning Package

**Status: FINAL.** All 13 modules (38 pages) below are locked and approved. This package was rebuilt from scratch from the final design set — every `.html` is the exact approved reference, every `.md` was written by reading that exact file (not guessed or carried over from an older draft).

## How to use this package

1. Read `v1/_core/design-system.md` once — the one, final design system every page follows.
2. Pick a module from the table below, in dependency order.
3. Run its prompt: `claude "$(cat prompts/<module>.md)"` — each prompt covers that module's schema, API, and frontend as one piece of work, and tells Claude Code which `.html`+`.md` pairs to read.
4. Verify the built page against its `.html` reference side by side.
5. If something doesn't match, write the correction as `prompts/fixes/<module>-vN.md` (see `prompts/fixes/README.md`) rather than a one-off unlogged fix.

## Module map — build order

| # | Module | Pages | Depends on |
|---|---|---|---|
| 1 | Academic Setup | Classes & Sections, Subjects, Subject Groups | none |
| 2 | Student | Manage Students, Admission, Class Promotion | Academic Setup |
| 3 | Staff | Manage Staff, Departments, Designations | none |
| 4 | Attendance | Overview, Manage Shifts, Roster | Student, Staff |
| 5 | Leave | Requests, Leave Create, Leave Assign | Staff, Student |
| 6 | Holiday | Holidays, Templates, Assign | Academic Setup, Staff |
| 7 | Payroll | Generate Payroll, Salary Payouts, Salary Groups, Assign Salary | Staff, Attendance |
| 8 | Fees | Fees, Fee Structure, Fee Statement, Fee Reminder | Student, Academic Setup |
| 9 | Examination | Marksheet Structure, Generate Marksheet, Admit Card Structure, Generate Admit Card | Academic Setup, Student |
| 10 | Certificates | TC Structure, Generate TC | Student |
| 11 | Approvals | Requests | Leave (must have real data) |
| 12 | Settings | Academic Sessions, Admission Form Fields, Roles & Permissions, Marksheet Templates | Student, Staff, Examination |
| 13 | Dashboard | Dashboard | almost everything — build last |

## Locked global rules

- **One design system, no versions.** See `v1/_core/design-system.md`. Never resurrect an older look, never invent v1/v2 labels for the design itself.
- **`.dd` component for every dropdown/select** — never a native `<select>`.
- **Bootstrap Icons (`bi bi-*`) everywhere** — never inline SVG. (Dashboard's reference file itself still has inline SVG in a few places — its own `.md` flags this explicitly as something to fix during build, not copy.)
- **Match each page's own toolbar row structure** from its own `.html` — don't force one page's row-split (e.g. Attendance Overview's 6-column filter grid) onto a page with fewer filters that only needs one row.
- **Any consequential action (sync, delete, activate-session) confirms first** — never fires on a single click. Heavy deletes require typing `DELETE`; some pages (Academic Sessions) require typing the specific value being changed.
- **Existence-based vs. narrowing filters**: some pages show everything by default and filters only narrow (Manage Students, Admission, Generate TC); others gate on a required scope (Manage Shifts has no filter at all; Excel Import/Export requires a Class first). Check each page's own `.md` for which rule applies — don't assume.
- **Reuse, don't duplicate**: the shared letterhead print template (Admission Letter → Admit Card → Marksheet → TC), the print-mode-choice pattern (illustrated cards, not a dropdown), the Person-Type→Dept/Class cascade filter logic (Attendance, Leave, Approvals all share it), and the FieldConfig-driven validator (Admission form + its bulk-import path) are each built ONCE and reused — never reimplemented per page.

## Files

- `prompts/` — one prompt per module (13 total), plus `prompts/fixes/` for versioned corrections.
- `v1/_core/design-system.md` — the design system (colors, components, layout rules).
- `v1/_core/performance-principles.md` — scalability/resource/speed/readability/time-complexity rules every module inherits.
- `v1/_core/frontend-backend-folder-structure.md` — the exact on-disk layout, both layers.
- `v1/_core/error-handling/` — the full runnable error-handling foundation: 8 error classes, middleware, logger, message-builders (backend), interceptor + models (frontend), plus a `README.md` explaining the flow and `example-*-usage` files showing it wired into a real route/component.
- `v1/_core/database-design-principles.md` — multi-tenancy, uniqueness, transactions, embed-vs-reference, soft/hard-delete, idempotency keys.
- `v1/_core/state-management.md` — frontend state management (no NgRx, `ShellContextService` + per-module signals) and the SSR decision (not used).
- `v1/_core/claude-code-implementation-strategy.md` — isolation rules, per-module build workflow.
- `v1/_core/additional-technical-considerations.md` — notifications, i18n, print/PDF, pagination, job queues, rate limiting, caching, search-at-scale.
- `v1/_core/shell/app-shell.html` + `.md` — the standalone shared header+sidebar reference (dark sidebar, matches every page's own inline shell).
- `v1/<module>/<page>.html` — the exact approved visual/functional reference for every page.
- `v1/<module>/<page>.md` — the rules behind what the `.html` shows: frontend behavior + backend schema/endpoint notes.
