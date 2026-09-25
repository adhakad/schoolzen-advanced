# Build: Payroll module (all 4 pages)

Depends on Staff and Attendance modules.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/payroll/salary-groups.{html,md}` (build first — the other 3 depend on it conceptually)
3. `docs/schoolzen-planning/v1/payroll/assign-salary.{html,md}`
4. `docs/schoolzen-planning/v1/payroll/generate-payroll.{html,md}`
5. `docs/schoolzen-planning/v1/payroll/salary-payouts.{html,md}`

## Build
**Backend**: `models/payroll/salary-group.js`, `staff-salary-assignment.js`, `payroll-run.js`, `payroll-payment.js`; `controllers/payroll/*.controller.js`; matching routes.
**Frontend**: one component folder per page under `payroll/`; `shared/services/payroll/*.service.ts`; `shared/models/payroll/*.model.ts`.

## Critical rules — read carefully, this module has real state-machine logic
- `PayrollRun.status` flow: `pending` (no salary group, or not yet generated) → `draft` (generated, editable — Regenerate/Lock actions) → `locked` (final — View Slip/Unlock actions). **A `draft` run must never appear in Salary Payouts** — only `locked` runs do.
- `StaffSalaryAssignment` can carry per-field `overrides` on top of its `SalaryGroup` — Generate Payroll must MERGE group defaults with any override fields present, never wholesale-replace.
- A payout's Unpaid/Partial/Full status is DERIVED by summing `PayrollPayment`s against `PayrollRun.net` — never a separately stored status field that could drift.
- UPI payments can be recorded but sit at `confirmationStatus:'pending'` until confirmed — don't treat a recorded-but-unconfirmed payment as settled.
- Unlocking a payroll run reverts it to `draft` — log who/when, since it undoes a finalized state.

## Design rules
Zero native `<select>`. Bootstrap Icons only. Match each page's own toolbar shape (Salary Groups has no filter row; the other 3 do).

## When done
Show all 4 pages next to references. Confirm: a draft run is genuinely invisible on Salary Payouts; changing a Salary Group's rates doesn't silently overwrite someone's personal override; the status-dependent action buttons on Generate Payroll match exactly.
