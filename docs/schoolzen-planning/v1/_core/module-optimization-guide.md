# Module Optimization Guide — caching, data-loading & real-time speed (locked — applies to every module)

Status: **FINAL** — v1
Depends on / extends: `performance-principles.md` (the baseline scalability/
speed/readability rules every module already inherits) and
`additional-technical-considerations.md`'s "Caching layer (Redis)" and
"Background job queue" sections (the `CacheService` and job-dedup
mechanics this file builds on top of).

**This file does not repeat what those two already say — it adds the
concrete, module-by-module wiring and the advanced request/response
patterns (cache stampede protection, write-through consistency,
Idempotency-Key header, frontend request de-duplication, HTTP-level
caching) that aren't covered there yet.** Read `performance-principles.md`
first; this file assumes it.

---

## 1. Why this file exists

A caching/performance rule stated only once in prose ("cache slow-
changing data") gets applied inconsistently across 13 modules unless
someone writes down, per module, exactly what gets cached, what
invalidates it, and what pagination it uses. Section 8 below is that
concrete matrix — treat it the same way `errors.md` is treated: a
module isn't done until its row in that matrix is implemented, not
just the happy-path CRUD.

## 2. Cache correctness — no stale/mismatched response after a write

This is the most common way caching goes wrong in production and the
one rule every module must follow without exception:

- **Same request, both writes.** A Create/Update/Delete controller
  writes to MongoDB **and** updates/invalidates the relevant cache
  key(s) inside the same request/transaction — never "write to DB now,
  let the cache expire on its own TTL later." A blind-TTL-only cache on
  mutable data is what produces the exact "action ki koi aur response
  aaye" (stale/mismatched result after an action) symptom.
- **Mutation responses return the fresh document**, already reflecting
  the write — the frontend never needs a follow-up GET to see its own
  change take effect, and the response is what re-populates the cache
  (write-back), not a separate re-fetch-from-DB step.
- **Invalidate, then optionally re-populate — never re-populate with
  stale data.** Order inside the transaction: (1) commit the DB write,
  (2) delete the affected cache key(s)/pattern, (3) optionally
  `set()` the fresh value if it's cheap to do so; if repopulating is
  expensive, just delete and let the next read recompute via
  `cacheService.wrap(...)` — a temporary cache-miss is always safer
  than a stale hit.

### Cache-stampede protection

When a hot key's TTL expires and many requests hit it in the same
instant (e.g. Dashboard stats right at the start of the school day),
naively they'd all miss together and hammer Mongo at once. Extend
`CacheService.wrap()` with a short-lived Redis lock (`SET key:lock NX
PX 3000`) so only the first caller recomputes; the rest either wait a
few hundred ms and re-read the now-warm key, or serve the previous
(slightly stale) value for that brief window rather than all
recomputing in parallel. This is a small addition to the existing
`wrap(key, ttlSeconds, fetchFn)` helper, not a new service.

### Tiered TTLs — one blanket number is wrong

- **Near-static config** (Class/Section/Stream list, FieldConfig,
  Role/permission set, TC Structure, Admit Card/Marksheet Structure,
  active `AcademicSession`): long TTL (30–60 min) **and** write-
  invalidated — effectively "cached until it changes."
- **Dashboard aggregates / Live Status counts**: short TTL (30s–2 min)
  — cheap to serve slightly stale, expensive to recompute on every
  request; see §6 for precomputing these in the background instead of
  computing them on the cache-miss path at all.
- **Never cached**: anything that must be transactionally correct the
  instant it changes — attendance punches, fee/payment balances, leave
  balances mid-approval, payroll lock state. These are read straight
  from MongoDB every time; caching them is where "wrong response after
  an action" bugs come from, so they're excluded on principle, not
  case-by-case judgement.

### Key convention (unchanged from `additional-technical-considerations.md`)

`{adminId}:{module}:{resource}[:{qualifier}]` — e.g.
`64f...:academic-setup:classes`, `64f...:dashboard:stats:2026-27`. A
write to `classes` invalidates via `cacheService.delPattern('64f...:academic-setup:classes*')`,
never a full-cache flush.

## 3. Idempotency-Key header — synchronous critical writes

`additional-technical-considerations.md`'s job-queue section already
gives every **background job** a dedup key. That covers async/bulk
work. It does not cover a **synchronous** POST/PUT that a flaky mobile
network or an impatient double-tap can genuinely send twice — Fee
Collection, Admission create, Payment-gateway webhook receipt, Payroll
lock/unlock, Leave approve/reject.

- Client generates a UUID once per user action (not per HTTP attempt)
  and sends it as an `Idempotency-Key` header. A `retry` of the same
  action (network timeout, user re-tapping after a spinner) reuses the
  same key.
- Server: a short-lived Redis record (`idemp:{adminId}:{key}` →
  `{status, response}`, TTL ~24h) is checked before processing. First
  request processes normally and stores its response under that key.
  A repeat with the same key returns the **stored response** directly
  without re-executing the write — a duplicate fee payment or a
  duplicate admission is a real financial/data-integrity bug, not a
  cosmetic one, so this is not optional for these endpoints.
- This is a request-layer guard *in addition to*, not instead of, the
  DB-level guards `error-catalog-conventions.md`'s concurrency section
  already specifies (unique index / conditional `findOneAndUpdate`).

## 4. Frontend data-loading discipline

Extends `performance-principles.md`'s "debounce search input" line with
the rest of the request-hygiene pattern real production Angular apps
use:

- **Field projection on every list call.** The service method for a
  table passes `?fields=name,rollNo,class,status` (whatever the columns
  actually show) — the backend controller's `.select()` (already
  required by `performance-principles.md`) mirrors exactly that list,
  never the full document.
