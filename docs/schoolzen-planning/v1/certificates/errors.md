# Certificates — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
`issued-transfer-certificate.js` controller (the only backend file this
module has — there is no separate `transfer-certificate.js` or
`tc-structure.js` controller in the legacy codebase; `TcStructure` and
its atomic `nextSerialNumber` counter described in `generate-tc.md`/
`tc-structure.md` do not exist in code at all — they are new-for-v2
design, not a port) and the legacy Angular
`transfer-certificate.component.ts`/`.html` (Issue TC) and
`issued-transfer-certificate.component.ts`/`.html` (issued list).
The module's real shape is far more serious than either planning doc
implies: **"issuing a TC" in the real backend means permanently
`findByIdAndRemove`-ing the `Student` document itself**, not flipping
a status flag — and that hard delete, plus the serial number, plus the
delete-confirmation guard, all have tenant-isolation and concurrency
holes. Organized by the 9 shapes, one case-table per shape actually
used — same precedent as Leave/Academic Setup/Holiday.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Issue TC form: Last Exam Status / Reason for Leaving / General Conduct blank or non-alphabetic | `TC_FIELD_INVALID` | "Enter a valid value using letters only." | Enforced only by the Angular form's `Validators.pattern`/`required` — `CreateIssuedTransferCertificate` has **no server-side validation at all**, not even a required check on `name`/`studentId`; a direct API call with an empty body still deletes the student it's pointed at |
| Total Working Days > 365, or Total Presence Days > Total Working Days | `TC_ATTENDANCE_RANGE_INVALID` | "Presence days cannot exceed working days, and working days cannot exceed 365." | Frontend-only (`getTC()`), never re-checked server-side — a crafted request can create a TC record with impossible attendance numbers |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| Issue TC for a student ID that doesn't exist, or belongs to another school | `NOT_FOUND` | "This record no longer exists." | `CreateIssuedTransferCertificate` calls `StudentModel.findByIdAndRemove(id)` with **no `adminId` filter at all**. If the student is already gone (already issued, or a bad/guessed ID), `findByIdAndRemove` resolves `null`, the whole `if (deleteStudent)` block is skipped, and the handler **falls off the end without calling `res.json`/`res.status` at all** — the request hangs until the client times out instead of getting a 404. Must add an `adminId`-scoped existence check up front and always respond |
| Delete an Issued TC record by an ID that doesn't exist, or belongs to another school | `NOT_FOUND` | "This record no longer exists." | `DeleteIssuedTransferCertificate`'s `findByIdAndRemove(id)` is also **not scoped by `adminId`** — a guessed `_id` from one school can delete another school's issued-TC record |

Wrong-tenant is always reported identically to genuinely missing — never a 403.

## Shape 6 — Cascade / in-use delete block

