# Leave — Leave Assign page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `leave-assign.html` (same folder)

**Renamed from "Leave Limit"** — this page gives each person their
leave allowance, same naming family as Payroll's "Assign Salary" (not
"Salary Limit"). A request can only be approved for a leave type the
person has been given here first.

---

## Toolbar

Search → Person-type (Staff/Student) → Department+Designation (Staff)
→ Class+Section (Student, existence-check, same pattern as Requests
and everywhere else this filter pair appears).

## Selection + bulk action

Checkbox column (header = select-all) + a selection bar: "N selected"
+ "Set Leave Limit" button, disabled until ≥1 row is checked — same
disable pattern as every other bulk-action button in the app.

## Table

One column per active Leave Type (dynamic, not fixed) — Name+code,
Department/Class, then one cell per leave type showing "N days"
(+ "M days left" only once some have been used — an untouched "10
days / 10 days left" on every row is noise) or a muted "Not set" with
an inline "Set" link for assigning that one type to that one person
individually.

## Set Leave Limit modal (bulk)

States the selection count, then a checklist of every leave type
(checkbox + days/year) — tick which ones this batch of people should
be allowed. A note clarifies: anyone who already has one of the ticked
types keeps the days they've already taken; nothing is reset by
re-assigning.

## Empty states

- No leave type created yet: a note pointing to **Leave Create** to set
  one up first (link, not just a name — this page can't do anything
  until one exists).
- Student view, no class chosen yet: "Choose a class to see its
  students" — a whole school's roll is not a usable table.