- **Request de-duplication / in-flight sharing.** A service method
  backing a table or dropdown uses RxJS `switchMap` (cancels a
  superseded in-flight request when the user changes a filter again
  before the first response lands) and, for data requested from
  multiple places at once (e.g. the active `AcademicSession` needed by
  several widgets on one page), `shareReplay(1)` so five components
  asking for the same thing in the same tick trigger **one** HTTP call,
  not five.
- **Cancel on navigate-away.** Every subscription in a component uses
  `takeUntil(this.destroy$)` (or Angular's `takeUntilDestroyed()`) so a
  slow response for a page the user already left never applies stale
  data to a since-reused component instance.
- **Debounce, not just on search.** 300–500ms debounce applies to any
  input that fires a request per keystroke/toggle (search boxes, live
  filter checkboxes) — not just the one case already called out.
- **Retry policy — bounded, backed off, and idempotency-aware.** A
  failed request retries automatically only when it's safe to (GET, or
  a POST/PUT that carries an `Idempotency-Key` per §3): exponential
  backoff with jitter (e.g. 500ms → 1s → 2s, ±20% jitter), capped at 3
  attempts. **Never retry a 4xx** (validation/auth/conflict errors are
  not transient — retrying just repeats the same failure and can mask
  a real bug as "flaky network"); retry only on network failure/timeout
  or a 5xx.
- **No polling where a push exists.** Any screen that already has a
  real-time channel (see §5) must not *also* poll on an interval —
  pick one source of truth for "is this fresh."
