# Approvals — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

**None.** This page's entire read is a `$unionWith`-style aggregation over each source module's own actively-mutating "pending request" collections (currently only `LeaveRequest`) — the same reasoning `_core/database-design-principles.md`'s "never cached" category gives for attendance/fee/leave-balance state applies here: a pending-approvals queue that showed a stale cached snapshot after an approve/reject would directly contradict the module's purpose (knowing what's still waiting on you, right now). The toolbar's cascade filters (Person Type→Dept/Class→Designation/Stream→Section) reuse Staff/Academic Setup's own near-static cached lookups (see those modules' optimization notes) for their dropdown options, but the union result itself is always a live read.

## Invalidation triggers

Not applicable — nothing here is cached, so there is nothing to invalidate. Approve/Reject write to the source module's own collection (`LeaveRequest` today) through that module's own endpoint; any cache that source module keeps on its own pending-count or list (see `leave/optimization.md` if one exists) is that module's invalidation responsibility, not this page's, per `approvals.md`'s "pure pass-through" design and `errors.md`'s "everything else is inherited, not owed here" rule.

## Pagination

**Keyset/cursor — not offset.** This is the concrete fix `errors.md`'s Shape 9 finding requires, not a default choice: an offset (`skip`/`limit`) union query drifts the moment any admin approves/rejects a row anywhere in the queue, since the underlying multi-source result set shrinks out from under a fixed page-2/3/... offset. Paginate on a stable compound cursor — `(sortKey, _id)` where `sortKey` is the common `createdAt`-equivalent field every unioned source must expose (see `approvals.md`'s Backend section and `errors.md`'s Shape 3 contract gap) — so a row leaving the Pending set never shifts what an admin already scrolled past.

## Idempotency-Key required on

**None applies here.** Approve/Reject are pure pass-throughs to Leave Requests' own endpoints — the Idempotency-Key requirement (if any) belongs to that source endpoint's own optimization doc, not duplicated here, per the same "inherited, not owed here" principle `errors.md` states for tenant isolation and the approve/reject race. This page defines no new write path of its own.

## Real-time / precomputed aggregates

**The pending-count/bell badge should be a real-time push (§5), not a poll, and never a cached-then-summed-per-source number.** Per `errors.md`'s Backend requirements ("any 'N pending' count or badge this page shows must be computed from the same union match at read time, never cached per source and summed client-side"): the count itself is cheap (a single `$match: {status:'pending'}` count across the unioned sources, no heavy aggregation), so §6's precompute-in-background pattern is unnecessary machinery here — instead, push the delta over the socket on the same event that creates/resolves an approval request (the same event Leave's own approve/reject already fires), and merge it into the badge with the one shared merge function §5 requires for any entity that can change via both socket and API response. If a real-time channel isn't available yet, a short-TTL (15–30s) cache on the count alone is an acceptable interim step — but the count must still be computed by one live query at cache-refresh time, never assembled by summing each source's own independently-cached count.

## Module-specific notes

- **This module has no writes and no schema of its own** — Approvals is a read-side aggregation layer plus a pass-through for two actions. Its entire optimization surface is therefore about safe pagination over a moving union and a correctly-scoped real-time badge, not about caching or invalidation, which is why several sections above say "not applicable."
- **The sort-key contract gap `errors.md` flags (Leave sorts by `{fromDate:-1, _id:-1}`, not `createdAt`) blocks correct keyset pagination, not just correct sorting.** A keyset cursor needs a real, indexed, monotonic sort key on every unioned source — fixing that contract (give `LeaveRequest` an indexed `createdAt`, or formally redefine the union's sort key as `fromDate`) is a prerequisite for the pagination fix above, not a separate concern; do this before wiring cursor-based paging, not after.
- **As additional modules add their own approvable-request type, each one's optimization doc — not this file — decides whether that source's own pending state is cached.** This file's job is only to ensure the union's pagination and badge count stay correct regardless of how many sources exist; it never becomes the place a new source's own caching strategy is decided.
