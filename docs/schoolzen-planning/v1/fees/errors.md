# Fees — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
legacy `fees-collection.js`/`fees-structure.js`/`payment.js`/
`customer-payment.js` controllers, cross-checked against the legacy
Angular components (`admin-student-fees`/`admin-student-fees-statement`/
`admin-student-fees-structure`/`admin-fees-reminder`). Money-critical,
same rigor as Payroll: this module covers the four pages Fees, Fee
Statement, Fee Structure and Fee Reminder. Organized by the 9 shapes,
one case-table per shape actually used — same precedent as
Staff/Leave/Payroll.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Fee Structure: a particular's name or amount blank/invalid | `FEE_PARTICULAR_INVALID` | "Enter a name and a valid amount for every fee particular." | Legacy `fees-structure.js` saves the `feesType` array straight from the body with no per-item numeric check; the frontend form only checks `Object.values(item).includes(null/'')`, never that the value is a non-negative number |
| Collect Fee: amount zero, negative, or non-numeric | `PAYMENT_AMOUNT_INVALID` | "Enter a valid payment amount." | Frontend has `Validators.min(1)` on `feesAmount` (a real improvement over the legacy form, already present) but no server-side mirror in `fees-collection.js` today — must not be dropped as "the frontend already checks it" |
| Fee Reminder filter: Class not selected | `FEE_REMINDER_CLASS_REQUIRED` | "Choose a class." | Frontend `studentFilterForm` already requires `class`/`minPercentage`/`lastPaymentDays`/`lastReminderDays`/`paymentLastDate`; backend must mirror all five, not just class |
| Fee Reminder filter: percentage/day fields non-numeric | `FEE_REMINDER_FIELD_INVALID` | "Enter a valid number." | Frontend uses `Validators.pattern(/^\d+$/)`; no confirmed backend mirror |

## Shape 2 — Uniqueness

| Case | Code | Message | Notes |
|---|---|---|---|
| A Fee Structure already exists for this Session+Class+Stream+Group | `FEE_STRUCTURE_DUPLICATE` | "A fee structure already exists for this class/stream/group this session — edit it instead." | `CreateFeesStructure` has no pre-check at all today, only a possible unique-index collision surfaced as a raw 500; must become a real `(adminId, session, class, stream, group)` unique index + `11000` → `ConflictError` |

## Shape 3 — Cross-field / business bound (the module's core — this is a real ledger)

| Case | Code | Message | Notes |
|---|---|---|---|
| Payment amount exceeds total remaining due (current year + arrears) | `PAYMENT_EXCEEDS_DUE` | "This amount is more than the ₹X still due." | **Not enforced today.** `fees-collection.js` never checks `feesAmount` against `AllDueFees` before writing — a payment can currently be recorded for more than is owed |
| Payment recorded while a required prior-year arrear is unpaid and the amount would apply to current-year only | (not a rejectable error — handled by allocation logic) | — | The shared allocation function must always clear oldest-due-first; listed here so a future page doesn't reintroduce a "pick which due to pay" control that would defeat it |
| Fee Reminder: "Paid Below %" set below 0 or above 100 | `FEE_REMINDER_PERCENT_INVALID` | "Enter a percentage between 0 and 100." | |
| `fees-structure.js`'s admission-fee eligibility check reads `admissionType` off the whole students array, not the individual student | `ADMISSION_FEE_CHECK_BROKEN` (internal — fix, not a user-facing code) | — | Confirmed dead branch: `checkStudent.admissionType` is evaluated on an array, so the admission-fee-payable branch never fires for any student. Must be re-derived per-student before the numeric checks above can even run correctly |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| Collecting a payment for a student with no `StudentFeeRecord` for the current session | `FEE_RECORD_NOT_FOUND` | "This student has no fee record for the current session — check their enrollment." | |
| Fee Statement requested for a student ID that doesn't exist | `STUDENT_NOT_FOUND` | "Student not found." | Frontend `admin-student-fees-statement` has **no error callback at all** on its data-fetch call — see Frontend requirements |
| Razorpay payment webhook references a student/session not found, or not scoped to the paying party | `PAYMENT_STUDENT_MISMATCH` | "This payment could not be matched to the expected student." | `customer-payment.js`'s fee lookup has no `studentId`/session scope today — confirmed cross-student payment risk, see Critical section |

