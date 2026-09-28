# Payroll — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
legacy `payroll.js`/`salary-group.js`/`salary-payment.js`/`salary-slip.js`/
`salary-structure.js`/`person-bank-details.js` controllers, cross-checked
against the legacy Angular components (`payroll`/`payroll-payment-history`/
`salary-group`/`salary-structure`). Money-critical, treated with the same
rigor as Fees/Payments: this module's backend is already unusually careful
(snapshotted payroll numbers, a real transaction on `RecordPayment`, a
settled-vs-reserved payment split) — the two gaps that do exist are a
regenerate-vs-lock race and several bare-`_id` tenant-isolation leaks, both
as serious as anything found in the other modules. Organized by the 9
shapes, one case-table per shape actually used — same precedent as
Staff/Leave.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

**Scope note**: legacy ships `person-bank-details.js` correctly tenant-scoped
(`{adminId, personType, personId}` on every read/write) with no frontend
page consuming it yet in this legacy snapshot — it is Razorpay-Route-ready
storage the payments spec calls for, not a currently-exposed leak. Treat as
"build the missing UI and access-control review," not as a confirmed bug —
see the bank-details note under Shape 4 and Backend requirements.

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Salary Group name blank | `SALARY_GROUP_NAME_REQUIRED` | "Name is required." | `CreateSalaryGroup`/`UpdateSalaryGroup` already check this |
| Basic/HRA/allowance/deduction amount negative or non-numeric | `SALARY_AMOUNT_INVALID` | "Enter a valid amount." | Legacy `salary-group.js` saves `basic`/`hra`/component amounts straight from the body with **no numeric or non-negative check at all** — a negative basic or a string silently produces a negative/NaN `netSalary` downstream in `calculatePay`, discovered only on the payslip |
| Record Payment: amount is zero, negative, or non-numeric | `PAYMENT_AMOUNT_INVALID` | "Enter a valid payment amount." | `RecordPayment` has no explicit check; a `0`/negative amount currently only fails indirectly if it happens to exceed `remaining` (it won't, since it's ≤0), so a zero-amount "payment" can be recorded today and create a confirmable-but-meaningless row |
| Record Payment: UTR/reference blank while Mode is Bank Transfer/UPI | `PAYMENT_REFERENCE_REQUIRED` | "Enter a reference/UTR number for this payment mode." | Frontend form has no conditional requirement on `referenceNumber` at all today (it is always optional); backend accepts `''` unconditionally |
| Dispute: reason blank | `DISPUTE_REASON_REQUIRED` | "Enter a reason for disputing this payment." | `DisputePayment` does `String(req.body.disputeReason).trim()` with no guard — an absent `disputeReason` becomes the literal string `"undefined"` stored as the reason, not a validation error |
| Bank details: IFSC fails format, account number non-numeric | `BANK_DETAILS_INVALID` | "Enter a valid IFSC code / account number." | `SavePersonBankDetails` saves every field as a raw string with no format check at all — an IFSC of `"abc"` or an account number containing letters saves cleanly today |

## Shape 2 — Uniqueness

| Case | Code | Message | Notes |
|---|---|---|---|
| Salary Group name already exists (case-insensitive) | `SALARY_GROUP_DUPLICATE` | "A salary group with this name already exists." | Pre-check only via `RegExp` (see Shape 9) — no unique index today; `UpdateSalaryGroup`'s check correctly excludes itself with `_id: {$ne: id}` |
| A `Payroll` already exists for this person+month+year (regenerate should update it, not create a second one) | (not an error — by design) | — | `GeneratePayroll`/`BulkGeneratePayroll` both `findOneAndUpdate`/`bulkWrite` with `upsert:true` keyed on `{adminId, personType, personId, year, month}` — a second Generate call always **updates the same document**, never inserts a duplicate. Confirmed safe by construction, not by a pre-check; this is the reference implementation for "regenerate never duplicates" and should not be re-derived differently in v2 |

## Shape 3 — Cross-field / business bound

