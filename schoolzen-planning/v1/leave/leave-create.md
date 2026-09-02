# Leave — Leave Create page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `leave-create.html` (same folder)

**Renamed from "Leave Type"** — this page CREATES the types of leave a
school offers (Casual, Sick, Medical, Maternity, etc.), so a name
describing the action fits better than the noun of what's being listed.
Same naming logic as Payroll's "Assign Salary" vs a generic "Salary
Limits".

---

## Toolbar

Search (mandatory) + "Create" primary button, inside the toolbar —
same shape as Salary Groups' Search+Add.

## Table

Name → Who Can Take It (Everyone / Staff only / Students only — plain
language, never the raw stored enum) → Assigned Days → Paid (fixed-
width Paid/Unpaid chip) → Status (Active/Inactive) → Action
(Edit/Delete icons).

## Create/Edit modal (sticky header+footer)

- Name, with a hint listing examples (Sick Leave, Casual Leave,
  Maternity Leave).
- "Who can take this leave" — Everyone / Staff only / Students only.
  Hint: "Only these people will see this leave on the apply form."
- Assigned Days per year, with a hint noting it can be overridden per
  person on **Leave Assign**.
- "Salary is paid for these days" toggle, with a hint: turning it off
  means the days get deducted from salary when payroll is generated —
  this ties the Leave and Payroll modules together and should read as
  a real consequence, not a throwaway label.
- Status (Active/Inactive), with a hint that Inactive keeps history but
  hides it from new requests — same convention as every other
  Active/Inactive toggle in the app (Shifts, Salary Groups).

## Delete confirmation

Per the global cascade-delete rule (see `_core`): if nobody has ever
requested this leave type, a simple confirm is enough. If requests
exist under it, the modal names the dependent count and requires
type-to-confirm, same as Salary Groups' delete flow — "Set Inactive"
offered as the lighter alternative, never the only option.
