# Dashboard — Errors & Validation

Status: **FINAL** — rewritten after reading `dashboard.md`/`.html` against
the actual legacy `dashboard.component.ts` and a controller-list grep, not
just the v2 reference doc. Two things the reference doc doesn't say
out loud: there is **no `dashboard.js` controller in legacy at all** — the
grep for `dashboard|summary|overview` across every controller file
returns nothing dashboard-shaped, only unrelated hits (`subjects`,
`admin-user`, `salary-structure`, `attendance`, `payment`, the three
`student/*` controllers) that happen to contain one of those words. And
the legacy dashboard is **not one aggregation endpoint** — it's five
uncoordinated service calls (`getStudentCount`, `getTeacherCount`,
`geteExamResultCount`, `getRemainingWhatsappMessageCount`,
`getIssuedTransferCertificateCount`) plus a sixth (`feesCollectionBySession`)
that alone drives three chart renders. `dashboard.md`'s single `GET
/dashboard` endpoint, the week's attendance bar, the calendar, pending
approvals, and upcoming holidays are **new v2 work with no legacy
precedent to derive from** — legacy has no attendance widget, no
calendar, no approvals list, no holidays list. Read-only page, no
create/update/delete, so most of the 9 shapes don't apply; this file
covers the ones that do plus the widget-isolation/tenant-scoping
concerns a dashboard is actually about.
Depends on: `_core/error-catalog-conventions.md`

## Shape 8 — External-service / infrastructure failure

| Case | Code | Message | Notes |
|---|---|---|---|
| The `GET /dashboard` aggregation (or, until that endpoint exists, any one of its constituent sub-queries) times out or throws | `DASHBOARD_LOAD_FAILED` | "Couldn't load this — try refreshing." | Scoped **per widget**, not per page — see Critical section. `InternalError`/`ExternalServiceError` depending on cause |
| Attendance-today (or this-week) percentage computed with a zero-size denominator — a declared holiday, a Sunday, or before any period's attendance has been marked yet | (not an error) | Hero stat and bar shows "—" or "No school today", never `NaN%`/`Infinity%`/a stale carried-over number | Purely new v2 logic (no legacy attendance widget exists to derive this from) — the guard has to be written from scratch: check holiday/working-day status and "any attendance rows exist yet for today" before dividing, not after |
| `feesCollectionBySession` fails | `DASHBOARD_LOAD_FAILED` | "Couldn't load fee data — try refreshing." | Today this one failure silently kills all three charts (pie, bar-total, monthly-bar) at once, since all three are only initialized inside this call's success branch — see Critical section |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two page loads race the same short-TTL cache miss and both recompute the aggregation | (not an error — acceptable duplicate work) | — | Read-only, no write conflict; a request-coalescing lock is more complexity than this page's cost justifies |
| A write elsewhere (fee payment, attendance sync, leave approval) lands in the gap between this page's cache read and the next TTL expiry | (not user-facing unless it persists) | — | See "last-updated" note below — the real defense is proactive cache invalidation on those writes, not detecting the race here |

## Critical — widget isolation and staleness (the two things a dashboard actually needs to get right)

**Widget-by-widget failure isolation is the module's central requirement, and legacy already gets half of it right by accident and half wrong.** The five count calls (`studentCount`, `teacherCount`, `marksheetCount`, `remainingWhatsappMessageCount`, `transferCertificateCount`) are independent `subscribe()`s, so one failing genuinely doesn't block the others — that part of the shape is fine and should carry into v2. But **none of the six calls has an error callback at all** — a failed request just leaves that card's number at its default (`0` or `undefined`), which renders identically to "this school genuinely has 0 students," never a distinguishable failed/empty state. And `feesCollectionBySession` is the opposite failure mode: it drives three separate chart widgets (fee pie, fee totals bar, monthly-collection bar) from one subscribe, so one fee-data failure blanks all three at once even though they're presented as separate cards. v2's single `GET /dashboard` aggregation response must not repeat either mistake: each widget's slice of the response needs its own success/error/loading state on the frontend, and a failure in one sub-aggregation (server-side) must not 500 the whole response — return that widget's slice as an error object the frontend renders as a per-card "couldn't load, retry" state, while every other widget's data still ships.

**The loading flag is also page-wide and fake.** `ngOnInit` sets `loader = false` on an unconditional `setTimeout(..., 1000)` fired the moment the six calls are *initiated*, not when any of them resolve — so on a slow network the spinner disappears a full second before real data exists, and on a fast network it stays a second after data already arrived. Same defect already flagged for Holiday's list fetch. v2 must key loading state off each widget's own request lifecycle, never a fixed timer standing in for it.

**Tenant scoping**: every legacy call sends `adminId` as a client-supplied request param (`{ adminId: this.adminId }`), meaning correctness today depends entirely on each backend handler re-deriving or verifying it rather than trusting the body — the same class of risk flagged for single-record lookups elsewhere in this codebase, just here at aggregate scale: a tampered or stale `adminId` doesn't leak one record, it leaks a whole school's totals into another school's dashboard (someone else's student count, fee collection, attendance %). Since no dedicated dashboard controller exists to audit, this must be a hard build-time requirement for `GET /dashboard` rather than a ported behavior: `adminId` comes from the authenticated session/token only, is never accepted from the request body/query, and is the first `$match` stage of every sub-aggregation — never fetch-all-then-filter-in-Node.

**Staleness**: `dashboard.md` specifies a 60–120s cache via `CacheService`, invalidated proactively on fee payment / attendance sync / leave approval. Until that invalidation is verified working, the response needs a visible "as of HH:MM" indicator rather than presenting cached numbers as live — an admin who just collected a fee and sees last-cache's total needs to know it's a cache, not a wrong number.

---

## Backend controller requirements

- **Build `GET /dashboard` as one endpoint, genuinely new** — no legacy controller to port from or diff against; every sub-aggregation is new code.
- **`adminId` from the authenticated context only, never from the request** — first `$match` stage of every sub-aggregation pipeline; this is the single most important error class for this page (see Critical section).
- **Each sub-aggregation fails independently** — a thrown error in one (e.g. the fee-donut pipeline) must be caught and returned as that widget's own error slice, not allowed to fail the whole request.
- **Attendance-today/this-week percentage must guard the zero-denominator case explicitly** — holiday, non-working day, or "no attendance marked yet today" all need a distinct non-numeric result, never a raw division.
- **Wire cache invalidation** on fee payment, attendance sync completion, and leave approval — the three writes `dashboard.md` names — and include a `generatedAt`/cache-age field in the response so the frontend can show "as of" instead of presenting a cache silently as live.

## Frontend component requirements

- **Give every widget its own loading/error/empty state**, driven by that widget's own request settling — not a single page-wide `loader` flag on a fixed `setTimeout`, and not silence on failure. A failed widget should visibly say so (with a retry), never just show a bare `0` indistinguishable from a real zero.
- **Add error callbacks to every dashboard subscribe** — today none of the six legacy calls has one; this is the direct cause of the "0 looks like failure looks like empty" ambiguity above.
- **Split the fee-chart trio's fate from each other**, or at minimum from the count cards — one failed fee-data fetch currently blanks three chart widgets at once; v2's per-widget response slices (see backend) should let the frontend render pie/bar/monthly-bar independently too, once the API supports it.
- **All shown numbers are server-authoritative** — the percentage math (attendance %, fee-collected %) happens in the aggregation, not recomputed client-side from raw sums, so the same divide-by-zero guard only has to exist once.
- **Show the "as of" / cache-age indicator** wherever a stat could plausibly be a minute stale, rather than implying every number is live.