| Case | Code | Message | Notes |
|---|---|---|---|
| Generate Payroll attempted for staff with no Salary Group assigned | `SALARY_GROUP_NOT_ASSIGNED` | "No salary group is assigned to this person!" | `GeneratePayroll` checks this correctly; `BulkGeneratePayroll` correctly skips-and-reports rather than failing the batch (Shape 7) |
| Generate Payroll: assigned Salary Group no longer exists (deleted after assignment) | `SALARY_GROUP_NOT_FOUND` | "The assigned salary group no longer exists!" | Checked correctly on both single and bulk paths |
| Generate Payroll (perMonth mode): month has zero working days | `NO_WORKING_DAYS` | "No working days found for this month. Check the roster and attendance first!" | `calculatePay` refuses explicitly rather than dividing by zero — correct as built, must not regress; a `perDay`-mode group has no such guard because its formula never divides by `totalWorkingDays` |
| Record Payment amount exceeds the run's remaining due | `PAYMENT_EXCEEDS_DUE` | "This payment exceeds the remaining balance of ₹X!" | Computed against **reserved** (settled + pending-confirmation), not settled alone — see the Critical race note below for why the read happens inside a transaction |
| Record Payment attempted when the run is already fully paid (settled+reserved) | `PAYROLL_ALREADY_PAID` | "This payroll is already fully paid!" | `remaining <= 0` inside the same transaction |
| Record Payment against a run that isn't `LOCKED` | `PAYROLL_RUN_NOT_LOCKED` | "Payment can only be recorded against a locked payroll!" | See Critical race note — this check is correct in isolation but not race-proof against a concurrent `Unlock` |
| Salary Slip generated for a run with no settled (confirmed) payment yet | `SLIP_NO_CONFIRMED_PAYMENT` | "No confirmed payment exists against this payroll yet. A salary slip can only be issued once a payment has been confirmed!" | Correct as built — a `PendingConfirmation` teacher payment does not qualify, matching the "slip documents money that moved" principle stated in the code |
| Bulk Assign Salary: an inactive Salary Group selected | `SALARY_GROUP_INACTIVE` | "This salary group is inactive and cannot be assigned!" | `loadAssignableGroup` correctly blocks both single and bulk assign; existing assignments/Payroll snapshots on a group that is later deactivated are correctly left untouched |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| Generate/Assign for a person that doesn't exist (or belongs to another school) | `PERSON_NOT_FOUND` | "This person was not found!" | Correctly scoped `{_id, adminId}` on both `GeneratePayroll` and `AssignSalary` — the pattern every other lookup in this module should copy |
| Lock/Unlock/RecordPayment/GenerateSlip on a Payroll ID that doesn't exist, or belongs to another school | `PAYROLL_NOT_FOUND` | "Payroll not found!" | `LockPayroll`, `UnlockPayroll`, `RecordPayment` and `GenerateSalarySlip` all correctly filter `{_id, adminId}` — **`GetSinglePayroll` does not**, see Critical tenant-isolation note below |
| Confirm/Dispute/view a payment ID that doesn't exist, or belongs to another teacher | `PAYMENT_NOT_FOUND` | "Payment not found!" | `loadOwnPayment` deliberately reports a wrong-owner payment identically to a missing one (never a 403) — correct, and the right precedent for every "is this yours" check in the codebase |
| `SalaryStructure` references a Salary Group that was deleted | `SALARY_GROUP_NOT_FOUND` | "The assigned salary group no longer exists — reassign this person." | Same as Shape 3's Generate-time version, surfaced instead on the Assign Salary read path |
| Bank details not yet entered for a person | (not an error — normal state) | — | `GetPersonBankDetails` correctly returns `200 null` rather than 404; the caller renders an empty form, not an error |

## Shape 6 — Cascade / in-use delete block

| Case | Code | Message | Notes |
|---|---|---|---|
| Delete a Salary Group currently assigned to any `SalaryStructure` | `SALARY_GROUP_IN_USE_ASSIGNED` | "This salary group is assigned to staff and cannot be deleted!" | `DeleteSalaryGroup` checks this correctly, but **only for existence, never a count** — must return the blocking count so the frontend can show "N staff member(s)" rather than a bare refusal, matching the Staff/Leave precedent |
| Delete a Salary Group that has generated Payroll history against it | `SALARY_GROUP_IN_USE_PAYROLL` | "This salary group has generated payroll and cannot be deleted!" | Correctly checked as a second, separate guard — deleting a group that produced historical payslips would orphan `salaryGroupId` on records that must stay readable forever. **Neither of `DeleteSalaryGroup`'s two guard queries, nor the delete itself, filters by `adminId`** — see tenant-isolation note below |
| Delete a Salary Structure (unassign) while the person's Payroll history references the group it named | (not blocked — correct by design) | — | `DeleteSalaryStructure` only removes the assignment row; every already-generated Payroll snapshotted its own `basic`/`hra`/`allowances`/`deductions`/`calculationMode` at generation time (see the header comment in `payroll.js`) and is untouched — unassigning only blocks the *next* generation, exactly as intended. This must not gain a cascade check in v2 that it does not need |

