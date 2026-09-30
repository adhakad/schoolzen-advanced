# Payroll — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

| Query/endpoint | Cache key | Tier | TTL |
|---|---|---|---|
| `GET /salary-group?status=active` (Salary Groups table, and the "assignable groups" dropdown on Assign Salary) | `{adminId}:payroll:salary-groups` | §2 near-static | 30–60 min, write-invalidated |
| `GET /salary-group/:id` (single group detail behind an edit modal) | `{adminId}:payroll:salary-groups:{groupId}` | §2 near-static | 30–60 min |
| `GET /payroll?month&year&status=...` (Generate Payroll table) | **not cached** | — | `status` (`pending`/`draft`/`locked`) is exactly the field a Lock/Unlock/Regenerate action changes, and a stale cached row showing `Draft` after a Lock is the precise "action ki koi aur response aaye" bug §2 exists to prevent |
| `GET /payroll/:id` (View / itemized breakdown behind the row) | **not cached** | — | same reasoning — a locked run's numbers must always read live, and this is also the endpoint `errors.md` flags as the module's most sensitive tenant-isolation gap, so it is not a candidate for a shared cache key across requests either |
| `GET /salary-payouts?month&status=...` (Salary Payouts table) | **not cached** | — | `confirmationStatus`/paid-vs-due is derived live from `PayrollPayment` sums per `salary-payouts.md`; caching this table risks showing "Unpaid" after a payment was just confirmed |
| `GET /assign-salary?...` (Assign Salary table) | **not cached** | — | small per-school list, but "Has a personal override" and Effective From must reflect the very latest `StaffSalaryAssignment` write immediately, since Generate Payroll reads it on the very next generate |

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Add/Edit Salary Group (Salary Groups page) | `delPattern('{adminId}:payroll:salary-groups*')` |
| Delete Salary Group | `delPattern('{adminId}:payroll:salary-groups*')` — only reachable once the cascade guards in `errors.md` (assigned/payroll-history checks) pass |
| Assign/Change Salary (Assign Salary page) | no near-static key (Assign Salary list is never cached — see above); the point is the *next* Generate Payroll call for that person must see the fresh `StaffSalaryAssignment` with no cache layer in between |
| Generate / Regenerate (Generate Payroll page, play/regenerate icon) | no cache to invalidate (Payroll list/detail are never cached); the mutation response returns the fresh `PayrollRun` document per §2 so the row updates from the response, not a re-fetch |
| Lock / Unlock (Generate Payroll page) | same — never-cached list/detail means no invalidation step, but this is exactly the field §2 calls out by name ("payroll lock state") as excluded from caching on principle |
| Record Payment (Salary Payouts page) | same — `PayrollPayment` rows and the derived paid/due status are never cached |
| Confirm / Dispute (employee's own panel) | same — `confirmationStatus` is never cached |

## Pagination

| List | Field |
|---|---|
| Generate Payroll table | Keyset/cursor — per §8's original matrix, payment/run history can grow large across months and staff |
| Salary Payouts (payment history) | Keyset/cursor — same growth reasoning, payment rows accumulate every month |
| Salary Groups table | Offset — small, bounded (a school defines a handful of pay scales) |
| Assign Salary table | Offset — bounded staff roster |

## Idempotency-Key required on

- `POST /payroll/:id/lock` — synchronous, and `errors.md`'s Shape 9 confirms a real double-lock race today; the header guards a client retry on top of the conditional-write fix (`findOneAndUpdate({..., status:'DRAFT'})`) `errors.md` specifies for the write itself.
- `POST /payroll/:id/unlock` — same reasoning, and unlock additionally participates in the confirmed Unlock-vs-RecordPayment interleave `errors.md` calls the module's highest-severity finding — a retried unlock must not be a second chance for that race to occur.
- `POST /payroll/:id/generate` (and the bulk variant) — regenerate races a concurrent Lock per `errors.md`; a network-retried generate call reusing the same key avoids adding a second interleaving window on top of the one already being fixed at the write layer.
- `POST /salary-payouts/:runId/payments` (Record Payment) — the canonical synchronous financial write this module has; `errors.md` explicitly lists this pattern (Fee Collection / Payroll lock/unlock / Leave approve) as needing `Idempotency-Key` in §3's own examples, and a retried Record Payment without one is a duplicate-payment risk on top of the balance-integrity issue.
- `PUT /salary-payouts/payments/:id/confirm` and `.../dispute` — the employee-facing confirm/dispute actions are one-shot state transitions (`errors.md`'s `PAYMENT_ALREADY_ACTIONED` guard) that a flaky mobile connection can genuinely double-send.

## Real-time / precomputed aggregates

Not applicable in the §6 sense — Payroll has no standing dashboard aggregate of its own; the Dashboard module's "payroll run finishing" push (§8's Dashboard row) is the one place a Payroll event feeds a precomputed aggregate, and that precompute lives in Dashboard's own document, not here.

## Module-specific notes

- **`PayrollRun.status` (the lock state) must never be cached — this is the module's canonical instance of §2's "never cached" tier**, named there explicitly ("payroll lock state"). Every read of a `PayrollRun` — list, detail, or the Salary Payouts table's derived status — goes straight to MongoDB. This is not merely a performance default here: `errors.md`'s two confirmed races (Regenerate-vs-Lock, and RecordPayment-vs-Unlock) both stem from a stale *in-application* read of status between two operations; adding a cache layer on top of that field would give a third, independent way for the same corruption to occur, on top of the ones the errors catalog already requires fixing at the write layer.
- **Salary Payouts' `confirmationStatus`/paid-due figures are equally never-cached**, for the same reason as the lock state — a `pending` payment flipping to `confirmed` (or the hourly sweep flipping it to `expired`) must be visible on the very next read, and `salary-payouts.md` already specifies these are derived live from `PayrollPayment` sums rather than stored fields, which is the correct shape for a never-cached value.
- **Salary Group is the one genuinely safe near-static key in this module** — pay scales change rarely, and a generated `PayrollRun` snapshots its own `basic`/`hra`/`allowances`/`deductions` at generation time (per `errors.md`, "must not regress"), so a cached Salary Group being briefly stale can never retroactively corrupt an already-generated run — only the *next* generate would use it, which is exactly what write-invalidation on edit already covers.
- **Bank details (`person-bank-details.js` / the future `Staff.bankDetails` sub-object) are not cached at all**, consistent with `errors.md`'s requirement that these fields be encrypted at rest and masked on display — a cache layer would be one more place a decrypted account number could linger past its need, so this module reads bank details straight from the encrypted store on every request rather than adding a cache key for them.
