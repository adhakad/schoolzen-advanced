# Dashboard — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

## Cached reads

| Read | Cache key | Tier (§2) | TTL |
|---|---|---|---|
| `GET /dashboard`'s full response (hero stats, week's attendance bars, fee donut, calendar holiday-dates, pending approvals, upcoming holidays) | `{adminId}:dashboard:stats:{sessionId}` | §6 precomputed aggregate, then cached on top per §2's short-TTL tier | 60–120s, per `dashboard.md`'s own stated figure |

This is the one module whose entire job, per `_core/module-optimization-guide.md`'s original §8 matrix, is "read cached/precomputed data fast" — every number this page shows should be a cache/precomputed-document read, never a live aggregation computed on the request path.

## Invalidation triggers

| Event (elsewhere in the app) | Invalidates |
|---|---|
| A fee payment completes (Fees module) | `{adminId}:dashboard:stats:{sessionId}` — proactively, on the write, not waited-out via TTL; per `dashboard.md`'s explicit "an admin who just collected a fee doesn't see yesterday's total" requirement |
| An attendance sync/device batch completes (Attendance module) | `{adminId}:dashboard:stats:{sessionId}` — same proactive rule, covers both the hero "Attendance%" stat and the week's-attendance bar |
| A leave request is approved/rejected (Leave/Approvals) | `{adminId}:dashboard:stats:{sessionId}` — covers the "Pending approvals" side-list count |

Dashboard has no Create/Update/Delete of its own (see Module-specific notes), so every invalidation trigger for this page's cache key is fired from another module's controller, never from a Dashboard endpoint — each of the three writes above must include this key in its own write-through invalidation step, cross-module, the same way Settings' Academic Session activation invalidates keys other modules read.

## Pagination

Not applicable. Every widget on this page is a fixed-size aggregate or a short side-list (a week of bars, a month's calendar, a handful of pending approvals, a handful of upcoming holidays) — none of them paginate; a "see all" link on Pending Approvals/Upcoming Holidays navigates to that module's own paginated page instead of paginating in place here.

## Idempotency-Key required on

Not applicable — this module has no write endpoints of its own to guard. `GET /dashboard` is a read; §3's Idempotency-Key requirement only applies to synchronous critical writes, of which this module has none.

## Real-time / precomputed aggregates

**This is this module's entire job, per §6.** `GET /dashboard`'s six sub-aggregations (student/staff counts, attendance %, fee donut, week's attendance bars, fees-collection charts) must not run as a synchronous `$group` pipeline on the cache-miss request path once collections are large — instead:

- A background job (BullMQ, cron every 1–5 min, **plus** triggered immediately on the three high-value events in the Invalidation table above — a fee payment, an attendance sync finishing, a leave approval — rather than waiting for the next scheduled tick, per `dashboard.md`'s own note) recomputes each sub-aggregation and writes it into a `DashboardStats`-shaped document keyed `{adminId, sessionId}`.
- `GET /dashboard` reads that precomputed document — itself cached short-TTL per the table above — turning six potentially-expensive live aggregations into one indexed document read on every page load/login.
- Per `errors.md`'s Critical section, **each sub-aggregation's slice must fail independently** inside the background job too — one widget's pipeline throwing (e.g. the fee-donut `$group`) must not prevent the other five from writing their slice into the same `DashboardStats` document; store a per-widget error/stale marker in that document rather than leaving the whole document unwritten.
- Include a `generatedAt` field on the precomputed document (and surface it in the response) so the frontend's "as of HH:MM" indicator — `errors.md`'s Staleness requirement — reflects when the aggregation actually ran, not when the HTTP cache layer on top of it last refreshed; these are two different clocks and the UI needs the older/slower one.

## Module-specific notes

- **Dashboard has no writes of its own** — every optimization concern here is about reads and about reacting correctly to other modules' writes (the invalidation triggers above), never about this module's own mutation path, because it doesn't have one. This is the cleanest possible version of §2's cache-correctness rule to apply, since there's no risk of "this module's own write forgot to invalidate its own read" — the only risk is another module's write forgetting to invalidate Dashboard's key, which is why the Invalidation table above states each trigger explicitly rather than assuming it's obvious from the source module's own optimization doc.
- **`adminId` must scope the first `$match` stage of every sub-aggregation and must come from the authenticated session/token only** (per `errors.md`'s Critical tenant-scoping note) — this is a correctness requirement, not a performance one, but it directly affects the cache key: the cache key's `{adminId}` segment is only a safe partition if the aggregation behind it was genuinely computed for that `adminId` and no other, never client-supplied.
- **The zero-denominator guard for Attendance-today/this-week (holiday, non-working day, "no attendance marked yet") belongs inside the precomputed `DashboardStats` document, computed once by the background job**, not recomputed per-request on the cache-read path and not left to the frontend — the same divide-by-zero guard existing in exactly one place (the job, not the controller and not the component) is what keeps §2's "server-authoritative numbers" rule intact here.
- **No polling** — per §4's "no polling where a push exists" rule, once the three write-triggered invalidations above are wired, Dashboard has no need for the frontend to poll `GET /dashboard` on an interval; a normal page-load/short-TTL-cache read is sufficient, and a push-on-invalidation (socket) channel is optional polish, not a requirement, since a dashboard tolerates the short cache window by design.
