# Payroll Module — Complete Spec (Bug Fix + Architecture + Slip + Payment Confirmation)

This file contains four parts, to be implemented together:
- Part A: Mid-month payroll calculation bug fix
- Part B: Lazy-route architecture (separate modules for Payroll/Payment History/Salary Group/Salary Structure, links inside settings gear icon)
- Part 1 (Slip): MNC-style Salary Slip layout
- Part 2 (Payment): Two-party payment confirmation flow (24-hour expiry, single-document audit trail)

---

# Payroll — Mid-Month Calculation Fix + Lazy-Route Architecture

## Part A — Mid-month payroll calculation bug fix

Bug: Payroll generation calculates totalWorkingDays only up to today's date
within the month, not the full month.

Fix:
1. totalWorkingDays must always be calculated for the ENTIRE month (1st to
   last date), derived from Roster (working days minus roster-off days)
   MINUS any assigned Holiday dates for that person in that month — same
   holiday-lookup.js logic already used in attendance-reconcile.js.
2. For the CURRENT month (still in progress, some dates in the future): for
   the remaining future dates, check the existing approved Leave map for
   that person — if a future date already has an approved Leave covering
   it, count it toward leaveDays (using the same paid/unpaid logic already
   in the Leave module), not as an unknown/pending day. Future dates with
   no leave and no holiday remain "pending" (not yet counted as present or
   absent) since attendance hasn't happened yet.
3. Add a clear warning on the frontend and API response when generating
   payroll mid-month: "This month is still in progress — X day(s) remain
   (Y of which are already covered by approved leave). Salary is
   calculated on the full month's working days, but attendance for the
   remaining Z day(s) is not yet final."
4. Allow generation to proceed as a DRAFT estimate. Recommend regenerating
   (if not yet LOCKED) once the month ends and all attendance is final, so
   the actual worked/absent days replace the projection.

---

## Part B — Payroll module architecture: separate lazy routes (product-grade)

Replace the current single-component-with-tabs Payroll page with a proper
lazy-loaded module structure, matching Angular/production best practices
for performance and maintainability. This mirrors how independent feature
areas in this codebase (e.g. Fees vs Fees Structure vs Fees Reminder) are
already separate routed modules rather than one giant component with
internal view-switching.

### Why this matters (the actual engineering reason, not just "best practice")
- A single component holding Generate Payroll + Payment History + Salary
  Groups + Assign Salary means ALL of that code, all four HTTP services, and
  all four forms load into the browser bundle the moment a user visits
  ANY of these screens — even if they only ever use one.
- Lazy routes mean Angular only downloads and initializes the JS for the
  screen the user actually navigates to. First paint is faster, and each
  screen's change-detection scope stays isolated (editing a Salary Group
  row doesn't re-render the Payment History table sitting in the same
  component tree).
- It also matches this codebase's own established pattern: every existing
  feature (Shift, Roster, Leave Type vs Leave Request, Fees vs Fees
  Structure) is already its own lazy-loaded module with its own routing
  file — Payroll should follow the same convention, not invent a new one.

### New structure

```
pages/admin/payroll/                    -> Generate Payroll (main/default view)
pages/admin/payroll-payment-history/    -> Payment History
pages/admin/salary-group/               -> Salary Groups
pages/admin/salary-structure/           -> Assign Salary
```

Each is a fully independent Angular feature module, following this
codebase's New Module Checklist exactly:
- `<name>.component.ts/html/css`
- `<name>-routing.module.ts`
- `<name>.module.ts` (imports CommonModule + its own RoutingModule +
  AdminSharedModule)

### Routing (app-routing.module.ts)

```
{ path: 'admin/payroll', loadChildren: () => import('.../payroll/payroll.module').then(m => m.PayrollModule), canActivate: [AdminAuthGuard] },
{ path: 'admin/payroll/payment-history', loadChildren: () => import('.../payroll-payment-history/payroll-payment-history.module').then(m => m.PayrollPaymentHistoryModule), canActivate: [AdminAuthGuard] },
{ path: 'admin/payroll/salary-group', loadChildren: () => import('.../salary-group/salary-group.module').then(m => m.SalaryGroupModule), canActivate: [AdminAuthGuard] },
{ path: 'admin/payroll/salary-structure', loadChildren: () => import('.../salary-structure/salary-structure.module').then(m => m.SalaryStructureModule), canActivate: [AdminAuthGuard] },
```

### Navigation between them (this is the part that must NOT feel disjointed)

Even though these are now separate routed modules, the USER EXPERIENCE must
still feel like one cohesive "Payroll" section, exactly like the Fees
top-bar pattern already in this app:

- The main `/admin/payroll` (Generate Payroll) page keeps the same
  Fees-style top bar: menu-button label "Payroll", Month/Year filter
  selects, and a settings gear icon.
