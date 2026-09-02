# Payroll — Salary Payouts page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `salary-payouts.html` (same folder)

Reached via sidebar sub-item "Salary payouts" under Payroll (was
"Payment history" in the legacy component — renamed, see naming note
below). Shows a "← Back to Payroll" link at the top of its content area.

---

## Naming

Named "Salary Payouts", not "Payment History" — "Payment" reads as a
customer paying for a product in most people's mental model; this page
is the school paying its own staff. "Payouts" avoids that ambiguity
without using a heavier word like "Disbursement".

## Top summary strip

Same shared summary-strip pattern as other modules: total disbursed this
period (hero, accent purple) + fully-paid / partially-paid / unpaid /
awaiting-confirmation counts, each a plain `<b>count</b> label` pair
separated by dividers.

## Page intro — compact, not paragraph blocks

The two explanatory notes from the original component (locked-payroll-
only rule; the "recorded but not yet confirmed" distinction) are
important but must NOT sit as permanent paragraph text pushing the
toolbar down. They live behind a small circular "i" info icon next to
the page title — click to reveal a dark tooltip-style popup containing
both notes. Collapsed by default.

## Toolbar — fixed filter order (this order is now the standard for
## every page in the app, not specific to this one)

1. Search (name or ID) — grows to fill space
2. Person-type filter (Staff/Student)
3. Department filter — mandatory alongside any Staff-type filter,
   mutual-exclusion-disabled the same way Attendance's Department/Class
   pair works
4. Designation filter — sits immediately next to Department (dependent
   pair, never separated by Payment Mode/Status), enabled only once a
   Department is chosen
5. Payment Mode filter
6. Payment Status filter (Unpaid / Partially Paid / Fully Paid)
7. Period picker — combined Month+Year in one control (prev/next
   chevrons around a single label, e.g. "August 2026"), placed LAST,
   right-aligned in the toolbar row. Never two separate Month and Year
   dropdowns.

## Table columns

Name+code → Net Salary → Amount Paid (with conditional sub-text) →
Status chip → Confirmation chip(s) → Mode(+reference) → Date → Paid By
→ Action.

- **Amount Paid sub-text, two distinct states**: "₹X still due" (muted
  grey) when a remaining balance exists; "₹X awaiting confirmation"
  (amber) when money has been recorded but the employee hasn't
  confirmed receipt yet. These are mutually exclusive per instalment but
  a row can show either depending on its current state — never both
  claimed as one number.
- **Status chip** (fixed-width, per the shared chip pattern): Unpaid
  (red/pink), Partially Paid (amber), Fully Paid (green).
- **Confirmation** shows one small chip PER instalment (not one per
  row) — a salary paid in two parts can have one instalment confirmed
  and the other still pending. States: Confirmed (green), Pending
  (amber), Disputed (red, tooltip shows the dispute reason).
- **Action column**: a single icon-button per row, consistent with the
  shared icon-action pattern —
  - Solid-purple "Record Payment" (cash icon) when the row still has an
    outstanding balance.
  - Neutral "View slip" (receipt icon) once the row is fully paid and
    confirmed.
  - A dash when neither applies yet (nothing recorded, nothing to view).

## Table overflow

Same two-layer scroll pattern as Payroll's Generate page: outer wrapper
with negative-margin/matching-padding `overflow-x: auto`, inner wrapper
with a real `min-width` (~1000px for this column set).

## Record Payment modal (not shown in the default reference render)

Reused logic from the original component:
- Shows net salary, amount already confirmed, amount still due.
- If a pending (recorded-but-unconfirmed) amount exists, an explicit
  note explains it's already held back from the "due" figure — without
  this line the three numbers don't visibly add up.
- Fields: Amount, Payment Date, Payment Mode, Reference Number, Remarks.

## Salary slip modal

Reused as-is from the original component (corporate payslip layout,
school header pulled from School profile, attendance breakdown,
earnings/deductions two-column, net pay banner, signature+digital-
footprint footer, print action). Not redesigned — this was already
working well and isn't part of the visual refresh.