- **Job-status polling (Bulk Import, bulk PDF generation, device sync
  "Sync Now") is bounded, never an unconditional forever-loop — but the
  bound applies to "stuck," not to "genuinely still working."**
  Confirmed real bug: a `jobId` polled every 1s indefinitely with no
  stop condition — if the worker that processes that queue isn't
  running, the job sits in `state:"waiting"` forever and the frontend
  polls it forever too, one request per second per open tab, for as
  long as the page stays open. The fix distinguishes two different
  situations, because a large Excel import (hundreds of rows) can
  legitimately take several minutes once it's actually running:
  - **`state:"waiting"` past ~30–60s** — the worker isn't picking the
    job up at all (it's not down to job size, nothing is happening
    yet). This is the "stuck" case: stop polling, show "this is taking
    longer than expected, the import may not have started — try again
    or contact support" with a manual retry. This is the case the
    reported bug actually was (worker process wasn't running).
  - **`state:"active"` with `progress` genuinely advancing** — this is
    real work in progress, not stuck; keep polling with backoff (2s →
    4s → 8s, capped at ~15s) for as long as `progress` keeps moving,
    with no fixed wall-clock cap — a 500-row import is allowed to take
    however long it actually takes. Only flag this as stuck too if
    `progress` stops changing for an extended stall window (e.g. no
    change for 2–3 minutes while still `active`) — that's the signal
    something crashed mid-job, not merely that the job is large.
  - Either stuck case shows an explicit state with a manual retry —
    never a silently-forever spinner, and never a hard timeout that
    cuts off a large-but-healthy import.

### Rendering-level frontend optimizations (Phase 1 — pure app code, no infra)

`performance-principles.md`'s "hash map, not array scan" rule already
covers lookups. This adds the rendering-cost side, consistent with
`state-management.md`'s `signal()`/`computed()` approach (no NgRx):

- **`@for` loops always carry a `track` expression** (Angular's control
  flow — the modern replacement for `*ngFor` + `trackBy`) keyed on the
  record's stable `_id`, never on array index — an index-keyed track
  makes Angular re-render every row below an insert/delete/reorder
  instead of just the changed one. Every table in this package
  (Manage Students, Manage Staff, Attendance grid, any `.dd` list) is
  affected the moment its data can change while mounted.
- **`ChangeDetectionStrategy.OnPush` on every list/table component.**
  With `signal()`-based state (already this app's pattern), a
  `computed()`/signal read already only notifies on genuine value
  change, so OnPush costs nothing extra to add and stops Angular's
  default zone-triggered check from re-walking a large table's
  component tree on every unrelated app-wide event (a click anywhere,
  a timer tick elsewhere). Set it as the default on new components,
  not an opt-in per page.
- **Virtual scrolling (`@angular/cdk/scrolling`) only where pagination
  doesn't already bound the DOM** — this package's tables are already
  paginated (§ "Pagination — keyset, not offset" and each module's own
  `optimization.md`), so a normal 25–50-row page never needs virtual
  scroll. Reserve `cdk-virtual-scroll-viewport` for the few screens
  that genuinely render many rows unpaginated at once by design —
  Attendance's per-class grid (all students × the visible date range)
  and the Excel Import preview (hundreds of parsed rows shown before
  commit) are the two real candidates in this package; don't add it
  to an already-paginated table, since that would be solving a problem
  the pagination already solved.
- **Skeleton loaders, not spinners** — already stated in
  `additional-technical-considerations.md`'s "Loading states" section;
  restated here only to tie it to the same rendering-perf concern: a
  skeleton matching the real table's column shapes avoids a full
  layout reflow when real data replaces it, which a centered spinner
  swapped for a full table does not.

## 5. Real-time updates — cross-reference

`performance-principles.md` §"Real-time updates" already states the
core rule (minimal delta payload over the socket, merge into
hash-map-keyed state, confirm polling vs. socket before assuming one).
This file adds only: when a module's real-time push and its own
mutation API can both change the same record (e.g. Attendance's device
sync pushing a punch while the same row is also open for manual edit),
the **socket delta and the HTTP mutation response must use the same
merge function** on the frontend — one `applyPersonUpdate(delta)`
helper per entity type, never two different merge code paths for "came
from API" vs. "came from socket" that could disagree.

## 6. Precomputed aggregates — Dashboard and any "stats" panel

Any screen showing counts/aggregates across a large collection
(Dashboard's overview, Attendance's Live Status counts, Fees' collection
summary) should not run its aggregation pipeline synchronously on the
cache-miss path once the underlying collection is large. Instead:

- A background job (BullMQ, cron-scheduled — e.g. every 1–5 min, or
  triggered on the writes that matter: a fee payment, an attendance
  punch batch) recomputes the aggregate and writes it to a small
  `DashboardStats`-shaped document (or the module's own precomputed-
  stats doc) keyed `{adminId, date/session}`.
- The GET endpoint reads that precomputed document (itself cached per
  §2's near-static tier, since it now only changes when the job runs) —
  turning an expensive live aggregation into a single indexed
  document read on every page load.
- This is the same shape as `additional-technical-considerations.md`'s
  job-queue pattern, applied to reads instead of writes — no new
  infrastructure, just a scheduled producer + a cached consumer.

## 7. HTTP-level and infrastructure-level speed

Not module-specific, but every module's API rides on these — one-time
app-level wiring, called out here so it isn't lost:

- **Compression — Brotli primary, gzip fallback, both wired through one
  middleware.** `compression` (or `shrink-ray-current`, which adds
  Brotli support on top of the same middleware shape) negotiates via
  the request's `Accept-Encoding` header automatically — a client that
  sends `br` gets Brotli, a client that only sends `gzip` (older
  browsers, tools, curl without flags) gets gzip; no per-route branching,
  one line in `app.js`. Brotli at quality level 4–6 for dynamic API
  responses (level 11 is too CPU-heavy for a live request path — reserve
  max-level Brotli for build-time pre-compression of static assets,
  where the cost is paid once, not per-request).
  - **Zstd is deliberately NOT used for HTTP API responses** — three
    concrete reasons, not just unfamiliarity: (1) `Content-Encoding: zstd`
    browser support is still recent-versions-only (Chrome 123+, Firefox
    126+) with inconsistent coverage on older Android WebViews, which
    this app's parent/school user base realistically still has; (2)
    Node's built-in `zlib` only gained native Zstd support in Node 22+ —
    an older LTS runtime would need an extra native-binding dependency
    just for this, which Brotli/gzip (already in `zlib` for years)
    don't require; (3) Zstd's real advantage is large-payload/streaming/
    storage compression where its speed-vs-ratio tuning matters — for
    this app's actual response sizes (JSON list/table payloads), Brotli
    already gives the better ratio with none of the above cost. **Zstd
    stays reserved for internal, non-browser-facing use** if it's ever
    needed — service-to-service calls, or compressing bulk Excel/PDF
    export files before they're stored/transferred — never for a
    browser-facing API response.
- **`Cache-Control`/`ETag` on genuinely static or rarely-changing GET
  responses** (a generated Marksheet/TC PDF once issued and locked, a
  school's logo, a Structure document between edits) — lets the
  browser/CDN skip the round-trip entirely on a repeat view, on top of
  (not instead of) the Redis layer.
- **Mongoose connection pool sized explicitly** (`maxPoolSize`, tuned
  to the deployment's expected concurrent request count) rather than
  left at the driver default — an under-sized pool becomes an
  invisible bottleneck under load that looks like "the app is slow" but
  is actually "requests are queued waiting for a free connection."
  Document the chosen value and the reasoning next to the Mongo
  connection setup, not buried in a `.env` with no comment.
- **CDN in front of Cloudinary-served and generated-PDF assets** —
  `additional-technical-considerations.md`'s Cloudinary section already
  covers folder organization; Cloudinary's own CDN already fronts those
  URLs, so this mainly means: generated Marksheet/TC/Admit-Card PDFs,
  once finalized, are also uploaded to Cloudinary (or equivalent) rather
  than re-generated server-side on every "Download" click — generate
  once, serve many times from the CDN. Every image URL uses Cloudinary's
  `f_auto,q_auto` transform params (see
  `additional-technical-considerations.md`'s File storage section) —
  this is a Phase-1, zero-infra win, not a Phase-2 item.
- **Angular service worker for the app shell (easy, optional)** —
  `@angular/service-worker` caching the compiled JS/CSS bundle and
  static assets (fonts, icons) means a returning user's SECOND visit
  loads the app shell from the browser's own cache instantly, before
  even checking the network — genuinely one CLI command
  (`ng add @angular/pwa`) plus a config file, no backend change. This
  caches the app shell only (code), never API data — API responses
  still go through §2's Redis layer, never the service worker's cache,
  since API data must stay correctness-first, not offline-first.

## 8. Per-module optimization catalog — lives in each module's own file

This file (like `error-catalog-conventions.md` is to each module's
`errors.md`) deliberately stays at the level of MACHINERY and
CONVENTIONS — the cache tiers, the invalidation discipline, the
Idempotency-Key pattern, the frontend request-hygiene rules. It does
not itself list which exact key caches which exact query for which
exact module, because that content is real per-module CONTENT, not
architecture, and belongs next to that module's own schema/pages —
exactly the same reasoning `error-catalog-conventions.md` gives for why
each module gets its own `errors.md` rather than one giant error list
living centrally.

Each module has its own `v1/<module>/optimization.md`, following this
file's conventions and structured the same way every time: **Cached
reads** (exact key pattern + tier from §2), **Invalidation triggers**
(which specific action busts which key), **Pagination** (cursor vs.
offset, per list), **Idempotency-Key required on** (which synchronous
endpoints, per §3 — explicitly "none" where that's true rather than
omitted), **Real-time / precomputed aggregates** (per §5/§6, where
applicable), and **Module-specific notes**.

| Module | File |
|---|---|
| Academic Setup | `academic-setup/optimization.md` |
| Student | `student/optimization.md` |
| Staff | `staff/optimization.md` |
| Attendance | `attendance/optimization.md` |
| Leave | `leave/optimization.md` |
| Holiday | `holiday/optimization.md` |
| Payroll | `payroll/optimization.md` |
| Fees | `fees/optimization.md` |
| Examination | `examination/optimization.md` |
| Certificates | `certificates/optimization.md` |
| Approvals | `approvals/optimization.md` |
| Settings | `settings/optimization.md` |
| Dashboard | `dashboard/optimization.md` |

## 9. Where this applies

Every module prompt (`prompts/<NN>-<module>.md`) reads its own
`<module>/optimization.md` explicitly (see its own "Read" list), which
in turn applies this file's conventions — in addition to inheriting
`performance-principles.md` automatically. A module isn't done until
its `optimization.md` is wired up, the same way it isn't done until
its `errors.md` cases are covered.
