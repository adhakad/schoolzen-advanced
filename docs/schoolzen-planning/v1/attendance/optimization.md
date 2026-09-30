# Attendance — Optimization & Caching

Status: **FINAL**
Depends on: `_core/module-optimization-guide.md` (conventions this file applies) and `_core/database-design-principles.md` (indexes).

Attendance is the module §6 and §2's "never cached" list were written with in mind: `AttendanceRecord` grows fastest of any collection in the app (one document per person per day), its Live Status counts are the canonical precomputed-aggregate case, and individual attendance documents must never be cached since they're exactly the kind of transactionally-sensitive-the-instant-it-changes data §2 excludes on principle. This file's shape follows directly from `attendance-overview.md`'s own two-speed (fast-path/slow-path) sync pipeline, not a generic caching pass bolted on afterward.

## Cached reads

| Query / endpoint | Cache key | Tier (§2) | TTL |
|---|---|---|---|
| Shift list (Manage Shifts) | `{adminId}:attendance:shifts` | Near-static | 45 min |
| Roster's per-shift legend strip (which shifts are actually in use) | derives from the cached Shift list plus a live distinct-count against Roster/ClassShift — the "in use" filter itself is not cached (it must reflect the current assignment state), but the underlying Shift names/times it displays are | Near-static (Shift side only) | 45 min |
| Today's Live Status counts (Overview grid's per-status tallies, Recent Arrivals panel) | `{adminId}:attendance:live-status:{date}` | Short-TTL, precomputed (see §6 section below) | 30–60s |
| Overview's monthly grid data (`GET /grid`) | **not cached** — per-month aggregation already returns the whole visible range in one query per `attendance-overview.md`; caching it would mean caching data that changes throughout the day (today's column) alongside data that's genuinely static (past days), which is exactly the kind of "one blanket number is wrong" case §2 warns about. Left as a direct, well-indexed read instead. | — | — |
| Individual `AttendanceRecord`/`PunchLog` documents | **never cached** — per §2's explicit exclusion list ("attendance punches" is named directly) | — | — |

## Invalidation triggers

