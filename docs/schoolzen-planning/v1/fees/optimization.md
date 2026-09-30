# Fees — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

| Query/endpoint | Cache key | Tier | TTL |
|---|---|---|---|
| `GET /fee-structure?session&class&stream&group` (Fee Structure table, and the read every `StudentFeeRecord` creation/rollover derives `totalFee` from) | `{adminId}:fees:structure[:sessionId]` | §2 near-static | 30–60 min, write-invalidated |
| `GET /fee-structure/:id` (Breakdown modal on Fee Structure table) | `{adminId}:fees:structure:{structureId}` | §2 near-static | 30–60 min |
| `GET /fee-reminder` (saved filter list, Fee Reminder table) | `{adminId}:fees:reminder-filters` | §2 near-static | 30–60 min — filters themselves change rarely; the LIVE student list they resolve to is never cached (see below) |
| `GET /fees?class&stream&group` (Fees page collection table — Paid/Due/Status per student) | **not cached** | — | Paid/Due is exactly the balance §2 names by example as never-cached; a stale row here is the module's version of "action ki koi aur response aaye" |
| `GET /fee-statement/:studentId` (Fee Statement view) | **not cached** | — | reads the same live `StudentFeeRecord`/`FeePayment` balance data as the Fees page, one aggregation per student per §"No client-side joins" in `database-design-principles.md` — must not be cached independently of the page it's opened from |
| `GET /fee-reminder/:id/preview` (Review & Send modal's live list) | **not cached** | — | `fee-reminder.md` is explicit this re-runs the filter against current data every time; caching it would defeat the modal's entire purpose |

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Create/Edit Fee Structure (Fee Structure page) | `delPattern('{adminId}:fees:structure*')` |
| Delete Fee Structure (once the in-use guard in `errors.md` passes) | `delPattern('{adminId}:fees:structure*')` |
| Create/Edit/Delete Fee Reminder filter (Fee Reminder page) | `delPattern('{adminId}:fees:reminder-filters*')` |
| Collect Fee (Fees page, Collect modal) | no near-static key to clear (Fees/Statement balance reads are never cached — see above); the mutation response must return the fresh `StudentFeeRecord` balance per §2 so the row/modal updates from the response, not a follow-up GET |
| Razorpay webhook payment (`customer-payment.js`) / gateway payment (`payment.js`) | same — no cache layer sits over the balance fields these endpoints write |
| Fee Reminder "Send Now" completing (per-recipient `lastReminderSentAt` bulkWrite) | no fees-balance cache key; only relevant to the reminder filter's own "Gap Since Last Reminder" computation on its next live preview, which is already uncached |

## Pagination

| List | Field |
|---|---|
| Fees page collection table | Keyset/cursor — can reach thousands of students per school, same growth class as Student's own Manage Students list |
| Fee Structure table | Offset — small, bounded (one row per Session×Class×Stream×Group combination) |
| Fee Reminder filter list | Offset — a handful of saved filters per school |
| Fee Statement's "Previous Year Dues" / "Payment History" sections | Offset — bounded per student (one row per past session / per receipt for that one student, never a large collection) |

## Idempotency-Key required on

- `POST /fees/:studentId/collect` (Collect Fee modal) — the canonical case §3 names directly ("Fee Collection"); `errors.md` confirms this is not hypothetical — a network retry or impatient double-tap before any guard existed currently double-counts `paidFees` in `customer-payment.js`, and the read-modify-write balance bug compounds the risk. The header is required in addition to, not instead of, the atomic `$inc`-with-guard fix `errors.md` specifies for the write itself.
- `POST /razorpay/webhook` (payment gateway webhook receipt, `customer-payment.js`) — §3 names "Payment-gateway webhook receipt" explicitly; a gateway's own retry-on-timeout behavior makes this doubly likely to arrive twice.
- `POST /payment` (`payment.js`'s own payment-recording path) — same class of synchronous financial write as the above two, and `errors.md` flags this file's entitlement-trust gap alongside the idempotency gap, so both fixes land together.
- `POST /fee-reminder/:id/send` is **not** in this list — it is explicitly a queued BullMQ job, not a synchronous critical write per §3's own distinction; its dedup need (per `errors.md`'s data-modeling note) is a per-recipient/job dedup key inside the job, not an HTTP-layer `Idempotency-Key` header.

## Real-time / precomputed aggregates

Not applicable in the full §6 sense — Fees has no standing dashboard panel of its own in this module's four pages (the school-wide collection summary lives in the Dashboard module, per §8's Dashboard row, and is precomputed there, not here). Fee Statement's per-student aggregation (`StudentFeeRecord` + `FeeStructure` + `FeePayment` joined server-side) is a live per-request aggregation, not a candidate for background precompute, since it's read by exactly one admin looking at exactly one student at a time, not a large-collection scan.

## Module-specific notes

- **`StudentFeeRecord`'s Paid/Due/Status fields are the canonical "must never be stale" case in this whole app** — `fees.md` itself states these are DERIVED from summed `FeePayment` records, never separately stored, and `errors.md` independently confirms a real read-modify-write race on the balance update today. Both facts point the same way: this data is read straight from MongoDB on every request, with no cache layer at any tier, matching the Admission-time fee/concession workflow already documented in `student/errors.md`. This is the fees-module instance of §2's "never cached" tier named by example ("fee/payment balances").
- **Fee Structure is the one safe near-static key in this module** — a structure is defined once per Session×Class×Stream×Group and edited infrequently; because `StudentFeeRecord.totalFee` is set at record-creation/rollover time rather than read live from the structure on every balance check, a briefly-stale cached structure can only affect the *next* new record created against it, which write-invalidation on edit already covers — it can never retroactively corrupt an existing student's already-computed balance.
- **Receipt numbering (`receiptNo`) has no cache implication but shares the "never trust a read that isn't atomic" theme** — `errors.md` flags today's `Math.random()` assignment as a confirmed collision risk; the fix is an atomic sequence counter (same pattern as Payroll's `slipNumber` retry loop), read fresh under the sequence's own atomic increment, never a cached "next number."
- **Fee Reminder filters are safe to cache; the live student list they resolve to is not** — the two halves of this feature sit in different tiers on purpose: the filter *definition* (Class/percent/day thresholds) is near-static config, while every resolution of that filter against `StudentFeeRecord` data (the table's "To Send" preview, the Review & Send modal, and the actual send job's input) must read live data every time, per `fee-reminder.md`'s explicit "never a stored, static recipient list" design.
