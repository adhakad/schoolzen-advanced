# Performance, Scale & Readability Principles (locked — applies to every module)

Schoolzen targets a large network of schools with high daily attendance-event volume — these rules exist because of that, not as generic best-practice noise. Every module prompt inherits these automatically.

---

## Scalability

- Every collection is `adminId`-scoped with `adminId` first in every compound index — a query never scans across schools.
- High-volume collections (`AttendanceRecord`) are shaped for scale from day one: one document per person per day, not per event — see `database-design-principles.md`.
- Pagination is mandatory on every list endpoint (`limit`/`skip` or cursor-based) — never return an unbounded collection.
- Any bulk operation (Excel import, bulk card-assign, bulk role-assign) is one `bulkWrite`/`updateMany`, never a loop of individual writes from the frontend.

## Resource efficiency

- No client-side joins across separate API calls — one backend aggregation. A page that needs data from two collections gets it in one round-trip, not two requests stitched together in the browser.
- No N+1 queries — anything showing a per-row count or lookup (assigned-shift counts, subject-group tags) is one aggregation for the whole list, never one query per row.
- Use `.lean()` on every read-only Mongoose query — don't hydrate full Mongoose documents just to serialize them back out as JSON.
- **Project only the fields actually used** — `.select('name class status')` style projection on every query, never fetch a full document to read three fields. Applies especially to list endpoints (Manage Students, Manage Staff, any table) where the document has 20+ fields but the row only shows 6.
- Background jobs (device sync, PDF generation, bulk import processing, WhatsApp/SMS sends) run in the queue/worker layer, never inline blocking the HTTP request/response cycle.

## Pagination — keyset, not offset, for anything that can grow large

- **Default to keyset/cursor pagination** (`_id > lastSeenId`, indexed) for any list that can realistically grow large over a school's lifetime — Manage Students, Manage Staff, Attendance grid, Leave Requests, Fee Statement. Offset pagination (`.skip(N)`) degrades linearly as `N` grows (a full index scan to skip past N documents); keyset stays constant-time regardless of how deep the page is.
- Offset pagination (with a page-number UI, matching `.pagination-bar`'s look) is acceptable only for genuinely small, bounded lists (Academic Sessions, Leave Create, Shift list) where the total row count is inherently small (tens, not thousands) — the visual pattern (`.dd` rows-per-page + prev/next) stays identical either way; only the query mechanism underneath differs.

## Frontend lookups — hash map, not array scan

- Any place the UI repeatedly looks up "the record with this ID" (matching a WebSocket update to its row, resolving a selected checkbox's row, looking up a filter option's label) keeps that data keyed by ID (a `Record<string, T>` / `Map`, or an NgRx-style entity adapter) — never `array.find(x => x.id === id)` inside a loop or a frequently-called function. This is an O(1) vs O(N) difference that matters once a table has hundreds of rows (Manage Students at 600+, Attendance's grid).

## Real-time updates (where used) — minimal payload, not full objects

- Attendance Overview's "live" punched-now indicator (and any future real-time push, e.g. a live dashboard) should push only the minimal changed fields over the socket (`{personId, status, time}`), never the full person+attendance object — the client merges the delta into its already-held, hash-map-keyed state rather than replacing a whole record. Confirm with the actual implementation whether this page polls or uses a real socket connection before assuming one; this rule applies once a socket is genuinely used.

## Frontend responsiveness — optimistic updates for low-risk actions

- For actions with a very low realistic failure rate and easy rollback (toggling a checkbox, marking Read/Unread, a simple field edit), update the UI immediately and reconcile with the server response in the background, rolling back visually only if the request actually fails — don't make the user watch a spinner for every small interaction. Reserve the "wait for the server, then update" pattern for anything with real consequences (payment, delete, session-activation, biometric card assignment) where showing a false-positive success would be actively harmful.

## Speed

- Every list-driving query is backed by a real index matching its actual filter+sort — check the query shape against `database-design-principles.md`'s index list before assuming a query is fast.
- Cache genuinely stable, expensive-to-recompute reads (Dashboard's aggregated stats, today's Live Status counts, a school's rarely-changing config like Academic Sessions or Role list) in Redis with a short TTL — this is what actually gets a repeat read down to single-digit milliseconds, since it skips the aggregation entirely. Never cache anything that must always be live-correct (attendance punches, fee payments, anything inside a transaction) — see `additional-technical-considerations.md`'s caching-layer section for the full read-through/invalidation pattern.
- Frontend: avoid re-rendering an entire large table on every keystroke in a search box — debounce search input before firing a request.

## Readability

- Follow `frontend-backend-folder-structure.md` exactly — a reader should find any given piece of logic by its layer+module path without guessing.
- A value or piece of logic used in more than one place is ONE shared function/pipe/service — never copy-pasted per component (this was a confirmed real problem in the legacy codebase: a class-number-to-suffix conversion existed 3 separate times in one file).
- Error handling and success messages are always centralized (`helpers/errors/`, `helpers/messages/`) — never a bespoke string or ad-hoc try/catch shape per controller.
- Prefer clear, descriptive names over comments explaining unclear ones; comment the WHY (a non-obvious constraint or decision), not the WHAT the code already says.

## Time complexity

- Any in-memory loop over user data (validating a bulk-import sheet, computing dashboard stats from a fetched list) stays linear in the input size — avoid nested loops over the same collection when a lookup structure (`Map`/`Set`) or a single aggregation would do it in one pass.
- Prefer doing filtering/sorting/counting in the database query (indexed) over fetching everything and filtering in application code.
- For genuinely large computations (bulk payroll generation across hundreds of staff, bulk marksheet generation across a class), do the heavy computation in a background job, not synchronously inside the request that triggered it — the request enqueues and returns immediately; the frontend polls or gets notified on completion.

## Where this applies

Every module prompt (`prompts/<module>.md`) inherits these rules automatically — a module's own prompt calls out anything MODULE-SPECIFIC beyond this baseline (e.g. Attendance's per-day-not-per-punch document shape), not a restatement of these general rules.
