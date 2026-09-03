# Staff — Designations page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `designations.html` (same folder)

Simple CRUD, same shell as Departments/Salary Groups.

---

## Toolbar

Search + Department filter (added beyond the legacy component — since
Designations are the entities every other module's Designation filter
draws its options from, scoping this list by Department first makes
managing a long designation list practical) + "Create".

## Table

Title → Department (or a dash if none set) → Status chip → Action.

## Create/Edit modal

Title → Department (optional — "-- None --" is a valid choice, a
designation doesn't strictly require one) → Status.

## Delete confirmation

Per the global cascade-delete rule: a Designation with no staff
currently holding it uses the lighter single-confirm modal. One with
staff attached upgrades to type-to-confirm, naming the count. "Set to
Inactive" offered as the lighter alternative, never the only option.