## Shape 6 — Cascade / in-use delete block

| Case | Code | Message | Notes |
|---|---|---|---|
| Delete a Fee Structure already referenced by existing `StudentFeeRecord`s | `FEE_STRUCTURE_IN_USE` | "N student fee record(s) use this structure — it can't be deleted once fees have been calculated against it." | Editing (not deleting) is the intended path once in use. **Confirmed bug**: `DeleteFeesStructure`'s dues-guard queries the wrong record set, so a structure with students still owing money can be deleted outright today — the guard must be rebuilt against the actual `StudentFeeRecord` collection for that structure's session/class/stream/group, not the set it currently checks |
| Delete a Fee Reminder filter | (none — always allowed) | "This only removes the saved filter — no reminders sent or student data are affected." | Explicitly the lightweight-delete exception, per `fee-reminder.md`; matches frontend's own dedicated (non-type-to-confirm) delete modal |

## Shape 7 — Bulk-operation row-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Fee Reminder send — one or more reviewed recipients no longer match the filter by the time the job actually runs (data changed between review and send) | `FEE_REMINDER_RECIPIENT_STALE` | "N recipient(s) were skipped — their fee status changed since you reviewed this list." | The confirmed list from Review & Send is used as-is (per the page's own rule), but a recipient whose contact number is now missing/invalid is still skipped and reported, not silently dropped |

## Shape 8 — External-service failure

