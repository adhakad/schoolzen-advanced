# Attendance — Overview

Status: **FINAL**
Reference: `attendance-overview.html`

---

## Frontend

**Toolbar** (this page's OWN 3-row shape — 6 filters genuinely need a grid, don't copy this row-split onto pages with fewer filters):
- row1: search + button group (Generate Report outline, Sync Now primary — Sync opens a confirm modal first, never fires on click)
- row2: 6-column grid — Person Type, Department, Designation, Class, Stream, Section, all `.dd`, cascading (Staff enables Dept→Desig; Student enables Class→Stream(11/12 only)→Section, Section options populated live from whichever of Class/Stream is set)
- row3: month navigation

**Grid**: horizontally scrollable, full month of day-columns, sticky checkbox+name+type columns on the left, "today" column visually distinguished and auto-scrolled into view. Cells: Present (chip+time), Late (chip+time), Absent (chip, no time), Holiday (chip, no time), or — only in today's column for someone punched-in with no punch-out yet — a pulsing "live" ring instead of a static chip.

**Actions**: checkbox-selected rows enable "Generate Report" (client-side modal built from currently-rendered chip counts). Recent Arrivals side panel: grouped Staff/Student, click a row to expand role/ID + monthly present-count.

## Backend

`AttendanceRecord`: one document per person per day (`punches:[{time,type}]` array), never one per punch event. Unique index `(adminId, personType, personId, date)` so a duplicate device-sync retry merges rather than duplicates.

`GET /grid` returns the whole visible month in one aggregation (not one query per day/person).

### Device sync — WDMS integration, two-speed pipeline

**WDMS auth**: token-based only — never the dual Basic+Token client pattern seen in older reference integrations. One token per device, refreshed on 401, never re-authenticating per request.

**Fast path (raw ingest, powers the frontend's "live" pulsing-ring cell above)**: each WDMS poll/webhook hit writes raw punches straight to a `PunchLog` collection via `insertMany` (bulk, never per-punch `.save()`), deduped by a unique `punchHash = sha1(adminId+personId+punchTime)` index — a re-delivered punch from a retry just fails the unique check and is silently skipped, never duplicated. Immediately after the bulk insert, emit each punch over Socket.io (`{personId, status:'punched-in', time}` — minimal payload, per `performance-principles.md`'s real-time rule) so today's grid cell shows the live ring with zero reconciliation delay. No computation happens on this path.

**Slow path (reconciliation into `AttendanceRecord`)**: `POST /sync` enqueues a BullMQ job — a real `Worker` process consumes it (never a cron calling `exec()` on a child process). The job reads that batch's unreconciled `PunchLog` rows and merges them into the day's `AttendanceRecord.punches[]`, computing Present/Late/Absent status against the person's `Shift`. Job `jobId` is derived from `(adminId, deviceId, syncBatchId)` so BullMQ's own dedup drops a retried/duplicate enqueue before it ever reaches a worker — this reconciliation is allowed to lag up to ~2 hours behind the fast path; the grid just shows "live" until it catches up.

**Scale**: device polling is staggered per school via a `SYNC_WINDOW_MINUTES` offset (derived from `adminId`) so 2,000 schools' cron ticks don't all fire in the same second; worker concurrency is capped so one school's large sync can't starve others.

**Redis's role here is intentionally narrow** (per `state-management.md`/master-plan's Redis-scope decision): it backs the BullMQ queue, and optionally holds today's live-status per person with a short TTL (30–60s) purely to make a page-refresh mid-day show the ring immediately without waiting on a socket reconnect — never a general cache, never the source of truth (`AttendanceRecord`/`PunchLog` in Mongo always are).
