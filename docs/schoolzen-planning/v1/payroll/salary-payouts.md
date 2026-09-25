# Payroll — Salary Payouts

Status: **FINAL**
Reference: `salary-payouts.html`

Only LOCKED payroll runs appear here — record and track payments against them.

---

## Frontend

**Toolbar**: search + Department→Designation, Mode `.dd` (Bank Transfer/Cash/UPI), Status `.dd` (Fully Paid/Partially Paid/Unpaid), month-nav.

**Table**: Name, Net Salary, Amount Paid (with "₹X still due" note if partial), Status (tag), **Confirmation** (Confirmed/Pending/Disputed/Expired — a payment can be recorded but sits Pending until the employee confirms, showing "awaiting confirmation" rather than being treated as settled), Mode (+ UTR/reference number shown under Bank Transfer), Date, Paid By, Action — View Slip if fully settled, "Record Payment" (cash icon) if still due. A Disputed row shows the dispute reason on hover/click and needs a manual admin follow-up (re-record correctly) — no automated resolution.

**Record Payment modal**: amount, mode, reference/UTR if applicable — supports partial payment (paying less than net leaves "still due" state).

## Backend

Schema — `PayrollPayment`: `adminId`, `payrollRunId` (must reference a `locked` run — reject otherwise), `amountPaid`, `mode`, `reference` (UTR etc.), `paidBy`, `date`, `confirmationStatus:'confirmed'|'pending'|'disputed'|'expired'`, `confirmationRequestedAt`, `confirmationExpiresAt` (= requestedAt + 24h), `confirmedAt`, `confirmedByDeviceInfo` (basic footprint, whatever's already logged for similar actions elsewhere), `disputeReason`. A staff member's payout status (Unpaid/Partial/Full) is DERIVED from summing only `confirmed` `PayrollPayment`s against that month's `PayrollRun.net` — a `pending` or `expired` payment does not count as paid yet, which is what prevents a one-sided "I paid" claim from being treated as settled before the employee agrees. This stays one document, one source of truth — no separate confirmation/audit collection; the record already carries who recorded it and now also who confirmed it and when.

**Confirmation flow**: recording a payment sets `confirmationStatus:'pending'` and notifies the employee (via whichever in-app/notification mechanism already exists for that person's login — reuse it, don't build a new channel). The employee (through their own unified login) can Confirm or Dispute (with a required reason) from their own panel within the 24-hour window; a `PUT /:id/confirm` and `PUT /:id/dispute` endpoint, both restricted to that payment's own `staffId` matching the requester's identity from the JWT. A scheduled job (same `node-cron`/BullMQ pattern already used elsewhere) runs hourly and flips any `pending` row past its `confirmationExpiresAt` to `expired` — admin must re-record the payment (a fresh pending cycle) if the employee still needs to receive it.

**Salary Slip** ("View Slip", shown once fully settled): a single-page, MNC-style payslip (dark navy header/footer bands, not the Fees Receipt's visual style — only its underlying mechanism: reading school info from School profile, the same print/PDF trigger). Sections: header strip (school logo/name/affiliation, "PAYSLIP" + month/year), a slip-number + generated-timestamp meta strip (`slipNumber` format `SLP-{schoolShortCode}-{YYYYMM}-{sequence}`, mirroring however the Fees Receipt already generates its own sequential `receiptNo`), employee info block (name, ID, designation, department, pay period, mode), an attendance-summary strip (Present/Leave/Absent/Holiday/Working Days), a two-column Earnings/Deductions table with bold subtotals, a full-width Net Pay banner with amount-in-words below it (reuse the existing `numberToWords` pipe), a payment-info row (date/mode/reference), and a footer with an Authorized Signatory line plus a small "system-generated, no signature required" note. Backend returns the structured slip data (schema `SalarySlip`: `adminId`, `payrollRunId`, `staffId`, `slipNumber`, `generatedAt`, `generatedBy`); frontend renders and triggers print, same division of responsibility as every other print flow in this app.

**Razorpay-Route-ready fields (design only, not built now)**: reserve `payoutMode:'manual'|'automated'` (default `manual`), `payoutGatewayId` (default null), `payoutStatus:'pending'|'processing'|'success'|'failed'` (default null) on `PayrollPayment`, plus a `bankDetails` sub-object (`accountHolderName`, `accountNumber`, `ifscCode`, `bankName`, `upiId`) on `Staff` — plain admin-entered fields, no live bank-API validation. No Razorpay package, no API call, no automated transfer in this phase; this only keeps the schema from blocking a future automated-payout phase, which would read these, create a Razorpay Route linked account per staff, and update `payoutGatewayId`/`payoutStatus` via webhook on a locked run.