## Shape 5 — State-transition guard (this module's largest surface, alongside the concurrency section)

| Case | Code | Message | Notes |
|---|---|---|---|
| Regenerate attempted on a `LOCKED` run | `PAYROLL_RUN_LOCKED` | "This payroll is locked. Unlock it before regenerating!" | Checked via a plain `findOne` read before the upsert — **not race-proof**, see Critical race note below |
| Lock attempted on a run that is already `LOCKED` | `PAYROLL_RUN_ALREADY_LOCKED` | "This payroll is already locked!" | Read-then-write, same shape as the leave-request approve race this codebase has seen before — see Shape 9 |
| Unlock attempted on a run that isn't `LOCKED` | `PAYROLL_RUN_NOT_LOCKED` | "This payroll is not locked!" | Same read-then-write shape |
| Unlock attempted on a run with a payment already recorded against it | `PAYROLL_UNLOCK_BLOCKED_PAYMENT` | "A payment has already been recorded against this payroll and it cannot be unlocked!" | The intended safety net for "a payment must never reconcile against a number that later moves" — **this exact check is the one the Critical race note below defeats**, because the check and `RecordPayment`'s own insert are not mutually exclusive |
| Confirm/Dispute attempted by someone other than that payment's own teacher | (reported as `PAYMENT_NOT_FOUND`, never a distinct forbidden code) | "Payment not found!" | Deliberate — see Shape 4 |
| Confirm/Dispute attempted on a payment already `Confirmed`/`Disputed`/`Expired` | `PAYMENT_ALREADY_ACTIONED` | "This payment has already been {confirmed/disputed/expired}." | `guardActionable` checks stored status **and** the raw `confirmationExpiresAt` timestamp directly, correctly not relying solely on the hourly sweep having run yet — must not regress to a status-only check |

## Shape 7 — Bulk-operation row-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Bulk Generate Payroll — one or more selected people are locked / unassigned / have a group that no longer exists / hit the zero-working-days guard | `PAYROLL_GENERATE_ROW_SKIPPED` | "N of the selected {staff/teachers} were skipped." (reasons listed per row) | `BulkGeneratePayroll` already reports every skip with a specific per-person reason string rather than a blanket message or aborting the batch — correct as built, and the frontend already renders each one individually (not a summary count) rather than the "counted, not listed" precedent Leave/Staff use for cascade counts. Keep the per-name detail here; it is the reference implementation for "which of the twelve did it" |
| Bulk Assign Salary — selection includes a person id from another school or that doesn't exist | (silently excluded, not reported per-row) | — | `BulkAssignSalary` verifies every id against `{_id:$in, adminId}` in one query and simply proceeds with whoever matched; a wrong-school id vanishes with no line in the response at all, unlike Generate's per-row skip reporting. Should gain the same per-row skip reason ("Person not found") for consistency, even though the security property (a foreign id can never write) is already correct |

## Shape 8 — External-service failure