| Action (page) | Invalidates |
|---|---|
| Add/Edit/Delete Shift (Manage Shifts) | `{adminId}:attendance:shifts*` |
| New punch batch arriving via WDMS fast path (raw `PunchLog` insert) | `{adminId}:attendance:live-status:{today}` — same request that does the Socket.io emit also busts/repopulates this key, since the live-status count and the socket delta are showing the same underlying event |
| Reconciliation job (slow path) completing a batch into `AttendanceRecord` | `{adminId}:attendance:live-status:{date-being-reconciled}` — reconciliation can correct a fast-path-guessed status (e.g. a punch that looked on-time but reconciles to Late against the person's Shift), so the precomputed count must be recomputed, not just left stale until its short TTL expires |
| `CreateManualAttendance` / manual override edit (Overview) | `{adminId}:attendance:live-status:{date}` for that one date — a manual correction changes the count for that day immediately, same-request, per §2's write-through rule |
| Bulk roster assign/clear, ClassShift assign/delete (Roster) | Nothing in the Shift cache itself (shifts aren't being edited), but does trigger the existing reconcile-job re-enqueue already described in `attendance-overview.md`/`errors.md` — that reconcile completing is what then busts the live-status key above for the affected date(s) |

## Pagination

- **Overview's monthly grid**: not a paginated list — it's one aggregation returning a bounded month × roster-size grid, sized by calendar days × currently-filtered people, never `.skip(N)`-style pagination.
- **Roster's staff/student date-grid**: same shape as Overview — bounded by month × filtered roster, not a candidate for keyset/offset pagination.
- **Manage Shifts list**: offset — small, bounded (a school configures a handful of shifts).
- **Day-punch modal (`GetPunchLog`/`getDayPunches`)**: offset, scoped to one person + one day — inherently small (a handful of punches per person per day).
- **`AttendanceRecord`/`PunchLog` as collections** (not any one page's list, but the underlying data volume): keyset/cursor is the only viable approach for any future admin-facing raw-data export or audit view over these collections, since they grow fastest of anything in the app per `database-design-principles.md`'s high-volume-collections note — no page in this module currently exposes such a raw list view, but any future one must follow this, not offset.

## Idempotency-Key required on

**None among this module's own endpoints**, for a reason specific to this module rather than "nothing here is critical enough": the synchronous writes that would otherwise need this — `CreateManualAttendance`, Assign Card, `POST /sync` — are each already idempotent by a different, more precise mechanism than a generic Idempotency-Key header:
- `POST /sync` is deduped by BullMQ's own `jobId = (adminId, deviceId, syncBatchId)`, so a retried enqueue never reaches a worker twice (already implemented correctly per `errors.md` shape 9).
- Device punches are deduped by the unique `punchHash` index at insert time (shape 8) — a re-delivered punch from a device retry fails the unique check and is silently skipped, which is the *stronger* guarantee an Idempotency-Key would otherwise approximate.
- `CreateManualAttendance` writes to a document keyed `(adminId, personType, personId, date)` — a resubmit of the same manual entry is a natural upsert against that same key, not a duplicate-creation risk the way Admission's `CreateStudent` is.
- Assign Card is guarded by the same uniqueness checks (`MAPPING_ALREADY_EXISTS`, `CARD_DUPLICATE`) as Student/Staff's card assignment, per shape 2/9 — a double-submit is caught there, same non-Idempotency-Key treatment as Staff's Assign Card.

## Real-time / precomputed aggregates

This is the module §6 exists for. Today's Live Status counts (Overview's grid tallies, Recent Arrivals panel) are **not** computed synchronously on a cache-miss:

- A background process recomputes the count on the events that matter — a new `PunchLog` batch landing (fast path) and a reconciliation batch completing (slow path) — rather than a fixed cron interval alone, since punch volume is genuinely event-driven (concentrated at school start/end times) rather than evenly spread across the day.
- The recomputed value is written to a small precomputed-stats shape keyed `{adminId, date}` (not a full `AttendanceRecord` scan on every read) and the GET endpoint reads that document, cached on top at the short-TTL tier (30–60s) per the table above.
- **Redis's role here is intentionally narrow**, per `attendance-overview.md`'s own note: it backs the BullMQ queue and optionally holds today's live-status-per-person with a short TTL purely so a page refresh mid-day shows the pulsing "live" ring immediately without waiting on a socket reconnect — it is never the source of truth. `AttendanceRecord`/`PunchLog` in MongoDB always are. This is a narrower Redis role than the general cache-aside pattern the rest of this file (and the other three modules' optimization files) otherwise use for near-static config — worth calling out explicitly so a builder doesn't assume Attendance's Redis usage generalizes the same way Academic Setup's does.
- The real-time push (Socket.io minimal-delta payload, `{personId, status, time}`) and the precomputed-aggregate refresh are two different mechanisms serving two different UI needs — the pulsing "live" ring (per-person, instant) versus the day's overall counts (aggregate, short-TTL-cached) — and per §5, the socket delta and any HTTP-driven refresh of the same person's row must merge through the same `applyPersonUpdate`-style function on the frontend, never two divergent merge paths.

## Module-specific notes

- **`AttendanceRecord`'s per-day-per-person document shape is what makes individual-record caching a non-option, and also what makes the aggregate the only sane cache target.** Each document already batches a whole day's punches (`punches:[{time,type}]`) — caching one of these would mean caching something that can be appended to mid-day by either the fast-path insert or a manual edit, which is precisely the "cache invalidation must fire on every write path that can touch this data" problem §2 warns about. The aggregate (today's counts), by contrast, is read far more often than any single person's record and tolerates a short staleness window — that asymmetry is exactly why the cache boundary sits at the aggregate, not the record.
- **The fast-path/slow-path split already IS this module's cache-correctness story** — the "live" ring is deliberately a best-effort, short-TTL, socket-pushed approximation that's allowed to be corrected up to ~2 hours later by reconciliation; this is the one place in the whole app where showing a value that might still change is the *designed* behavior, not a caching bug to eliminate. Every other module's near-static tier assumes the cached value is right until the next write; Attendance's live tier assumes the cached value is a provisional estimate until reconciliation confirms it — document this distinction for whoever builds this module so they don't try to "fix" the live ring into a stronger consistency guarantee than the design calls for.
- **Never cache `PunchLog` or `AttendanceRecord` documents themselves, only the aggregate counts derived from them** — restated from §2/§8 because this is the single most likely caching mistake a builder could make in this module (attendance data "feels" like it should be cacheable since it's read on every Overview page load, but it's also the most write-heavy, most correctness-sensitive data in the app).
- **Shift's near-static cache is the one part of this module that behaves like every other module's config cache** — Shift data changes rarely and is read by both Overview (rendering the grid) and Roster (assignment), making it a straightforward near-static win with the same invalidation shape as Academic Setup's Class list or Staff's Department list, unlike everything else in this file.
