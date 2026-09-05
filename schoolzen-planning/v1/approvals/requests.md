# Approval Requests — unified inbox (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `requests.html` (same folder)

---

## Why a separate top-level module (not nested under Leave)

Approvals aren't a Leave-only concept — over time other modules will
generate approval-needing requests too (Permission, Expense, Overtime,
etc.). Building this as its own top-level sidebar item, rather than a
tab inside Leave, means every future request-type plugs into the same
inbox instead of each module growing its own separate approval screen.

## Design philosophy: simple, not a filter-everything dashboard

Deliberately minimal — this is a cross-module TRIAGE inbox, not a
reporting tool:
- Search (by name/ID)
- **Type** filter (currently just "Leave"; grows as more request types
  are added — always shown as a small colored tag per row, e.g. "Leave")
- **Status** filter

No Department/Designation/Class/Section filters here — those live on
each module's own request page (Leave > Requests) for anyone who needs
to filter deeply within one type. This page's job is "show me
everything waiting on me, across everything," not deep per-module
analysis.

## Table

Type (tag) → Name(+code/context) → Details (a one-line plain-language
summary — e.g. "Casual Leave · 05–06 Aug (2 days)" — not raw fields) →
Status chip → Action.

## Action column

Approving/rejecting from here does EXACTLY what the same action does
on the request's home module page (e.g. approving a Leave item here
is identical to approving it from Leave > Requests — same modal, same
consequences, same ActivityLog entry). This page is a view onto the
same underlying requests, not a separate approval mechanism.

## Future extension

When a new module needs approvals (e.g. Expense), it adds its own
"Type" tag and Details-line format here — the shell (table shape,
filters, action behavior) doesn't change per type.