None in this module — Payroll has no biometric/SMS/payment-gateway call in this phase (Razorpay is reserved schema only, not wired). Confirmation delivery to a teacher reuses whatever in-app notification channel their login already has; no external call originates from this module's own code.

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two concurrent `Lock` calls on the SAME run | `PAYROLL_RUN_ALREADY_LOCKED` | (same as Shape 5) | Legacy `LockPayroll` is a plain `findOne` → check `!== 'LOCKED'` → `findByIdAndUpdate` with **no conditional filter on the write**. Two racing locks both read `DRAFT`, both pass, both write `LOCKED` — the end state happens to be correct (idempotent, same value), but the *existing errors.md claimed* "the loser gets `PAYROLL_RUN_NOT_DRAFT`" as if a conditional update already enforced it; the real code has no such filter. v2 must actually build `findOneAndUpdate({_id, adminId, status:'DRAFT'}, {$set:{status:'LOCKED',...}})` and return `PAYROLL_RUN_ALREADY_LOCKED` on a null result, not merely assume the harmless-looking race is guarded |
| **Regenerate races a concurrent Lock/Unlock on the same run — confirmed, not hypothetical** | `PAYROLL_RUN_LOCKED` (should abort) | "This payroll is locked. Unlock it before regenerating!" | `GeneratePayroll` reads `existing` via `findOne`, checks `status !== 'LOCKED'` in application code, computes pay, and only then writes via `findOneAndUpdate({adminId,personType,personId,year,month}, {$set:fields})` — **that filter carries no `status` condition at all**. A Lock call that lands in the gap between the read and the write succeeds normally, and the Generate call's write then proceeds anyway, silently reverting a just-locked run back to `status:'DRAFT'` with freshly recomputed numbers. This is the same class of bug as Leave's confirmed `ApproveLeaveRequest` race, in the one place in this module where snapshot-then-write matters most. Fix: make the upsert conditional — `findOneAndUpdate({..., status: {$ne: 'LOCKED'}}, {$set: fields}, {upsert:true})` — and treat a matched-but-unmodified result (or a fresh re-read showing `LOCKED`) as `PAYROLL_RUN_LOCKED`, aborting rather than silently overwriting |
| **`RecordPayment` races a concurrent `Unlock` on the same run — confirmed, defeats the unlock guard's own stated purpose** | `PAYROLL_RUN_CHANGED` | "The payroll run for this payment changed after it was recorded — please review before confirming." | `RecordPayment` reads the payroll (`status === 'LOCKED'` check) **before** opening its transaction; `UnlockPayroll` reads the payroll, finds no `SalaryPaymentModel` row yet, and unlocks — all in the gap before `RecordPayment`'s transaction commits its insert. Net effect: a payment can be inserted against a payroll that is, at the moment of insert, no longer `LOCKED`, and a subsequent Regenerate (now unblocked, since status reads `DRAFT`) can silently change `netSalary` while a payment referencing the old number already exists — exactly the corruption the `UnlockPayroll` code comment says it exists to prevent, defeated by the gap between its own read and `RecordPayment`'s commit. Fix: `RecordPayment`'s transaction must re-verify `status === 'LOCKED'` on a `findOne(...).session(session)` read taken *inside* the transaction (immediately before the balance aggregate), not rely on the pre-transaction read; alternatively, gate `UnlockPayroll` itself through the same session/transaction boundary so the two can never interleave. Either fix must ship — this is the module's most serious money-integrity gap, more damaging than a double-payment because it is silent (no error to either caller) and corrupts data that has already been treated as final |
| Two admins Record Payment on the same run at (nearly) the same moment | (second one correctly refused or clamped) | `PAYMENT_EXCEEDS_DUE` / `PAYROLL_ALREADY_PAID` | **Already correct, must not regress.** `RecordPayment` wraps its reserved-balance aggregate and its insert in one Mongo transaction — the second concurrent call's aggregate re-reads inside its own transaction and correctly sees the first call's reservation once committed (or the two serialize via Mongo's transaction conflict handling), so a double "pay 100%, then pay 100% again" cannot both land. This is the correct pattern; the racing-`Lock`/racing-`Regenerate` cases above are bugs specifically because they do NOT do this |
| Two admins create the same Salary Group name at once | `SALARY_GROUP_DUPLICATE` | (same as Shape 2) | `CreateSalaryGroup`/`UpdateSalaryGroup` guard uniqueness with a `findOne` pre-check only — needs a real unique index (`adminId`, case-insensitive collation on `name`) + `11000` catch converted to `ConflictError` |
| Two concurrent `GenerateSalarySlip` calls for the same fresh (not-yet-issued) payroll | (second one retries, no duplicate slip) | — | Already correct: the sequence-number loop catches the `11000` duplicate-key error on `slipNumber` and retries with a recomputed sequence, up to 10 attempts, rather than either failing outright or allocating two slips for the same payroll. Reference implementation for "unique sequential document number under concurrency" |
| Unescaped user search text built into a `RegExp` | `VALIDATION_FAILED` (internal 500 today) | n/a | `GetPayrollPagination`, `GetAssignSalaryPagination` (`name` search) and `GetSalaryGroupPagination`/`CreateSalaryGroup`/`UpdateSalaryGroup` (`name` dup-check) all interpolate raw `searchText`/`name` into `new RegExp(...)` with no escaping — same ReDoS/invalid-pattern class flagged across every other legacy controller reviewed this session |

---

## Critical — confirmed tenant-isolation gaps, must appear in the backend build, not be silently dropped

**`GetSinglePayroll` filters by bare `_id` with no `adminId` check at all** (`PayrollModel.findOne({ _id: req.params.id })`). This is the itemised-breakdown endpoint behind the View action — it returns full salary composition (basic, HRA, every allowance/deduction line, gross, net) plus every payment on the run. A guessed or enumerated payroll `_id` from one school returns a complete salary breakdown for a person at a *different* school, with no ownership check whatsoever. This is the single most sensitive tenant leak in the module, worse in kind than the equivalent gaps found in Staff/Leave because the payload is financial detail, not a name or a status.

**`GetPaymentsForPayroll` has the identical gap** (`SalaryPaymentModel.find({ payrollId: req.params.payrollId })`, no `adminId`) — every payment row (amount, mode, reference/UTR, who paid, confirmation state) for any payroll id, from any school, to any caller who can reach the endpoint.

**`GetSingleSalaryGroup` has the same gap** (`findOne({ _id: req.params.id })`) — lower sensitivity (a pay scale's numbers, not a named person's), but still a cross-tenant read with no check.

**`DeleteSalaryGroup` and `DeleteSalaryStructure` delete by bare `_id` with no `adminId` check**, and `DeleteSalaryGroup`'s own two cascade-guard queries (`SalaryStructureModel.findOne({salaryGroupId:id})`, `PayrollModel.findOne({salaryGroupId:id})`) are unscoped too — a guessed id from another school can be deleted outright (structure) or have its in-use guard evaluated against the wrong school's data entirely (group), though the group's cascade check happening to still block the delete in practice does not make the missing scope acceptable.

All five must be closed the same way already established for Staff/Leave: `findOne({_id, adminId})` (or the delete/cascade-query equivalent) everywhere a single record is read, updated or removed by id; wrong-tenant reported identically to genuinely missing (404, never 403).

---

## Critical — confirmed concurrency gap, must appear in the backend build, not be silently dropped

**A `RecordPayment` in flight and a concurrent `UnlockPayroll` can interleave so that a payment ends up recorded against a run that a moment later reverts to `DRAFT` and gets its numbers regenerated — silently, with no error to either caller.** Full mechanism and fix are in the Shape 9 table above (`PAYROLL_RUN_CHANGED` row). This is called out twice — once inline, once here — because it is the module's highest-severity finding: it does not merely risk a duplicate write (which the transaction on `RecordPayment` already prevents for same-run double-payment), it lets money already recorded as paid silently detach from the salary figure it was paid against, in a system where `payroll.js`'s own header comments repeatedly assert this exact scenario "cannot happen." The companion **Regenerate-vs-Lock** race in the same table is the same class of bug one level earlier in the workflow (before any money has moved) and must be fixed with the same technique: a conditional write, not a read-then-write.

---

## Backend controller requirements

- **Tenant isolation on every single-record lookup, across all five files** — see the Critical tenant-isolation section above. `GetSinglePayroll`, `GetPaymentsForPayroll`, `GetSingleSalaryGroup`, `DeleteSalaryGroup` (including its two cascade-guard queries), `DeleteSalaryStructure`. Every other single-record lookup in this module (`GeneratePayroll`, `LockPayroll`, `UnlockPayroll`, `RecordPayment`, `GenerateSalarySlip`/`GetSalarySlip`, `AssignSalary`) already does this correctly — those five are the exceptions, not the pattern, and are the ones to fix.
- **Regenerate, Lock and Unlock all become conditional writes (`findOneAndUpdate` with a `status` filter), not a read-then-write** — see both confirmed races in Shape 9. This is the module's own version of the same fix Leave's `ApproveLeaveRequest` needed: a unique index or a status-filtered update turns a race into a clean "0 rows matched" instead of a silent corruption.
- **`RecordPayment` must re-verify `status === 'LOCKED'` inside its own transaction**, immediately before the reserved-balance aggregate, not rely solely on the read taken before the transaction opens — this is the fix for the module's most serious finding (the Unlock/RecordPayment interleave).
- **Field-level validation for money inputs, currently absent everywhere they enter the system**: `SalaryGroup`'s basic/HRA/allowance/deduction amounts (`CreateSalaryGroup`/`UpdateSalaryGroup`), `RecordPayment`'s `amountPaid` (currently only bounded indirectly by the remaining-due check, so 0/negative slips through when due > 0), and `SavePersonBankDetails`'s IFSC/account-number format — none of these have a server-side numeric/format check today; all are frontend-trusted only.
- **Every uniqueness check becomes a real unique index + `11000` catch**, not a pre-check-then-write — Salary Group name (case-insensitive, scoped `adminId`), currently pre-check only on both Create and Update.
- **`DeleteSalaryGroup`'s two blocking guards must report counts**, not just a boolean refusal (`"N staff member(s) use this salary group"` / `"N payroll record(s) reference this salary group"`), matching the Staff/Leave precedent for cascade responses the frontend can build a guided flow from.
- **`BulkAssignSalary` should report per-row skip reasons for ids that fail the tenant/existence check**, matching `BulkGeneratePayroll`'s own precedent in the same file's sibling controller — currently a wrong-school or missing id is silently dropped from the write with nothing in the response.
- **Sanitize search input before building a `RegExp`** — `GetPayrollPagination`, `GetAssignSalaryPagination`, `GetSalaryGroupPagination`, and the Salary Group duplicate-name checks all interpolate raw text unescaped, same ReDoS/invalid-pattern class flagged across every other legacy controller reviewed this session.
- **Response envelope and deprecated-API cleanup** — replace every catch block's literal `'Internal Server Error!'` string with the shared typed-error middleware; replace `Model.count()` with `countDocuments()` throughout (`salary-group.js`, `payroll.js`, `salary-payment.js`, `salary-structure.js` all still call the deprecated form).
- **Everything already correct and must not regress in the rebuild**: money is rounded exactly once, at the end (`money()`), never on intermediate values; a generated Payroll snapshots its full salary composition so editing a Salary Group afterward never retroactively changes a past payslip; `resolveEffectiveSalary`'s `null`-vs-`0` override handling is exactly right and must be copied verbatim, not re-derived; `RecordPayment`'s transaction correctly prevents same-run double-payment; `GenerateSalarySlip`'s sequence-collision retry loop is the reference implementation for a unique sequential document number under concurrency; a teacher's own payment identity is always resolved from the verified JWT via `resolveTeacherIdentity`, never trusted from the request body or URL; a payment belonging to someone else reports as `PAYMENT_NOT_FOUND`, never a distinct forbidden code; person-bank-details storage is correctly tenant-scoped on both read and write.

## Frontend component requirements

- **This module's Angular components already carry the `isClick` double-submit guard on every mutating action** (Generate, Bulk Generate, Lock, Unlock, Record Payment, Generate Slip, Salary Group add/update/delete, Assign/Bulk Assign) and a proper error callback on every dropdown fetch (`getActiveGroups`, `getSchool`) — matching Leave's precedent, not Staff/Academic Setup's. Do **not** port a generic "add isClick guards" or "add error callbacks" fix into this module's plan; neither gap exists here. In particular, "Generate Payroll" — the module's single highest-risk button — is already guarded against a rapid double-click on the frontend, and the backend's upsert-on-natural-key means even a guard bypass could not create a second payroll record for the same person-month; the real generate-time risk was the Lock/Regenerate race above, not a duplicate slip from a double-click.
- **No empty-state vs error-state distinction confirmed on the Generate/Payment History/Salary Group/Assign Salary tables** — same class of gap as every other module reviewed: a genuine fetch failure and "nothing generated yet" (or "no payments this month") render identically. Must land with a real `else` branch per table, same fix as Staff/Leave/Academic Setup.
- **Bank details has no frontend page at all in this legacy snapshot** — the backend controller (`person-bank-details.js`) and the schema fields the payouts spec calls for exist, but no Angular component reads or writes them yet. v2 needs to build this screen (likely inside Assign Salary or a person's own profile), and when it does, mask the account number in the list/table view (last 4 digits only, matching the card-masking precedent used elsewhere in this codebase for payment references) rather than rendering it in full on a row that is visible to any admin with list access — there is no legacy pattern to follow here since the field was never rendered, so this is new guidance, not a fix to an existing leak.
- **Salary Group's Basic/HRA/allowance/deduction inputs have no client-side non-negative validation either** (`Validators.required` only, no `Validators.min(0)`) — mirrors the backend gap above; both should be fixed together so a negative number is rejected before the request round-trips.
- **Record Payment's amount field has `Validators.required` only, no minimum** — a `0` or negative typed value currently passes client validation and reaches the backend, which (per the Shape 1 gap above) also does not reject it explicitly today.
- **The Payment History page's Record Payment modal has no reference-number conditional requirement** — `referenceNumber` is always optional in `paymentForm`, regardless of the selected `paymentMode`; Bank Transfer/UPI should require it client-side once the backend gains the check above, so the two land together rather than the frontend silently allowing what the backend then refuses.
- **Salary slip printing reuses the existing `printContent`/inline-CSS pattern already established for Fee Receipts** — correct as built, no legacy precedent violated; flagging only that this is the reference implementation for any future printable-document page, same note Leave's catalog makes for its own reference implementations.

---

**Structure and depth follow the Staff / Leave modules' format** (`staff/errors.md`, `leave/errors.md`).
