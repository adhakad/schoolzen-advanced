Read CLAUDE.md fully before starting. Implement the following against the
already-built Phase 6 attendance-sync pipeline (BullMQ sync + reconcile
queues/workers, PunchLog, SyncState, punch-publisher.js's Redis pub/sub
channel `attendance:punch`, attendance.component.ts's existing `syncNow()`
frontend call). Do not add any new periodic/repeating full-fleet sync cron —
that approach was evaluated and rejected (see rationale below). Build these
four pieces instead:

## 1. Fix existing Phase 6 gaps first

- `attendance-reconcile-worker.js`'s `processReconcileJob` has no success
  log. Add `logger.info('attendance-reconcile-worker.done', { adminId,
  dateKey, ...summary })` right before `return summary;`.
- Confirm `attendance-sync-queue.js`'s `addSyncSchoolJob` sets
  `jobId: sync-${adminId}-${dateKey}` for dedup, matching the pattern
  already used in `attendance-reconcile-queue.js`. Add it if missing, so a
  duplicate "Sync Now" click or overlapping cron tick can't double-enqueue
  the same school+date.
- Replace the `workersAlive` health check (wherever it currently calls
  BullMQ's `Queue.getWorkers()`, which runs Redis `CLIENT LIST` — unreliable
  on Upstash's managed Redis) with a heartbeat-key pattern: each worker
  (sync + reconcile) does `connection.set('heartbeat:<queue-name>',
  Date.now(), 'EX', 60)` on a `setInterval` (~20s); the health endpoint does
  a plain `GET` on that key and treats the worker as alive if the timestamp
  is under 60s old.

## 2. Phase 7 — Socket.io real-time push (the "late puncher shows up live" case)

Implement Phase 7 exactly as scoped in CLAUDE.md section 6: Socket.io with
one room per school (`school:<adminId>`). Add an API-side subscriber to the
Redis pub/sub channel `attendance:punch` (already published to by
`punch-publisher.js` on the worker side) that re-emits each payload into the
matching school's Socket.io room. Add a frontend listener on the attendance
dashboard (`attendance.component.ts`) that appends/updates the calendar or a
live punch feed when an event arrives for the logged-in school — no polling,
no refresh needed. This covers: a student punching after the 8 AM cron
window (e.g. 10:30 AM) should appear on a teacher's screen live if they have
the page open.

## 3. Confirm/finish on-demand single-school "Sync Now" (the "teacher wants to confirm right now" case)

`attendance.component.ts` already calls `attendanceService.syncSchoolNow()`
on button click. Verify (and build if missing) the backend route + controller
that: takes one `adminId` + `dateKey`, enqueues a single `attendance-sync`
job for just that school with the `jobId` dedup from step 1, and returns
promptly so the frontend can show a loading/success state via the existing
`getSyncState()` call. This must NOT touch or re-enqueue any other school —
it's a single-school, on-demand action, not a scheduled job. This is what a
teacher clicks at 11 AM to force a fresh WDMS pull without waiting for the
next cron tick or relying on Socket.io being connected.

## 4. Manual attendance entry (the "device/card issue" case)

Already implemented in `attendance.component.ts` (`manualSave()` /
`manualRemove()`) against `DailyAttendance` with `source: 'MANUAL'` and
`isOverridden`. Confirm the backend endpoint exists and is wired correctly;
if any piece is missing, build it following CLAUDE.md's New Module Checklist
conventions. `manualRemove()` should drop the override so the next reconcile
worker run recomputes the day from raw `PunchLog` rows.

## Rationale for NOT adding a periodic full-fleet re-sync

A "sync all schools every 10 minutes within a 2-hour window" approach was
considered and rejected:
- `getAlreadyClaimedSchoolIds()` currently locks a school for the whole day
  once its `SyncState` is `SYNCED` — a naive frequency increase would just
  be skipped as "already claimed" on every trigger after the first.
- Even with state-tracking reworked to allow repeats, full-fleet re-polling
  at N schools × 12 triggers over 2 hours is real outbound WDMS HTTP load
  for no real gain — `ingestSchoolDay()` (`punch-ingest.js`) does a genuine
  network call to WDMS per school per job, it does not read from a local
  cache.
- The actual user need (a class teacher checking attendance mid-morning,
  where some students punched late or need manual entry) is fully covered
  by real-time push + on-demand single-school sync + manual entry — all
  three already scaffolded in the codebase — without adding any recurring
  fleet-wide polling load.

## Acceptance check after this phase

- A test punch registered after the 8 AM cron window appears on an open
  attendance dashboard without a page refresh (Socket.io path).
- Clicking "Sync Now" for one school triggers only that school's sync job
  (confirm via logs — no other `adminId` should appear in a sync job around
  that trigger).
- Manually marking a student Present/Absent immediately reflects in the
  calendar view, and removing the override lets the next reconcile run
  recompute it from `PunchLog`.
- `workersAlive` in the health endpoint reads `true` while `worker.js` is
  running, using the heartbeat key rather than `getWorkers()`.