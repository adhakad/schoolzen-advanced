# Build: Fees module (all 4 pages)

Depends on Student and Academic Setup modules.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/fees/fee-structure.{html,md}` (build first — the rest reference it)
3. `docs/schoolzen-planning/v1/fees/fees.{html,md}`
4. `docs/schoolzen-planning/v1/fees/fee-statement.{html,md}`
5. `docs/schoolzen-planning/v1/fees/fee-reminder.{html,md}`

## Build
**Backend**: `models/fees/fee-structure.js`, `student-fee-record.js`, `fee-payment.js`, `fee-reminder-filter.js`; `controllers/fees/*.controller.js`; matching routes.
**Frontend**: one component folder per page under `fees/`; `shared/services/fees/*.service.ts`; `shared/models/fees/*.model.ts`.

## Critical rules — this module has a real ledger, get it right
- `StudentFeeRecord.arrears[]` is populated by Class Promotion's carryforward (see `student/class-promotion.md`) — a student's Fee Statement must show EVERY past session they were enrolled in permanently, not just years with outstanding dues.
- A payment ALWAYS clears oldest dues first (arrears before current year) — this allocation logic is ONE shared function, called from every place a payment can be recorded, never duplicated.
- Paid/Due/Status on both Fees and Fee Statement are DERIVED from summing `FeePayment` against `totalFee+arrears` — never separately-stored status fields that can drift.
- Fee Reminder's recipient list is NEVER stored — every "To Send" / preview re-runs the filter live against current data.
- The receipt/statement printable views share the same letterhead template as Admission Letter (see `student/admission.md`) — one shared print service.

## Design rules
Zero native `<select>`. Bootstrap Icons only. Fee Statement is a read-composed single-student view, not a list page — build it as such (no toolbar/pagination, just sections).

## When done
Show all 4 pages next to references. Confirm: a partial payment correctly clears an old arrear before touching current-year due; Fee Statement shows historical sessions with zero due still listed; Fee Reminder's "To Send" genuinely re-queries rather than showing a cached list.
