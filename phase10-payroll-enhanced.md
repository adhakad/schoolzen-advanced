# Phase 10 — Payroll Module (Enhanced)

Read CLAUDE.md fully before starting. Build SalaryStructure, SalaryGroup, and
real Payroll generation, backend + frontend together, following the New
Module Checklist and naming conventions.

## Part 1 — SalaryGroup (reusable salary templates)

Instead of entering every salary component manually for each staff member,
admin creates named Salary Groups once (e.g. "Primary Teacher", "Admin Staff",
"Support Staff") with a fixed set of components, then assigns a group to each
staff member — much faster for schools with many staff on similar pay scales.

### Model — SalaryGroup
```
adminId: String, required
name: String, required              // e.g. "Primary Teacher Grade A"
basic: Number, required
hra: Number, default 0
allowances: [{ name: String, amount: Number }]   // flexible list — DA, medical, transport, etc.
deductions: [{ name: String, amount: Number }]   // PF, professional tax, etc.
calculationMode: String, enum ['perMonth', 'perDay'], default 'perMonth'
status: String, enum ['active','inactive'], default 'active'
createdAt: Date, default Date.now
```
- `allowances` and `deductions` as flexible arrays (not fixed fields) so
  admin can add any number of custom components per group — not limited to
  a hardcoded list.
- `calculationMode` determines how the group's amounts are interpreted:
  - `perMonth`: the amounts above are the FULL month's pay (existing
    per-month behavior) — presentDays/absentDays only affect deductions for
    absences beyond what leave/holiday covers.
  - `perDay`: the amounts above are PER-DAY rates — final pay = (basic +
    hra + sum of allowances) × presentDays (+ paid leave days, per the
    existing Leave module's isPaid flag) for that month. This mode suits
    staff paid strictly by attendance (e.g. part-time, contract staff).

### Model — SalaryStructure (per-staff assignment)
```
adminId: String, required
staffId: String, required
salaryGroupId: String, required    // reference to the SalaryGroup
effectiveFrom: Date, required
// Optional per-person overrides — if set, use these instead of the group's values
overrideBasic: Number, default null
overrideHra: Number, default null
overrideAllowances: [{ name: String, amount: Number }], default null
overrideDeductions: [{ name: String, amount: Number }], default null
createdAt: Date, default Date.now
```
- Most staff just reference a SalaryGroup with no overrides.
- If a specific staff member needs a different basic/hra/allowance than
  their group's default (e.g. a senior teacher with the same designation but
  higher basic), the override fields let admin adjust just for that person
  without creating a whole new group.
- Effective calculation for a person = group's values, with any non-null
  override field replacing the group's corresponding value.

## Part 2 — Payroll generation

### Model — Payroll
```
adminId: String, required
staffId: String, required
month: Number, required       // 1-12
year: Number, required
salaryGroupId: String, required     // snapshot of which group was used
calculationMode: String, enum ['perMonth','perDay'], required   // snapshot
presentDays: Number, required
absentDays: Number, required
leaveDays: Number, required          // paid leave days (from isPaid LeaveType)
unpaidLeaveDays: Number, required    // unpaid leave, treated like absent for pay
holidayDays: Number, required
totalWorkingDays: Number, required   // days in month minus weekly offs
basic: Number, required
hra: Number, required
allowances: [{ name: String, amount: Number }]
grossSalary: Number, required
deductions: [{ name: String, amount: Number }]
attendanceDeduction: Number, default 0   // calculated deduction for unpaid absences (perMonth mode only)
totalDeductions: Number, required
netSalary: Number, required
status: String, enum ['DRAFT','LOCKED'], default 'DRAFT'
generatedAt: Date, default Date.now
lockedAt: Date, default null
```

### Calculation logic

**Step 1 — Pull attendance data** from DailyAttendance for the given
staff+month: count presentDays, absentDays, leaveDays (isPaid leave types),
unpaidLeaveDays, holidayDays. totalWorkingDays = days in month − Sundays (or
whatever weekly-off is configured).

**Step 2 — Resolve effective salary values** for this staff: SalaryGroup
values, with any SalaryStructure overrides applied on top.

