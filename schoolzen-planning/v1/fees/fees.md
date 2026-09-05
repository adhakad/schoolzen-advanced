# Fees — Fees (Collection) page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `fees.html` (same folder)

Top-level Fees landing page — where day-to-day fee collection happens.

---

## Summary strip

Follows the Payroll reference's `ls-strip`/`ls-count` structure
exactly — **plain bold number + label, no chip/pill at all**. The
reference's own strip (`<b>28</b> locked`, `<b>14</b> pending drafts`)
never uses a colored chip; chips belong only inside the table's Status
column. Fees' strip: Total Collected this month, Fully Paid count, Has
Arrears count, Unpaid count — plain text throughout. The strip is a
separate white card OUTSIDE `sw-card-main`, sitting directly inside
`sw-main` above it, not inside the main card alongside the title/
toolbar/table.

## Table

Student → Admission No. → **Class → Stream** (existence-shown, "N/A"
when not applicable — same tag style used across Manage Students/
Admission) → Fee Concession → Paid Fee → Due Fee → Total Fee →
**Status** (the ONLY place a colored chip appears on this page —
`.fee-status-chip`, a wide labeled pill: Fully Paid green, Has Arrears
amber, Unpaid red) → Collected By → Collect → Statement. Class/Stream
appear directly in the table now, not just as a filter state above it,
since a school often views "All classes" at once and needs to see
which class each row belongs to without cross-referencing the
toolbar.

## Toolbar

Search → Class+Stream (existence+dependency pair).

## Table

Student → Admission No. → Fee Concession → Paid Fee → **Due Fee**
(includes any unpaid PREVIOUS-YEAR balance, shown as a small note
beneath the amount — "incl. ₹6,500 from 7th" — so the number itself
is always the true total owed, never just the current year) → Total
Fee → **Status** (fixed-width chip: "Fully Paid" or "Has Arrears" —
Has Arrears appears whenever any previous-year balance remains,
independent of whether the current year is otherwise settled) →
**Collected By** (who processed the last payment) → Collect (action)
→ Statement (launch icon to Fee Statement).

## Collect column — one state at a time, never both

A student still owing money (current year, arrears, or both) shows a
**"Collect" button**. A fully-paid student (current year AND any
arrears clear) shows a fixed **"Fully Paid" status chip** and a dash
in the Collect column instead — the two never appear together.

## Fee Payment modal

A student-info strip (Admission No., Class, Name, Father) for context,
then a **Due Breakdown** block listing each due amount separately —
current year and any previous-year arrears each on their own line,
summing to a Total Due — before the Amount + Payment Mode fields.
Showing arrears broken out (not folded silently into one number) means
a parent paying at the counter can see exactly what's being collected
and why the total is higher than the current year's fee alone.

## Professional Fee Receipt — redesigned as a real printable document

Same treatment as the Admission Letter: a bordered letterhead frame
(school name, address, contact), a receipt-number title band, then a
compact two-column info table (Student/Admission No./Class/Payment
Date/Mode), a dashed-line item breakdown (Tuition, Transport, any
**Previous Year Due** line shown in the same amber tone as the
arrears status chip, Concession), Total/Paid/Due shown as three
distinct colored lines (Due in red, Paid in green), an amount-in-words
sentence, and a signature line for Authorized Signatory. Footer has a
single "Print" action.