- The settings gear's mat-menu now holds THREE links instead of Payment
  History being a tab:
  - "Payment History" → routerLink to `/admin/payroll/payment-history`
  - "Salary Groups" → routerLink to `/admin/payroll/salary-group`
  - "Assign Salary" → routerLink to `/admin/payroll/salary-structure`
- Each of the three sub-pages (Payment History, Salary Groups, Assign
  Salary) shows a simple "← Back to Payroll" link/button near its own
  top-bar menu-button, using routerLink back to `/admin/payroll`, so
  navigation is never a dead end.
- Do NOT show a full navbar tab strip across all four pages — that would
  recreate the "one big component" problem via routing. Keep each page's
  top bar minimal and specific to that page's own action (Generate button
  on Payroll, Record Payment button on Payment History, Add button on
  Salary Group, Assign button on Assign Salary).

### Sidebar entry
- Single "Payroll" sidebar link still points to `/admin/payroll` (Generate
  Payroll) as the default landing page — the other three are reached via
  the settings menu described above, not via separate sidebar entries
  (keeps the sidebar itself uncluttered, matching how Fees Structure/Fees
  Reminder aren't separate sidebar items either).

### Data/service layer
- Each new module gets its own thin Angular service
  (`payroll.service.ts`, `payroll-payment-history.service.ts` — or reuse
  existing `salary-group.service.ts` / `salary-structure.service.ts` if
  they already exist from the earlier Payroll phase) — do not share one
  giant service across all four; each module fetches only what it needs.
- Backend routes/controllers stay as already built — this is a frontend
  architecture change only, no backend restructuring needed for this part.

### Migration steps
1. Extract the existing Payment History tab's template/logic into its own
   new component + module + routing file.
2. Extract Salary Groups tab similarly.
3. Extract Assign Salary tab similarly.
4. Slim the existing Payroll component down to just the Generate Payroll
   table + the settings-menu links to the three new routes.
5. Update app-routing.module.ts with the three new lazy routes.
6. Remove the now-unused tab-switching logic from the original component.
7. Verify all four pages independently load correctly via direct URL
   navigation (not just via the settings menu) — this confirms they are
   truly independent lazy routes, not still coupled to the parent
   component's state.
# Salary Slip — MNC-Style Layout + Two-Party Payment Confirmation

## Part 1 — Salary Slip Layout (approved design)

Do NOT follow the Fees Receipt's visual layout — only reuse its underlying
mechanism (reading school info from School profile, the print/PDF trigger
pattern from print-pdf service). The visual design must look like a
corporate payslip (TCS/Infosys style), not a fee receipt or admit card.

### Layout structure (single page, professional)

**Header strip** (dark navy background, white/dark text):
- School logo + name (bold) + affiliation number + address, left-aligned
- "PAYSLIP" title + month/year, right-aligned

**Meta strip** (light grey background, thin row):
- Slip Number (left) — format: `SLP-{schoolShortCode}-{YYYYMM}-{sequence}`
- Generated timestamp (right)

**Employee info block** (2-column grid, compact):
- Employee Name, Employee ID, Designation, Department, Pay Period,
  Pay Mode (Per Day/Per Month)

**Attendance summary strip** (light grey background, horizontal row of
numbers): Present, Leave, Absent, Holiday, Working Days — each as a bold
number with a small label underneath, evenly spaced

**Earnings & Deductions** (two-column table side by side):
- Left column "EARNINGS": Basic, HRA, each allowance line item, then a
  bold "Gross Earnings" subtotal row
- Right column "DEDUCTIONS": each deduction line item, Attendance
  Deduction (if applicable), then a bold "Total Deductions" subtotal row

**Net Pay banner** (full-width, dark navy background, white text): "NET PAY"
label + large bold amount, right-aligned or centered

**Amount in words** (small italic line below the banner) — reuse the
existing `numberToWords` pipe

**Payment info row** (3-column): Payment Date, Payment Mode, Reference
Number

**Footer**:
- Left: signature line + "Authorized Signatory" label (blank line for
  physical/wet signature, OR pull a signatory name from School profile if
  such a field already exists there — don't add a new School profile field
  for this)
- Right: small digital footprint text — "This is a system-generated
  payslip. Generated by {generatedBy} on {timestamp}. Slip Reference:
  {slipNumber}"
- Bottom center, small muted text: "This is a computer-generated document
  and does not require a physical signature."

### Color/style notes
- Primary accent color: dark navy (#1F3864 or similar — a professional,
  serious tone, not the Fees Receipt's styling)
- Clean sans-serif font (Arial/Helvetica), small font sizes (10-14px) to
  keep everything on one page
- No decorative borders, no icons beyond what's structurally needed — this
  should look serious and official, matching how real corporate payslips
  look

---

## Part 2 — Two-Party Payment Confirmation Flow

A payment is not marked "Paid" the moment admin records it. It goes through
a confirmation step where the employee (staff/teacher) must acknowledge
receipt, so there's a mutual record and no one-sided claim of payment.

### New status flow for SalaryPayment

```
Admin records payment → status: 'PendingConfirmation'
  → Employee confirms receipt (within 24 hours) → status: 'Confirmed'
  → Employee does NOT respond within 24 hours → request expires, removed
  → (Optional) Employee disputes → status: 'Disputed' (flagged for admin review)
```

### Model changes — SalaryPayment

Add these fields to the existing SalaryPayment model:
```
confirmationStatus: String, enum ['PendingConfirmation','Confirmed','Disputed','Expired'], default 'PendingConfirmation'
confirmationRequestedAt: Date, default Date.now
confirmationExpiresAt: Date   // set to confirmationRequestedAt + 24 hours at creation
confirmedAt: Date, default null
confirmedByDeviceInfo: String, default null   // basic footprint: user agent or IP, whatever's already logged elsewhere in this app for similar actions
disputeReason: String, default null
```

**Important — no separate document for the transaction footprint.** All of
this lives directly on the SAME SalaryPayment record — do not create a
second "PaymentConfirmation" or "TransactionLog" collection. The record IS
the audit trail: it already captures who recorded it (paidBy), when, how
much, by what mode, AND now who confirmed it and when. One document, one
source of truth, both sides' footprint on the same row.

### Backend

1. `RecordPayment` (existing, from Part 3 of the earlier payroll spec):
   after creating the SalaryPayment row, set `confirmationStatus:
   'PendingConfirmation'`, `confirmationExpiresAt: now + 24h`. Trigger a
   notification to the employee (reuse whatever notification mechanism
   this app already has for teacher-facing alerts — Socket.io if
   applicable, or a simple in-app notification/badge on the teacher panel
   — check what exists before building something new).

2. New endpoint — `ConfirmPayment` (PUT /:id/confirm), restricted to the
   employee themselves (personType+personId must match req.user's
   identity from the JWT — teacher confirms via teacher auth, staff would
   need a staff login if one exists, otherwise admin confirms on their
   behalf with a note — check what login options actually exist for
   'staff' in this app before assuming a staff-side confirmation UI is
   possible):
   - Reject if `confirmationExpiresAt` has passed — return 400 "This
     payment confirmation request has expired."
   - Reject if already Confirmed or Disputed.
   - Set `confirmationStatus: 'Confirmed'`, `confirmedAt: now`,
     `confirmedByDeviceInfo`.
   - Only once `confirmationStatus: 'Confirmed'` does the Payroll's
     derived `paymentStatus` (Unpaid/Partial/Full, from the earlier spec)
     actually count this payment toward the paid total. A
     'PendingConfirmation' or 'Expired' payment does NOT count as paid
     yet — this is what prevents a one-sided "I paid" claim from being
     treated as settled before the employee agrees.

3. New endpoint — `DisputePayment` (PUT /:id/dispute), same
   restriction, body `{ disputeReason }`: sets `confirmationStatus:
   'Disputed'`. This flags it for admin review — does not auto-remove or
   auto-resolve; admin must manually investigate and either re-record a
   corrected payment or resolve some other way (out of scope to build a
   full dispute-resolution workflow here — just capture that a dispute
   was raised, with the reason, on the same record).

4. A scheduled job (reuse the existing node-cron setup in
   `cron-job.js`, following its pattern) runs periodically (e.g. every
   hour) and finds SalaryPayment rows where
   `confirmationStatus: 'PendingConfirmation'` AND
   `confirmationExpiresAt < now`, and sets `confirmationStatus: 'Expired'`.
   An Expired payment does NOT count toward Payroll's paid total either —
   admin must re-record the payment (creating a fresh
   PendingConfirmation cycle) if the employee still needs to receive it.

### Frontend

**Admin side (Payment History page)**:
- Payment rows show `confirmationStatus` as a badge: Pending Confirmation
  (yellow), Confirmed (green), Disputed (red), Expired (grey)
- A Disputed row shows the dispute reason on hover/click and needs a
  manual admin action to resolve (e.g. delete the disputed record and
  re-record correctly) — no automated resolution built here

**Employee side (Teacher panel primarily, since that's the existing
login)**:
- Add a "Salary" or "Payments" section (if one doesn't exist yet — check
  the teacher panel's existing structure) showing any
  `PendingConfirmation` payment awaiting their action
- Two buttons: "Confirm Receipt" and "Dispute" (with a reason text field
  if Dispute is chosen)
- Show the countdown/expiry clearly: "This confirmation request expires
  in X hours" so the employee knows the 24-hour window
- Once Confirmed or Expired, the item moves out of the pending list into
  a simple payment history view for that employee (read-only)

### What NOT to build here
- No separate audit-log collection — everything stays on SalaryPayment
  as specified above
- No automated dispute resolution — disputes are a manual admin
  follow-up, just flagged and captured
- No push notification service if one doesn't already exist in this
  codebase — use whatever in-app notification mechanism is already
  established (check before adding a new one)

