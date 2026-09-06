# Payroll — Salary Groups page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `salary-groups.html` (same folder)

Reached via sidebar sub-item "Salary groups" under Payroll. Shows the
standard "← Back to Payroll" link.

---

## Page intro

Title "Salary Groups" with a collapsible info-icon (same pattern as
Salary Payouts) explaining: set up a scale once, assign staff to it from
Assign Salary; editing a scale only changes future payroll, not payroll
already generated (which keeps its own copy of the numbers).

## Toolbar

Search box (grows) + "Add Salary Group" primary button. No other
filters — this list isn't staff-scoped, so the Department-filter rule
doesn't apply here; the mandatory-search rule still does.

## Table columns

No. → Name (+ "N allowances · M deductions" sub-text, omitted if both
are zero) → Mode (plain label — "Per Month"/"Per Day", never the raw
enum) → Basic → HRA → Status chip (Active/Inactive, fixed-width) →
Action (Edit + Delete icon-buttons, neutral + warning variants per the
shared icon-action pattern).

## Add/Edit modal — sticky header+footer

This modal can grow arbitrarily tall (unlimited allowance/deduction
rows), so it uses the **sticky header+footer** pattern (now a global
rule — see `_core`): fixed title+close-icon header, fixed Cancel+Save
footer, only the middle form area scrolls.

Fields, in order:
1. Name
2. "How is this paid?" — a dropdown (Per Month / Per Day), never a
   radio group — with a hint line that changes based on the selection
   (per-day amounts are a daily rate × days worked; per-month amounts
   are a full month with absences deducted from it).
3. Basic + HRA (side by side)
4. **Allowances** — its own light-tint block with a small "+" button in
   its header; each row is inline (name + amount + a small "×" remove
   button), added/removed without a separate modal. Empty state: "None
   — add one if this scale includes transport, medical or similar."
5. **Deductions** — identical shape to Allowances, empty-state copy
   references PF/professional tax instead.
6. Status (Active/Inactive) with a hint: "An inactive scale keeps its
   history but is not offered when assigning."

## Delete confirmation modal

Updated per the global cascade-delete rule (see `_core`) — supersedes
the earlier block-if-in-use approach. If nobody is assigned to this
scale, the lighter single-row confirm-modal is enough. If people ARE
assigned, the modal upgrades to type-to-confirm: it names exactly what
depends on this group (e.g. "4 staff are on this scale; 2 generated
payrolls reference it") and states both will be deleted with it —
requires typing "DELETE" before the button enables. "Set to Inactive
instead" is offered as a lighter alternative button alongside Delete,
never as the only option. The deletion (plus dependent count) is
written to the ActivityLog per R6.
