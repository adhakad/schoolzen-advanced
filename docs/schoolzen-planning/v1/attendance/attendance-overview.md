# Attendance — Overview

Status: **FINAL**
Reference: `attendance-overview.html`

---

## Frontend

**Toolbar** (this page's OWN shape — 7 filters need a grid, don't copy this row-split onto pages with fewer filters):
- row1: search + button group (Generate Report outline, Sync Now primary — Sync opens a confirm modal first, never fires on click)
- row2: grid `repeat(6,minmax(0,1fr))` so all filters are equal width, 6 per row, the 7th wraps to the next row (2 per row on mobile). Filters: Person Type, Department, Designation, Class, Stream, **Stream Group**, Section, all `.dd`, cascading (Staff enables Dept→Desig; Student enables Class→Stream(11/12 only)→Stream Group→Section; a Group belongs to a Stream. Classes without streams (General group) keep Stream Group disabled/show-only. Disabled filters show the same "All ..." text as enabled.)
- row3: month navigation, a calendar filter with a constant 178px width for every month (sized for the longest label, "September 2026"); the label is centred between the two chevrons and never changes the filter width

**Grid**: horizontally scrollable, full month of day-columns, sticky checkbox+name+type columns on the left, "today" column visually distinguished and auto-scrolled into view. Cells: Present (chip+time), Late (chip+time), Absent (chip, no time), Holiday (chip, no time), or — only in today's column for someone punched-in with no punch-out yet — a pulsing "live" ring instead of a static chip.

**Identity**: under each name an ID line — Employee ID for staff, Roll No for students — then the shift/class line. Search matches name, employee ID and roll no.

**Chip size**: 45px x 36px (5:4), 6px side padding, status and time on two lines with a 2px gap. Day columns 62px, `table-layout:fixed`, sticky check/name/type columns fixed at 38/160/90px. Times in AM/PM. Today auto-scroll moves only the grid wrapper (never the page).

**Mobile (<=640px)**: fixed columns must not eat the grid. Only checkbox (30px) + name (104px) stay sticky; the Type column and avatar are hidden (the ID line already tells staff from student); day columns 54px; search full width, buttons wrap; filters 2 per row. At 390px about 4 day columns are visible next to the sticky name.

**Chip colours**: Present = white background + brand purple border (today and the rest of the month's non-past dates; **every past (locked) chip keeps the plain gray `--line` border**); Late/Absent/Holiday keep the `--line` border. Status text and time are dark (Present `#176B3B`, Late `#84580F`, Absent `#A24A38`, Holiday `#6B6480`), time at weight 600 and full opacity, status letter weight 800. Past (locked) chips are only lightly faded (opacity .85).

**Past / today / future states** (same chip, same design, only light modifiers):
- Past dates: real status chip, `.locked-past` (lighter, `cursor:not-allowed`, tooltip "Purani date: badal nahi sakte").
- Future dates: roster-expected state (shift code, WO, H) as `.future` (lighter, dashed border, not clickable). People with no roster entry show a dashed `—` (`.nocell`). Approved Leave stays visible as Leave.
- Today: normal chip; `.live-click` (brand border, pointer) only for a user with `attendance-mark` inside the attendance window.

**Manual attendance (today only)**: click a today chip -> overlay popover under the cell with Mark Present / Mark Late / Mark Absent (no punch wording). Server supplies the time (`markedAt`, AM/PM); past/future rejected 403; outside window rejected; needs `attendance-mark` permission; activity-logged; Idempotency-Key + spinner; a device punch is never overwritten by a manual mark. Full rules in `prompts/fixes/attendance-fix1.md` section 3d.

**Student view needs a Class first**: with Person Type = Student and no Class chosen the grid shows an empty state ("Select a class to see students and mark attendance"); marking is allowed only inside a chosen class/section and the server verifies the student's enrolment there. (A behaviour rule, not in the html.)

**Sync status**: a "Last sync: <time AM/PM> / <n> punches" line near Sync Now.

**Actions**: checkbox-selected rows enable "Generate Report" (client-side modal built from currently-rendered chip counts). Recent Arrivals side panel: grouped Staff/Student, click a row to expand role/ID + monthly present-count.

## Backend

`AttendanceRecord`: one document per person per day (`punches:[{time,type}]` array), never one per punch event. Unique index `(adminId, personType, personId, date)` so a duplicate device-sync retry merges rather than duplicates.

`GET /grid` returns the whole visible month in one aggregation (not one query per day/person). Each manual mark is stored as `{status, markedAt, markedBy, source:'manual'}` and each device punch as `source:'device'`; the employee-code → person mapping in ingest indexes every staff/student (not only those with a `cardNumber`), unmatched codes are counted and logged.

### Device sync — WDMS integration, two-speed pipeline

**WDMS auth**: token-based only — never the dual Basic+Token client pattern seen in older reference integrations. One token per device, refreshed on 401, never re-authenticating per request.

**Fast path (raw ingest, powers the frontend's "live" pulsing-ring cell above)**: each WDMS poll/webhook hit writes raw punches straight to a `PunchLog` collection via `insertMany` (bulk, never per-punch `.save()`), deduped by a unique `punchHash = sha1(adminId+personId+punchTime)` index — a re-delivered punch from a retry just fails the unique check and is silently skipped, never duplicated. Immediately after the bulk insert, emit each punch over Socket.io (`{personId, status:'punched-in', time}` — minimal payload, per `performance-principles.md`'s real-time rule) so today's grid cell shows the live ring with zero reconciliation delay. No computation happens on this path.

**Slow path (reconciliation into `AttendanceRecord`)**: `POST /sync` enqueues a BullMQ job — a real `Worker` process consumes it (never a cron calling `exec()` on a child process). The job reads that batch's unreconciled `PunchLog` rows and merges them into the day's `AttendanceRecord.punches[]`, computing Present/Late/Absent status against the person's `Shift`. Job `jobId` is derived from `(adminId, deviceId, syncBatchId)` so BullMQ's own dedup drops a retried/duplicate enqueue before it ever reaches a worker — this reconciliation is allowed to lag up to ~2 hours behind the fast path; the grid just shows "live" until it catches up.

**Scale**: device polling is staggered per school via a `SYNC_WINDOW_MINUTES` offset (derived from `adminId`) so 2,000 schools' cron ticks don't all fire in the same second; worker concurrency is capped so one school's large sync can't starve others.

**Redis's role here is intentionally narrow** (per `state-management.md`/master-plan's Redis-scope decision): it backs the BullMQ queue, and optionally holds today's live-status per person with a short TTL (30–60s) purely to make a page-refresh mid-day show the ring immediately without waiting on a socket reconnect — never a general cache, never the source of truth (`AttendanceRecord`/`PunchLog` in Mongo always are).
