# Fees — Fee Statement page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `fee-statement.html` (same folder)

Reached via the "Statement" launch icon on the Fees page — a full
per-student fee picture, not a table row's worth of numbers.

---

## Layout

A profile-style header (photo/initials avatar, name, identity summary
— Admission No./Class/Roll No./Father) matching the convention already
established for Manage Students' and Admission's View modals, followed
by:
- **Summary strip**: Fee Concession / Paid Fee / Due Fee / Total Fee /
  Status (fixed-width chip). Due Fee includes any unpaid PREVIOUS-YEAR
  balance and shows a small note beneath it ("incl. ₹6,500 from 7th")
  — same treatment as the Fees page's table. Status shows "Has
  Arrears" or "Fully Paid" (same chip used on the Fees page — this
  isn't a separate status system, just the same one shown again here).
- **Previous Year Dues table** — a proper multi-session ledger, not
  just a single lump "amount due" line: Session → Class → Total Fee
  (that year's full amount) → Paid (how much of it was actually
  collected) → Remaining Due → Status chip → **Payments** (a receipt
  icon opening that specific session's installment-level history).
  Shows **every past session this student was enrolled in**, not only
  years still owing something — a fully-cleared year stays visible as
  Fully Paid, so the table reads as a genuine year-by-year history
  rather than just a rolling arrears total with no origin story.
  Handles a student carrying unpaid balances from more than one prior
  year (each gets its own row), not just the immediately previous one.

- **Year Payments modal** — the actual digital footprint: opened from
  any Previous Year Dues row, shows every installment paid THAT
  session (Receipt No., Amount, Payment Date, Collected By, and a
  reprint/regenerate icon per row) — same table shape as the current
  year's own Payment History, so "when and in how many installments
  did this year's fee come in" is answerable for any past session, not
  just the current one. A closing hint line states the count and total
  ("3 installments totaling ₹31,500 of ₹38,000").

- **Receipt regenerate/reprint** — every payment row, current year or
  past, carries the same printer icon with an explicit "Regenerate /
  reprint this receipt" tooltip — re-issuing a lost receipt for a
  payment made months or years ago works identically to reprinting
  today's, using the same Fee Receipt template populated from that
  historical payment's stored data.
- **Particulars table** (labeled "Particulars — Current Year (Class)"
  to distinguish it from the Previous Year Dues table above it): each
  fee component (Tuition, Transport, etc.) and its amount for the
  CURRENT year's structure.
- **Payment History table**: every payment made — Receipt No., Amount,
  Payment Date, **Collected By** (who processed it — renamed from the
  legacy component's "Recipient," which described the same person but
  less clearly), and a receipt-reprint icon per row (opens the same
  professional receipt used at collection time).

This is a standalone page (not a modal), since a full fee history with
multiple tables deserves its own screen rather than being squeezed
into a popup.
