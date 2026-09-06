# Payroll — Assign Salary page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `assign-salary.html` (same folder)

Reached via sidebar sub-item "Assign salary" under Payroll. Shows the
standard "← Back to Payroll" link.

---

## No person-type filter

The legacy component had a Staff/Teacher toggle — removed, since Teacher
is unified into Staff (per R1). Everyone on this page is Staff; there's
nothing to switch between.

## Toolbar filters

Search (mandatory) → Department → **Designation**.

Designation is the key addition beyond the shared Department-filter
rule: Department alone is too broad for this page's purpose. A
department like "Teaching" spans multiple designations that don't share
a pay band (Primary Teacher vs PGT vs Coordinator, for example) —
selecting everyone in "Teaching" and bulk-assigning one salary group
would be wrong. Designation:
- Is enabled only once a Department is chosen (mutual-DEPENDENCY, not
  mutual-exclusion like Department-vs-Class elsewhere — Designation
  narrows within the selected Department rather than disabling against
  it).
- Lets the admin filter down to exactly the group of people who share a
  pay band, then select-all and bulk-assign with confidence.

Each row also shows the person's designation as a small tag (next to
their code) so it's visible which pay-band group they belong to even
before using the filter.

## Selection bar

Appears above the table: "N selected" + an "Assign to Selected" button
(disabled until ≥1 row is checked — same disable pattern as Payroll's
bulk-generate button).

## Table columns

Checkbox (header = select-all) → Name+code+designation-tag → Assigned
Group (group name + mode tag, e.g. "Per Month"; "Has a personal
override" sub-text when applicable; muted italic "Not assigned" when
nothing is set) → Effective From (or a dash) → Action.

## Action column

A single button per row, labeled by state — "Assign" (plus icon) if
nothing is set yet, "Change" (edit icon) if a group is already assigned.
Not the fixed icon-only pattern used in tables with more action variety
(Payroll's generate/lock/unlock) — here there's only ever one meaningful
action per row, so a small labeled button reads more clearly than a
bare icon would.

## Assign-one modal (sticky header+footer, per the global modal rule)

- Salary Group select + Effective From date — both required.
- **"Override for this person" checkbox, collapsed by default.** Most
  staff take their group's numbers unchanged; four always-visible
  optional override fields would wrongly suggest otherwise. Checking it
  reveals:
  - A note: "Leave a field blank to keep the group's value. Enter 0 to
    give this person none of it."
  - Basic (override) + HRA (override) fields.
  - A further nested "Also override allowances and deductions" checkbox
    that reveals the same inline allowance/deduction row editor used in
    Salary Groups (add/remove rows with a "+"/"×", not a separate
    modal).

## Bulk-assign modal (sticky header+footer)

- A warning note: "Anyone in this selection with a personal override
  will lose it — they all end up on exactly the group's numbers." This
  is a real data-loss consequence, not a generic confirmation — the
  copy should keep saying so.
- Salary Group select + Effective From date. No override options here —
  bulk assignment is deliberately the group's numbers, unmodified, for
  everyone selected.

## Empty state — no salary groups exist yet

If no active salary group exists, this page can't do anything, so the
note is a LINK, not just a name: "No salary group has been created yet
— make one under **Salary Groups** first," with "Salary Groups" linking
directly there. This is the one case on this page where a note should
be a link rather than plain text, because the person genuinely cannot
proceed without going there first.
