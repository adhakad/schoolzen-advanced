# Payroll — Generate payroll page (finalized design)

Status: **FINAL** — v1 — this page is also the REFERENCE
implementation the shared component library (in `_core/`) was extracted
from. If in doubt about how a shared component should look, this page is
the source of truth.

Depends on: `../_core/refactor-plan-and-design-system.md`

Reference files:
- `../_core/schoolzen-design-system-reference.html` — pixel-accurate HTML
  of this exact page

---

## Toolbar

Search box (grows to fill space) + Staff filter + **Department filter**
+ **Designation filter** (adjacent pair, Designation disabled until a
Department is chosen — global rule) + Status filter + Month/Year
(each with a visible dropdown chevron) + a primary "Generate for
selected" button, all wrapping together as one group when space is
tight.

The primary button is **disabled by default** and only enables once ≥1
row checkbox is selected; its label reflects the selected count once
active (e.g. "Generate for selected (2)").

## Table columns (in order)

Checkbox (header = select-all) → Employee (avatar+name+role) →
Attendance (P/L/A dot-counts) → Gross → Deductions → Net salary →
Status (fixed-width chip) → Action.

- Deduction amounts use the same neutral secondary-text color as other
  numeric columns (`#6b6b85`) — NOT red. The leading minus sign already
  communicates "subtracted"; a loud color on top reads as an alarm
  rather than a routine, correctly-computed value.
- Status chips are fixed-width (80px), text centered.
- Action column is a fixed-width slot (100px), icons right-aligned AND
  vertically centered — a row with one action icon occupies the exact
  same box position as a row with two.

## Three row states (the reusable generate-and-lock pattern)

1. **Pending** (not yet generated): Gross/Deductions show "—", Net shows
   muted "Not generated" text, status chip reads "Pending". Single
   action: a solid-purple "Generate" icon button.
2. **Draft** (generated, not locked): normal Gross/Deductions/Net
   numbers, status chip "Draft". Two actions: "Regenerate" (for
   correcting a mistake — e.g. something generated mid-month before
   attendance was final) + "Lock".
3. **Locked**: status chip "Locked". Two actions: "View" (slip) +
   "Unlock" (soft red/warning icon) — Unlock is gated behind a
   confirmation modal explaining that any linked payment record stays
   intact but amounts can change until re-locked.

## Table overflow handling

Outer wrapper: `overflow-x: auto` with small negative-margin + matching
padding (lets the scrollbar span the card's full width without changing
the card's edges). Inner wrapper: real `min-width` sized to the full
column set (~880px). Both layers are required — min-width alone, with no
dedicated scrolling parent, lets content spill past the card's edge
instead of scrolling within it.

## Sub-pages (reached via sidebar sub-items under Payroll)

Payment history, Salary groups, Assign salary — each shows a
"← Back to Payroll" link (accent-purple, left-arrow icon) as the first
element in its content area, linking back to this page.
