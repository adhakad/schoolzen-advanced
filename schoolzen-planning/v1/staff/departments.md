# Staff — Departments page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `departments.html` (same folder)

Simple CRUD, identical shell to Salary Groups: Search+Add toolbar,
table, single-row confirm modal.

---

## Toolbar

Search + "Create" — inside the toolbar.

## Table

Name → Status chip → Action (Edit/Delete).

## Create/Edit modal

Name + Status (Active/Inactive).

## Delete confirmation

Per the global cascade-delete rule: a Department with no staff or
designations linked to it uses the lighter single-confirm modal. One
with staff/designations attached upgrades to type-to-confirm, naming
the dependent counts (e.g. "12 staff and 4 designations reference this
department"). "Set to Inactive" offered as the lighter alternative,
never the only option.