| Case | Code | Message | Notes |
|---|---|---|---|
| WhatsApp/SMS provider fails to send a reminder | `NOTIFICATION_SEND_FAILED` | "Couldn't send to N recipient(s) — they'll be retried automatically." | Legacy `fees-collection.js` sends its own WhatsApp receipt notification **inside the payment's try block** — a notification failure today returns a 500 after the payment has already been recorded, making a successful collection look like a failure to the collecting staff. Must be decoupled (fire-and-forget or a queued job), never able to fail the payment response |
| PDF/print generation for a receipt or statement fails | `DOCUMENT_GENERATION_FAILED` | "Couldn't generate the document — please try again." | Both Fees and Fee Statement build their printable receipt client-side from a DOM node (`getPrintContent`/`printContent`) — no server call to fail, but a missing `schoolInfo`/`clsFeesStructure` at print time throws instead of erroring gracefully; guard the print button on those being loaded |
| Razorpay signature verification fails | `PAYMENT_SIGNATURE_INVALID` | "This payment could not be verified — please contact support before retrying." | `customer-payment.js`'s signature-mismatch branch has **no `else`** — the request never sends a response and hangs the client indefinitely. `payment.js`'s own signature check is correct and should be the reference implementation copied into `customer-payment.js`, not re-derived |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two staff record a payment for the same student at nearly the same time, together exceeding the due | `PAYMENT_EXCEEDS_DUE` | (same as shape 3) | **Confirmed TOCTOU, top priority of this whole module.** `fees-collection.js` reads the student's current paid/due balance, computes the new totals in application code, then writes them back — two concurrent payments can both read the same starting balance and one payment's effect is silently lost. Must become an atomic `$inc` on the ledger fields with a guard filter (e.g. `remaining >= amount`), never a read-modify-write; the due-check must re-read inside that same atomic operation, not from a value fetched earlier in the request |
| Retry of a payment request (network retry, double-click before a guard existed) | `PAYMENT_ALREADY_RECORDED` | "This payment was already recorded — refresh to see the latest balance." | **Confirmed bug**: `customer-payment.js` double-counts `paidFees` on retry with no idempotency check. Every payment-writing endpoint needs an idempotency key (client-generated per attempt, short-TTL server-side dedup), not just a frontend double-click guard |
| Two admins create a Fee Structure for the same Session+Class+Stream+Group at once | `FEE_STRUCTURE_DUPLICATE` | (same as Shape 2) | Needs the real unique index from Shape 2 — a `findOne` pre-check alone still races |
| Receipt numbering under concurrent payments | `RECEIPT_NUMBER_COLLISION` (internal — fix, not user-facing) | — | **Confirmed bug**: legacy assigns the receipt number via `Math.random()`, with no uniqueness guarantee at all. Must become an atomic sequence counter (same reference pattern as Payroll's `slipNumber` retry loop) scoped `(adminId)` |

---

## Critical — confirmed money-integrity gaps, must appear in the backend build, not be silently dropped

**`fees-collection.js`'s balance update is a read-modify-write race, the single highest-priority fix in this module.** Two payments recorded within the same short window can both read the pre-payment balance, and the losing write's effect disappears — money collected from a parent is not reflected in what the school's own records show as paid. Fix: atomic `$inc` with a guard condition on the write, matching the approach already specified for Payroll's balance fields.

**`customer-payment.js` (Razorpay webhook path) has three compounding gaps that must all close together**: a hardcoded Razorpay secret in source (must move to environment configuration), a signature-mismatch branch with no `else` (the request hangs — every branch must end in a response), and a fee lookup with no `studentId`/session scope, meaning a payment can currently post to an arbitrary student's balance rather than the one who actually paid. `payment.js` in the same batch has the correct signature-check pattern (an earlier claim that it was missing was wrong) and should be the copied reference, not re-derived independently.

**Retry double-counting is confirmed, not hypothetical.** A payment retried after a dropped response (network blip, impatient double-click before any guard) currently adds `paidFees` a second time in `customer-payment.js`. Every payment-recording endpoint needs an idempotency key, checked server-side with a short TTL, so a retried request is a no-op rather than a second credit.

**`fees-structure.js`'s admission-fee eligibility check is evaluated on the wrong shape of data** (`checkStudent.admissionType` read off an array instead of the individual student), so the admission-fee branch silently never fires — a per-student re-derivation is required before this logic can be trusted for anything downstream (concession checks, receipts).

**`DeleteFeesStructure`'s in-use guard queries the wrong record set**, so a Fee Structure can be deleted while students still owe money against it — this must be rebuilt against the actual `StudentFeeRecord`s for that structure's exact session/class/stream/group before the delete is allowed.

**`payment.js` trusts amount/plan entitlements verbatim from the client without verifying them against the original signed order** — a resubmitted request with inflated entitlements is not caught today. Entitlements must be re-derived server-side from the stored order, never accepted as sent.

---

## Backend controller requirements

- **Fix the balance read-modify-write in `fees-collection.js` with an atomic `$inc` + guard filter** — this is the module's top-priority fix (see Critical section).
- **Field-level validation for money inputs, currently absent**: `fees-structure.js`'s particular name/amount pairs, and `fees-collection.js`'s `feesAmount` (frontend-only today via `Validators.min(1)`, no server mirror) — both need server-side numeric/non-negative checks.
- **`PAYMENT_EXCEEDS_DUE` must actually be enforced** — `fees-collection.js` does not check the payment amount against the remaining due today; this must be added as part of the same atomic write that fixes the TOCTOU race, not a separate pre-check.
- **Every payment-writing endpoint (`fees-collection.js`, `customer-payment.js`, `payment.js`) needs an idempotency key** to close the confirmed retry double-count bug.
- **`customer-payment.js` needs three fixes shipped together**: move the Razorpay secret to environment configuration, add the missing `else` on signature mismatch so every branch returns a response, and scope the fee lookup by `studentId`+session so a payment can never post to the wrong student's balance.
- **`payment.js` must re-derive amount/entitlements from the stored order**, never trust them as submitted by the client.
- **Re-derive `fees-structure.js`'s admission-fee eligibility per student**, not off the students array as a whole.
- **Rebuild `DeleteFeesStructure`'s in-use guard against the correct `StudentFeeRecord` set**, and report the blocking count (matching the Staff/Leave/Payroll precedent), not a bare refusal.
- **`CreateFeesStructure`'s uniqueness check becomes a real unique index + `11000` catch**, not undefined/absent behavior today.
- **Receipt numbering becomes an atomic sequence counter**, replacing the current `Math.random()` assignment — same reference pattern as Payroll's `slipNumber` retry loop.
- **Decouple the WhatsApp receipt notification from the payment's own transaction/try-block** in `fees-collection.js` — a notification failure must never turn a successful payment into a 500 response.
- **Tenant isolation on every single-record lookup** across all four controllers, following the pattern already established in Staff/Leave/Payroll (`findOne({_id, adminId})`, wrong-tenant reported identically to missing, never a 403).
- **Fee Reminder's `POST /:id/send` must stay a queued job** (BullMQ), never synchronous inside the request, with the reviewed recipient list passed in as the job's input rather than re-resolved inside the worker — per `fee-reminder.md`, not a new requirement, but must not regress.
- **Data-modeling gaps (this pass):**
  - `fees.md`'s `StudentFeeRecord` and `FeePayment` schemas never mention `deletedAt`, even though `_core/database-design-principles.md` names "Fees" explicitly among the financial/historical records that must be soft-deleted, never hard-deleted. Add the flag to both schemas and confirm no handler ever issues a real delete against either collection.
  - `fee-reminder.md`'s `POST /:id/send` BullMQ job has no idempotency key called out anywhere in its description — `_core/database-design-principles.md`'s idempotency-key rule names "WhatsApp bulk send" as one of its own worked examples. Unlike Payroll's generate job (idempotent by virtue of its upsert-on-natural-key write), a WhatsApp send is a one-way side effect with no natural dedup: a worker crash-and-retry mid-batch can re-message recipients already sent to in the failed attempt. Needs an explicit per-recipient/job dedup key, not just the after-the-fact `lastReminderSentAt` bulkWrite.

## Frontend component requirements

- **The Collect Payment button on the Fees page already has a real double-submit guard** (`isClick` + `collectingStudentId`, disabling the button and showing a spinner) and the submit action itself checks `isClick` before proceeding — this is correctly built already and must not be re-guarded or regressed. Given this is the module's single highest-risk button (backed by a confirmed server-side double-count bug), this guard is necessary but not sufficient on its own — it only prevents a client-side rapid double-click, not a network-level retry, which is why the backend idempotency key above is still required.
- **Fee Structure's Create/Update/Delete actions are also already guarded with `isClick`** — same standard, correctly built, not a gap to fix.
- **Fee Reminder's Filter/Send Now/Save Filter/Delete actions each have their own dedicated submission flag** (`isFilterClick`/`isSendNowClick`/`isSaveFiltersClick`/`isDeleteClick`) — correctly built per-action rather than one shared flag, matching the per-row-id precedent from Student/Staff; not a gap.
- **The Fee Statement page has no error callback at all on its main data-fetch call** (`singleStudentFeesCollectionByStudentId`) — a failed request leaves `loader` permanently `true` (it is only ever set `false` inside the success path's `processData()`), so a genuine fetch failure renders as an infinite spinner rather than any error state. This must gain a real error callback that stops the loader and shows a retry/error message, the same class of gap already fixed elsewhere in this codebase (Student/Staff/Leave/Payroll tables).
- **No empty-state vs error-state distinction on the Fees table, Fee Structure list, or Fee Reminder filter list** — "no students in this class" and "the request failed" currently render identically (an empty table body); needs a real `else` branch per list, same fix as every other module.
- **The dropdown-feeding fetches (`getClass`, `getSchool`, `getAcademicSession`) across all four pages have no error callback** — a failed fetch leaves a dropdown silently empty with no indication anything went wrong, same gap flagged for Student/Staff.
- **The Collect Fee amount field has a client-side minimum (`Validators.min(1)`) but no maximum tied to the actual due amount** — the modal shows the due breakdown for reference, but nothing stops an amount greater than the due from being typed and submitted; once the backend gains the `PAYMENT_EXCEEDS_DUE` enforcement above, the frontend should reject client-side too so the two land together.
- **Fee Reminder's Review & Send modal already implements the confirm-before-dispatch pattern the page spec requires** (checkbox-selectable live list, re-run on open) — correctly built, no gap here.
- **Receipt/statement printing reuses the `printContent`/inline-CSS DOM-node pattern already established for Fee Receipts and Payroll slips** — correct as built, but neither page guards the print button against `schoolInfo`/`clsFeesStructure` still being unloaded, which can throw rather than fail gracefully; add a loaded-check before enabling Print.

---

**Structure and depth follow the Staff / Leave / Payroll modules' format** (`staff/errors.md`, `leave/errors.md`, `payroll/errors.md`).
