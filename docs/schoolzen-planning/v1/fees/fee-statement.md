# Fees — Fee Statement

Status: **FINAL**
Reference: `fee-statement.html`

Full per-student fee picture — opened via the "Statement" icon on the Fees page, not a standalone list page.

---

## Frontend

**Layout**: a profile header (photo/name/admission-class-roll-father) → a summary strip (Concession/Paid/Due-with-arrear-note/Total/Status) → three stacked sections:
1. **Previous Year Dues** — every past session this student was EVER enrolled in stays listed permanently (not just years still owing something), each with its own receipt-history icon.
2. **Particulars — Current Year** — the fee breakdown from Fee Structure for their current class.
3. **Payment History — Current Year** — receipts with number/amount/date/collected-by, each with its own printable receipt icon.

This is a read/reference view (no collection action here — that happens on the Fees page itself).

## Backend

No new model — this is a read-composed view joining `StudentFeeRecord` (current + all historical sessions for this student), `FeeStructure` (for the particulars breakdown), and `FeePayment` (for history) in one aggregation per student, not three separate round-trips from the frontend.