**Step 3 — Calculate based on calculationMode:**

- **perMonth mode:**
  - grossSalary = basic + hra + sum(allowances) (full month's rate)
  - attendanceDeduction = (grossSalary / totalWorkingDays) × (absentDays + unpaidLeaveDays)
  - totalDeductions = sum(deductions) + attendanceDeduction
  - netSalary = grossSalary − totalDeductions

- **perDay mode:**
  - dailyRate = basic + hra + sum(allowances)  (per-day rate)
  - payableDays = presentDays + leaveDays (paid leave counts, unpaid/absent doesn't)
  - grossSalary = dailyRate × payableDays
  - totalDeductions = sum(deductions)  (deductions are flat, not attendance-scaled, since gross already reflects attendance)
  - netSalary = grossSalary − totalDeductions

**Step 4 — Save as DRAFT.** Admin reviews, can regenerate (overwrite DRAFT)
if attendance data changes, then LOCK when finalized. Once LOCKED, the record
is immutable — regenerating for that staff+month is blocked unless admin
explicitly unlocks first (a separate confirmed action, not a silent
overwrite).

## Backend structure
- models/salary-group.js, models/salary-structure.js, models/payroll.js
- controllers/salary-group.js (CRUD)
- controllers/salary-structure.js (CRUD, assign group to staff)
- controllers/payroll.js:
  - GeneratePayroll (POST, body: { adminId, staffId, month, year }) — runs
    the calculation above, upserts a DRAFT record (or blocks if already
    LOCKED for that staff+month)
  - GetPayrollPagination, GetSinglePayroll
  - LockPayroll (PUT /:id/lock)
  - UnlockPayroll (PUT /:id/unlock) — admin-only, requires a confirmation
    flag in the body, logged (who unlocked, when) for audit
  - BulkGeneratePayroll (POST, body: { adminId, month, year, staffIds: [] })
    — generate for multiple staff at once, same pattern as bulk operations
    elsewhere in this app (Leave bulk-apply, ClassShift bulk-assign)

## Frontend — ONE Payroll module, Fees-style top bar + settings menu

Everything Payroll-related lives under ONE sidebar entry "Payroll". Follow
the Fees page's exact top-bar pattern: a settings icon (mat-icon "settings")
opens a mat-menu with links to the two SETUP screens — "Salary Groups" and
"Assign Salary" — exactly how Fees tucks "Create Fee Structure" and "Fee
Reminder" under its settings icon instead of making them top-level tabs.

Main tabs (the day-to-day screens, always visible): "Generate Payroll" |
"Payment History"

Settings-icon menu (setup screens, used occasionally): "Salary Groups" |
"Assign Salary"

### Tab 1 — Salary Groups
- Plain table: Name, Mode (shown as "Per Month" / "Per Day" plain text, not
  raw enum), Basic, HRA, Action
- "Add Salary Group" button in the toolbar row directly above the table
- Add/Edit form: name, basic, hra inputs, a select/dropdown for Per Month vs
  Per Day (only place a select is used here — not a radio group), dynamic
  allowance/deduction rows with add/remove buttons (+ / × icon buttons, not
  a whole separate modal per row)

### Tab 2 — Assign Salary
- Plain table: Staff Name, Assigned Group (or "Not assigned"), Effective
  From, Action
- "Assign" action per row (or bulk-select + one "Assign to Selected" button,
  matching the Leave/Holiday bulk-assign pattern) — a select/dropdown to
  pick which Salary Group to assign, no radio group
- Optional override fields appear only after an "Override for this person"
  checkbox is ticked (collapsed/hidden by default) — same pattern as the
  Leave module's Advanced settings

### Tab 3 — Generate Payroll
- Toolbar row above the table: Month select + Year select (dropdowns, not
  radio buttons) + "Generate" button (single) + a bulk checkbox-select with
  "Generate for Selected" — all in the same row
- Table: Staff Name, Month/Year, Gross, Deductions, Net Salary, Status
  (Draft/Locked badge), Action (View, Lock, Unlock icon buttons)
- Clicking View opens the itemized breakdown (still within this page/tab —
  a modal or expandable row, not a navigation away from Payroll)
- Lock/Unlock actions require a confirmation step before taking effect,
  same pattern as the Leave module's Cancel confirmation checkbox

## UI/UX rules — match the app's existing simplified pattern
- Plain tables everywhere, no cards.
- NO radio button groups anywhere in this module — every choice (mode,
  month, year, status filter) is a select/dropdown.
- Toolbar (primary action button + any filters) sits directly above the
  table in one row — not scattered across the page.
- Icon-button actions (Edit/Delete/View/Lock/Unlock/Assign) live in the
  table's Action column — no separate action cards, no card-per-row layout.
- Plain-language labels: "Per Day" / "Per Month" shown to the user, not raw
  enum values like "perDay"/"perMonth".
- One obvious primary button per tab (Add Salary Group / Assign / Generate)
  — not multiple equally-weighted buttons competing for attention.

## Part 3 — Salary Payment Tracking

Once a Payroll record is LOCKED (finalized), the school still needs to
record HOW and WHEN the actual money was paid — this is separate from
generating/locking the payroll calculation itself.

### Model — SalaryPayment
```
adminId: String, required
payrollId: String, required        // reference to the LOCKED Payroll record
staffId: String, required
amountPaid: Number, required       // usually equals netSalary, but allow partial payments
paymentDate: Date, required
paymentMode: String, enum ['cash','bankTransfer','upi','cheque'], required
referenceNumber: String, trim      // transaction ID / cheque number, optional
paidBy: String, required           // adminId or the person who recorded the payment
remarks: String, trim
createdAt: Date, default Date.now
```
- A Payroll record can have multiple SalaryPayment entries if paid in
  installments (e.g. partial advance + remaining later) — sum of
  amountPaid across all SalaryPayment rows for a payrollId should equal
  netSalary once fully settled.
- Payroll gets an additional derived field (calculated, not stored) —
  paymentStatus: 'Unpaid' | 'Partially Paid' | 'Fully Paid' — based on
  summing SalaryPayment rows against netSalary.

### Backend
- controllers/salary-payment.js: RecordPayment (POST, only allowed if the
  referenced Payroll is LOCKED — payment can't be recorded against a DRAFT
  since the amount might still change), GetPaymentsForPayroll,
  GetPaymentHistory (paginated, filterable by staff/month/year/paymentMode)

### Frontend — 4th tab: "Payment History"
Add a 4th tab to the same Payroll page: "Payment History"
- Table: Staff Name, Month/Year, Net Salary, Amount Paid, Payment Status
  badge (Unpaid/Partial/Full), Payment Mode, Date, Paid By, Action
- "Record Payment" button/action on a LOCKED-but-unpaid-or-partial row,
  opens a form: Amount, Date, Mode (select dropdown, not radio), Reference
  Number, Remarks
- Filter row above the table: Month select, Year select, Payment Mode select,
  Payment Status select — all dropdowns, no radio buttons

## Part 4 — Future-Ready for Automated Payout (Razorpay Route) — DESIGN ONLY, NOT BUILT NOW

This phase does NOT integrate Razorpay or any payment gateway — that's a
separate future phase. But the SalaryPayment model and staff data should be
shaped now so automated payout can be added later without a schema rewrite.

### What to prepare now (no Razorpay code, just structure)
- Add these fields to SalaryPayment, unused for now but reserved:
  ```
  payoutMode: String, enum ['manual','automated'], default 'manual'
  payoutGatewayId: String, default null    // future: Razorpay payout/transfer id
  payoutStatus: String, enum ['pending','processing','success','failed'], default null
  ```
- Add a `bankDetails` sub-object to the Staff model area — actually, since
  CLAUDE.md's constraint says do not modify models/student.js or
  models/teacher.js, and Staff is a separate collection already introduced
  in earlier phases, add BANK DETAILS to the EXISTING Staff model (or a new
  linked `StaffBankDetails` collection if simpler to keep Staff unmodified
  too): `accountHolderName, accountNumber, ifscCode, bankName, upiId`
  — this is what a future Razorpay Route "linked account" would need. Do
  NOT build any UI validation against a live bank API right now — plain
  fields, admin enters them manually, that's it for this phase.
- Do NOT call any Razorpay API, do NOT add the razorpay npm package, do NOT
  build a "Pay Now" button that actually moves money. `paymentMode` stays
  manual entry ('cash','bankTransfer','upi','cheque') as already specified
  in Part 3 — this phase only records that a payment WAS made, it doesn't
  make one happen.

### Why this matters for a later phase
When a future "Automated Payout" phase is built, it will: read
StaffBankDetails, create a Razorpay Route linked account per staff (one-time
setup), then on LOCKED payroll trigger a split transfer to each staff's
linked account, writing back to SalaryPayment with payoutGatewayId and
payoutStatus updated via webhook. None of that is built now — this section
only ensures the current schema doesn't block it later.

## Layout reference — follow the existing Fees module pattern exactly

The Fees page (pages/admin/fees/) already has a layout worth reusing for
Payroll instead of inventing something new:

- **Top bar**: a "menu-button" label ("Payroll") on the left, filter
  dropdowns (mat-select, e.g. Month/Year) on the right, and a small settings
  icon button (mat-icon "settings") that opens a mat-menu with links to
  related pages — this is exactly how "Create Fee Structure" and "Fee
  Reminder" are tucked under Fees' settings icon instead of being separate
  top-level nav items. Do the same for Payroll: the settings icon's mat-menu
  can hold links to "Salary Groups" and "Assign Salary" tabs/views, keeping
  the main Payroll table as the primary view.
- **Table**: plain Bootstrap table (table table-hover align-middle bg-white),
  thead with bg-light and text-muted headers — match this exactly, don't
  introduce new table styling.
- **Row actions**: an inline button per row for the primary action (Fees
  uses "Collect" / "Fee Paid" as a state-dependent button) and a launch icon
  (mat-icon "launch") linking to a detail page (Fees uses this for the Fee
  Statement) — Payroll's row can use the same idea: a "Generate" button
  (or "View" once generated, state-dependent) plus a launch icon to the
  itemized payroll breakdown.
- **Modal pattern**: `div.modal.fade.show [class.show]="showModal"`,
  `mat-form-field appearance="outline"` for inputs, a submit button with
  `mat-spinner` shown during `isClick`, disabled while submitting — same
  exact modal/form conventions Fees uses, no new modal library or pattern.
- **Mobile vs desktop split**: Fees has separate `.desktop-option` and
  `.mobile-option` blocks reusing the same filters in a different layout —
  follow this same responsive pattern for Payroll's filter row instead of
  a single layout that just squishes on small screens.

Adapt this exact structure to Payroll: top bar with Month/Year selects +
settings-icon menu (linking to Salary Groups / Assign Salary), main table
of payroll rows with state-dependent action button + launch icon to detail,
same modal/form conventions for the Generate and Assign forms.

## What NOT to build
- No tax computation (TDS, income tax slabs) — out of scope for this phase
- No payslip PDF generation — Payroll data structure should support adding
  this later, but PDF export isn't built now
- No bank transfer/payment integration — DRAFT/LOCKED status only, actual
  disbursement is manual/external to this system

## Verification
1. Create a SalaryGroup "Primary Teacher" (perMonth mode, basic 20000, hra
   5000, one allowance "Transport" 1000, one deduction "PF" 1800)
2. Assign it to a staff member via SalaryStructure (no overrides)
3. Ensure that staff has some DailyAttendance data for a month (mix of
   Present/Absent/Leave from earlier phases)
4. Generate payroll for that staff+month — confirm presentDays/absentDays/
   leaveDays match DailyAttendance, and netSalary math is correct per the
   perMonth formula above
5. Create a second SalaryGroup in perDay mode, assign to another staff,
   generate payroll — confirm the perDay formula is used instead
6. Lock a payroll record, then try to regenerate it — confirm it's blocked
   with a clear message, and Unlock requires the confirmation step
7. Try bulk-generating payroll for 3 staff at once — confirm 3 separate
   DRAFT records are created correctly