| Case | Code | Message | Notes |
|---|---|---|---|
| **Issuing a TC** | (today: irreversible hard delete, no reconciliation) | — | **This is the module's central finding.** The planning docs describe TC issuance as a state transition (a student becomes "left," stops appearing in active-roster operations). The real code does something stronger and more dangerous: it **permanently deletes the `Student` document** (`findByIdAndRemove`), then best-effort deletes that student's `AdmitCard`, `ExamResult`, and `FeesCollection` rows. Three consequences: (1) it is correctly irreversible-by-omission from active rosters — a deleted student can't appear in attendance/fee/promotion queries because there is no student to find — but that's a side effect of destruction, not a designed status flag, so there is no "undo an accidental TC issue" path at all; a mis-click permanently erases the student's admission record. (2) **`DailyAttendance`/attendance history for that student is never touched** — no delete, no anonymize, no reconciliation call — so every past attendance row is left pointing at a `studentId` that no longer resolves to anything, silently breaking historical class attendance reports for that day/term. (3) The guard used to decide whether the create happened, `if (deleteAdmitCard \|\| deleteExamResult \|\| deleteFeesCollection)`, is checking three Mongoose `deleteOne` results that are **always truthy objects** (`{acknowledged, deletedCount}`) regardless of whether anything actually matched — so the condition is always true and the second, identical `create()` call directly below it is dead code that can never run. Cosmetic today, but a maintenance trap |
| Deleting the most-recently-issued TC | `LAST_TC_LOCKED` | "The most recently issued transfer certificate cannot be deleted to maintain accurate records!" | `DeleteIssuedTransferCertificate` finds "most recent" via `IssuedTransferCertificateModel.findOne({}).sort({_id:-1})` with **no `adminId` filter** — on a multi-tenant deployment this compares the requested ID against the single globally-newest record across *every* school, not this school's newest. In practice this means the lock either fires on the wrong record (blocking a delete that should be allowed) or fails to fire on this school's actual last TC (letting it be deleted) whenever any other school has issued a TC more recently. Must re-scope to `findOne({adminId}).sort({_id:-1})` |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| **Serial number generation is not race-safe — and there is no server-side generation at all** | (today: fully client-supplied) | — | `generate-tc.md`/`tc-structure.md` describe a `TcStructure.nextSerialNumber` counter incremented transactionally on issue — **none of that exists in the real codebase.** The actual flow: the class roster fetch (`studentPaginationList`) returns a `serialNo` in its response, the frontend stashes it on the component (`this.serialNo`), and `printStudentData()` copies it onto the payload (`singleStudentInfo.serialNo = this.serialNo`) sent to `CreateIssuedTransferCertificate`, which stores whatever number arrives verbatim — no uniqueness check, no atomicity, no re-derivation server-side. This is a **worse** version of the `Math.random()` fee-receipt-numbering gap elsewhere in this codebase: that pattern at least generates the number server-side per request; here the number is minted once on a list-page load and can go stale or collide the moment two TCs are issued in the same session or by two admins at once, producing duplicate `serialNumber`s on two different `TransferCertificate` records. The v2 rebuild must implement the `TcStructure.nextSerialNumber` design from scratch — this is genuinely new work, not a port — with a real unique index or atomic `findOneAndUpdate($inc)` |
| **Double-issuing the same student's TC (double-click / retry on "Issue")** | `CONFLICT` today: hangs instead | — | The Issue-TC confirmation button (`printStudentData`) has **no `isClick`/disabled guard** anywhere in the component or template — the only `[disabled]` binding on that flow is the earlier form's `!tcForm.valid`, not the final submit action. Two rapid clicks (or a client retry after a slow response) fire `CreateIssuedTransferCertificate` twice for the same student ID. Whichever request wins the race deletes the student and issues the TC normally; the loser's `findByIdAndRemove` returns `null` and — per the Shape-4 finding above — the handler never responds, leaving the second request hanging rather than failing cleanly. Needs both defenses per the catalog's ordering: prevent client-side (disable the button on submit, matching every other mutating action's `isClick` pattern) and detect server-side (a conditional delete plus an explicit "already issued" response instead of falling through silently) |
| Two admins delete the same "last issued" TC's neighbor at once | `LAST_TC_LOCKED` | (same as Shape 6) | The recency check is itself a `findOne` snapshot with no lock — combined with the missing `adminId` scope above, this is a real TOCTOU gap, not just a cross-tenant one |

---

## Critical — tenant-isolation gap on every mutating operation in this module

**`issued-transfer-certificate.js`**: `CreateIssuedTransferCertificate`'s `StudentModel.findByIdAndRemove(id)`, `DeleteIssuedTransferCertificate`'s `findByIdAndRemove(id)`, and its "last issued" lookup (`findOne({}).sort(...)`) all trust a bare `_id`/global query with **no `adminId` check** — unlike `countIssuedTransferCertificate` and `GetIssuedTransferCertificatePagination`, which both correctly scope by `adminId`. This is the inverse of the usual pattern (reads scoped, writes not), and it's the writes that matter most here: a guessed or enumerated student `_id` from another school can be deleted — permanently — by this admin's Issue-TC action.

---

## Backend controller requirements

- **Tenant isolation on every write** — scope `CreateIssuedTransferCertificate`'s student lookup, `DeleteIssuedTransferCertificate`'s target lookup, and its "last issued" recency check all to `adminId`. The single largest gap in this module, and the most damaging given the writes are destructive.
- **Never let a handler fall through without responding.** `CreateIssuedTransferCertificate` must explicitly branch on "student not found" (404) vs. success, rather than silently no-op-ing when `findByIdAndRemove` returns `null`.
- **Redesign TC issuance as an explicit state transition, not a bare `Student` delete.** At minimum: decide and document what happens to attendance history (soft-delete/tombstone the student with a `status: 'TC_ISSUED'` flag that active-roster queries already filter on, rather than removing the document), so historical attendance/exam/fee reports don't silently lose the student's name. If a hard delete is kept for the student record itself, attendance rows for that student must be explicitly handled (archived or reconciled), not left orphaned.
- **Build the `TcStructure.nextSerialNumber` mechanism from scratch** with a real atomic increment (`findOneAndUpdate` with `$inc`, in the same transaction as the `TransferCertificate` create) or a unique index with an `11000` retry — the legacy code has no equivalent to extend, so this is new, not a port, and must not repeat the client-supplied-number pattern.
- **Add field-level validation server-side** for the Issue-TC payload (required fields, attendance day bounds) — today it exists only in the Angular form and is fully bypassable.
- **Fix (or remove) the dead-code branch**: the `if (deleteAdmitCard || deleteExamResult || deleteFeesCollection)` check on `deleteOne` results is always truthy and should be replaced with a real check (`.deletedCount > 0`) or dropped along with the unreachable duplicate `create()` call beneath it.

## Frontend component requirements

- **No double-submit guard on the Issue-TC confirmation button** (`printStudentData`, the click that actually creates the TC and deletes the student) — the highest-severity frontend gap in this module given what a duplicate call does server-side today. Needs the same `isClick`-style guard every other mutating action in this app uses, disabling the button for the duration of the request.
- **`getIssuedTransferCertificate` (the issued-list paginated fetch) has no error callback** — same pattern flagged in Holiday/Leave: a failed fetch leaves the table on stale data, and `ngOnInit`'s `setTimeout(() => loader = false, 1000)` clears the spinner on a fixed delay regardless of whether the promise resolved or failed underneath it.
- **`CreateIssuedTransferCertificate`'s error callback surfaces the raw `err.error`** (`errorMsg = err.error`) directly to the template with no safe-wording — matches this module's backend returning a bare `'Internal Server Error!'` string rather than the catalog's structured error shape; both ends need to converge on the standard `ApiError` response in the rebuild.
- **The issued-list Delete confirmation ("Ok") button also has no disabled/in-flight guard**, though lower severity since the backend's recency lock (once tenant-scoped) limits the blast radius to non-latest records.
- **`serialNo` is read once from the class-roster page load and carried on the component for the lifetime of that session** (`this.serialNo = res.serialNo`) rather than being fetched fresh at issue time — compounds the backend concurrency gap above; even after the backend is fixed to generate the number atomically, the frontend must stop pre-fetching and caching it client-side.

---

**Structure and depth follow the Leave / Academic Setup / Holiday modules' format** (`leave/errors.md`, `academic-setup/errors.md`, `holiday/errors.md`).
