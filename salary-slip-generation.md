# Salary Slip Generation — Professional PDF, MNC-style

Add a professional salary slip PDF, generated only for a LOCKED and paid (or
partially paid) Payroll record. Follow the same visual/technical pattern
already used for the Fees Receipt (pages/admin/fees/fees.component.html's
receiptMode print modal, and services/print-pdf) — same libraries, same
header/school-info block, same print/download mechanism — do not introduce a
new PDF library or a new visual style.

## Model addition — SalarySlip

```
adminId: String, required
payrollId: String, required          // reference to the Payroll record
personType: String, enum ['staff','teacher'], required
personId: String, required
slipNumber: String, required, unique  // see generation rule below
salaryPaymentIds: [String]            // references to SalaryPayment rows included in this slip
generatedAt: Date, default Date.now
generatedBy: String, required         // adminId or user who generated it
```

### slipNumber generation
A unique, sequential, human-readable number per school — e.g.
`SLIP-{adminId-short}-{year}{month}-{sequence}` or similar, following
whatever numbering convention the existing Fees Receipt already uses for
`receiptNo` (match that pattern exactly rather than inventing a new format —
check `receiptInstallment.receiptNo`'s generation logic and mirror it).

## What triggers slip generation
- A "Generate Slip" action appears on a Payroll row ONLY once that Payroll is
  LOCKED and has at least one SalaryPayment recorded against it (fully or
  partially paid — a slip documents an actual payment event, not a draft
  calculation).
- Generating a slip creates one SalarySlip record (with a fresh slipNumber)
  and produces the PDF. If payment happens in multiple installments, each
  new payment can either update the existing slip (regenerate with updated
  paid-to-date) or produce a new slip referencing the latest payment — follow
  whichever is simpler given the existing Fees Receipt pattern for repeat
  payments on the same fee structure.

## Slip layout — mirror the Fees Receipt structure exactly

Reuse the exact header block from the Fees Receipt: school logo, school name
(uppercase, bold), board/affiliation line, contact/email line, address line —
all pulled from the same School profile data the Fees Receipt already reads
(schoolInfo.schoolLogo, schoolName, board, affiliationNumber, phoneOne, email,
street, city, district, state, pinCode). Do not ask the admin to re-enter any
school detail — read it from the existing School profile the same way Fees
does.

Below the header:

**Title row**: "SALARY SLIP" + the month/year (e.g. "SALARY SLIP — August 2026")
**Slip meta row**: Slip Number, Generated Date (right-aligned, matching the
Fees Receipt's date placement)

**Person info block** (mirrors the Fees Receipt's student-info table):
- Name, Employee/Teacher ID, Designation, Department
- Payment Date, Payment Mode, Reference Number (from SalaryPayment)

**Earnings & Deductions table** (mirrors the Fees Receipt's fee-items table):
- Left column: earnings — Basic, HRA, each allowance line item by name
- Right column or a second table: deductions — each deduction line item by
  name, plus Attendance Deduction if applicable (perMonth mode)
- Attendance summary line: Present Days / Leave Days / Absent Days / Total
  Working Days — short, one line, not a full breakdown table

**Totals section** (mirrors Fees Receipt's TOTAL/PAID/DUE rows):
- GROSS SALARY
- TOTAL DEDUCTIONS
- NET SALARY
- AMOUNT PAID (from SalaryPayment)
- Amount in words (reuse the existing `numberToWords` pipe already used on
  the Fees Receipt)

**Footer — signature + digital footprint**:
- "Authorized Signatory" line with a signature space, same placement/style
  as the Fees Receipt's signatory line — read the signatory name from School
  profile if such a field exists there already, otherwise leave the line
  blank for physical/wet signature (do not invent a new School profile field
  for this unless one is a natural, small addition already fitting the
  existing School model's shape)
- A small digital footprint block, distinct from the signature line: "This
  slip was generated electronically on {timestamp} by {generatedBy}" plus
  the slip number repeated — this is the audit trail that lives on the
  document itself, and the same data must also be queryable in the system
  (the SalarySlip record above already stores generatedAt/generatedBy/
  slipNumber for that).

## Keep it clean, not overloaded
- Single page, no more sections than what's listed above.
- No charts, no logos beyond the school's own, no extra branding.
- Match the Fees Receipt's font sizes and spacing conventions exactly — this
  should look like a sibling document to the fee receipt, not a different
  design language.

## Razorpay-Route-ready fields (design only, not built now)

Same principle as the earlier SalaryPayment future-readiness section — the
slip's data model should not block a future automated-payout feature, but
Razorpay integration itself is NOT built in this task.

- Add these fields to SalarySlip, unused for now:
  ```
  payoutReferenceId: String, default null   // future: Razorpay transfer/payout id shown on the slip
  payoutMode: String, enum ['manual','automated'], default 'manual'
  ```
- When a future automated-payout phase exists, an automated payment's slip
  can show the Razorpay transfer ID in the same "Reference Number" field the
  slip already displays for manual payments (SalaryPayment.referenceNumber)
  — no new field is needed on the printed slip itself, since a payout
  reference number fits the same visual slot a cheque/UPI reference number
  already occupies. `payoutReferenceId` above is only for internal lookup/
  reconciliation against Razorpay's dashboard, not something new to print.
- Do NOT call any Razorpay API, do NOT add the razorpay npm package here —
  this section only keeps the schema forward-compatible.

## Backend
- controllers/salary-slip.js: GenerateSalarySlip (creates the SalarySlip
  record, returns the data needed for the frontend to render/print — same
  division of responsibility as how Fees Receipt data is assembled: backend
  returns structured JSON, frontend renders the printable HTML and calls the
  browser print/PDF flow, matching printStudentData()'s pattern exactly)
- GetSalarySlip (fetch a previously generated slip's data + PDF re-render)

## Frontend
- Add a "Generate Slip" icon-button on Payment History tab rows (once
  LOCKED + paid)
- A print modal reusing the exact same modal/print pattern as the Fees
  Receipt (`custom-modal`, `print-model-dialog`, the same `printStudentData()`
  -style print trigger) — do not build a new print mechanism
