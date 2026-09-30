# Leave — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

| Query/endpoint | Cache key | Tier | TTL |
|---|---|---|---|
| `GET /leave-type` (dropdown + Leave Create table) | `{adminId}:leave:types` | §2 near-static | 30–60 min, write-invalidated |
| `GET /leave-type?applicableTo=X` (Apply Leave / self-apply dropdown, filtered) | `{adminId}:leave:types:applicable:{personType}` | §2 near-static | 30–60 min |
| `GET /leave-assign/grid` (Leave Assign table — per-person × per-type allocated/used matrix) | **not cached** | — | large, filterable, and `usedDays` changes on every approval — see Module-specific notes |
| `GET /leave-requests?...` (Leave Requests table, any filter combination) | **not cached** | — | high filter cardinality (9 filters) and status changes constantly (approve/reject/cancel); caching this table would routinely show a Pending row that was just actioned |
| Per-person `LeaveLimit` lookup used inside `createRequest`/`ApproveLeaveRequest` balance checks | **never cached** | §2 never-cached | read straight from Mongo every time — this is the balance-gating field |

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Create/Update/Delete Leave Type (Leave Create page) | `delPattern('{adminId}:leave:types*')` |
| Narrowing/widening `applicableTo` on a Leave Type (Leave Create edit modal) | same pattern as above — `applicableTo`-scoped dropdown keys must clear too, not just the unqualified list key |
| Bulk-assign / "Set Leave Limit" (Leave Assign page) | no near-static key to invalidate (grid is never cached — see above), but must write-through the fresh `allocatedDays` into the same document the next grid read hits |
| Approve (Leave Requests page, check icon) | `LeaveLimit.usedDays` is incremented in the same transaction as the status write — since `LeaveLimit` is never cached, there is no separate cache-delete step here; the point is that no stale cached balance survives an approval because none is ever cached (§2 never-cached tier) |
| Reject (Leave Requests page, x icon) | none beyond the request's own status (no balance change) |
| Cancel (Leave Requests page, undo icon) | reverses the `usedDays` increment transactionally — same "never cached, so nothing to invalidate" reasoning as Approve |
| Delete Leave Type (Leave Create page) | `delPattern('{adminId}:leave:types*')`, plus the cascade count (assignments/requests still using it) is a live count query, never cached |

## Pagination

| List | Field |
|---|---|
| Leave Requests table | Offset — bounded per school per session, and the 9-filter toolbar already narrows the working set before pagination matters |
| Leave Assign grid | Offset — bounded per staff/student roster, same reasoning as Staff's own list |
| Leave Type table (Leave Create) | Offset — small, bounded (a school has a handful of leave types) |

## Idempotency-Key required on

- `PUT /leave-requests/:id/approve` — synchronous, and per `errors.md`'s Shape 9 finding this endpoint already has a confirmed double-approve race that silently double-deducts `usedDays`; an `Idempotency-Key` is required in addition to (not instead of) the `findOneAndUpdate({_id, status:'Pending'})` conditional-write fix `errors.md` specifies — the header guards a client retry, the conditional write guards a true concurrent second actor.
- `PUT /leave-requests/:id/reject` — same header, lower severity (rejecting twice is idempotent by outcome per `errors.md`), but kept consistent with Approve so the frontend's retry logic doesn't need to special-case which action needs it.
- `POST /leave-requests` (Apply Leave submit) — a flaky network retry on Apply Leave must not create two overlapping requests for the same range.
- Bulk-assign (`POST /leave-assign/bulk`) is **not** in this list — it is idempotent-by-upsert already (per `errors.md` Shape 2: an existing `PersonLeaveAssignment` row is matched and left untouched, never duplicated), so a retry is naturally safe without a header.

## Real-time / precomputed aggregates

Not applicable to this module in the §6 sense — Leave has no dashboard-style aggregate panel of its own. The closest analog, "days left" shown inline on the Leave Requests table's Name column, is computed from the same never-cached `LeaveLimit` read per §2, not a separate precomputed document.

## Module-specific notes

- **`LeaveLimit` must never be cached, full stop** — it is the module's version of §2's "never cached" tier (grouped there explicitly alongside fee/payroll balances). `errors.md`'s confirmed approval race exists precisely because the *status* write wasn't guarded; layering a cache on top of `usedDays` would add a second, worse way for the same symptom ("approval ki koi aur response aaye") to appear. §8's old matrix line calling this "near-static-ish" is superseded here — treat it as never-cached, matching Fees/Payroll's balance fields, not as a long-TTL config value.
- **Invalidate the instant an approval lands, not on a TTL** — since there is no cache to invalidate, this is automatically true; call this out anyway because it is the module's single most important optimization decision (i.e., the correct optimization for `LeaveLimit` is *no caching*, not a short TTL).
- **Leave Type list is the one genuinely safe near-static key** in this module — low write frequency (a school defines its leave types once, rarely edits them), so the standard 30–60 min TTL + write-invalidation from §2 applies cleanly, same reasoning as Holiday's low-write-frequency config.
- **`GetLeaveTypePagination`'s search `RegExp`** (flagged in `errors.md` as unescaped) has no caching implication but is worth noting here since a cache key built from an unsanitized search string would also need care once sanitization lands — key by the sanitized value, not the raw query param.
