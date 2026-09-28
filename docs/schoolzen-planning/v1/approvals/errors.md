# Approvals — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — written from `approvals.md`/`.html` plus a targeted
re-read of `leave-request.js` (the only real source this inbox unions
today) and a repo-wide search for any other approve/reject action
(`payroll.js` only mentions "approved leave" in a display string —
there is no second approvable-request type in the legacy codebase).
This page has **no controller and no model of its own** — Approve/Reject
here call the exact same `leave-request.js` endpoints Leave Requests'
own buttons call, so almost every error case below is inherited, not
new; `leave/errors.md` already covers `ApproveLeaveRequest`'s
read-then-write TOCTOU race in full and is not re-derived here, only
cross-linked. What genuinely is new to this page — because it is the
one place in the app reading a *union* of collections instead of one —
is how pagination, counting, and staleness behave across a
heterogeneous, actively-mutating queue. Organized by the 9 shapes, one
case-table per shape actually used; several shapes (1, 2, 6, 7) don't
apply — this page creates nothing and has no form or bulk action of
its own.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it); `leave/errors.md` (Approve/Reject's own guard and race)

## Shape 3 — Cross-field / business bound (specific to the aggregation)

| Case | Code | Message | Notes |
|---|---|---|---|
| **The union's declared common sort key doesn't actually exist on the only real source yet** | (a build-time contract gap, not a runtime error) | — | `approvals.md` says every unioned source exposes "a common `createdAt`-equivalent field" for the `$unionWith` to sort/paginate on. The real `GetLeaveRequestPagination` sorts by `{fromDate:-1, _id:-1}` — there is no `createdAt` involved, and `LeaveRequest` isn't confirmed to have one indexed. Before this page can safely union a second source, `LeaveRequest` (and every future source) needs an actual indexed `createdAt` (or an explicit, documented decision to sort the merged queue by `fromDate` instead) — otherwise "sorted by newest request" silently means something different per source once a second type is added |
| A future request-producing module's source collection doesn't expose the agreed `adminId`+sort-key shape | (a build-time/integration failure, not a user-facing error) | — | Same contract gap, generalized. Listed here so the check happens once, at the point a second source is wired in — a new module's own `errors.md` inherits its approve/reject error cases (like Leave's) without needing anything new added to this file |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| Approve/Reject clicked on a row whose underlying request no longer exists | `REQUEST_NOT_FOUND` | "This request no longer exists — it may have been removed." | Inherited from `leave-request.js`'s own 404 shape today; genuinely new once a second source exists, since the union has to resolve which source collection a given row's `type` came from before it can even attempt the lookup — a malformed or stale `type` tag on a row is itself a `REQUEST_NOT_FOUND`, not a 500 |
| A row's source record is deleted (not just re-actioned) by an admin working directly in that module, while the row still sits in this shared queue | `REQUEST_NOT_FOUND` | (same as above) | Distinct from the state-transition case below — Leave has no hard-delete-a-pending-request path today, but the aggregation must not assume every source module will keep that invariant forever; the union read itself can silently drop a row whose source document vanished between the list query and paging into it, which is a plain stale-page symptom, not an error at all, until the user tries to act on that row |

Wrong-tenant is always reported identically to genuinely missing — never a 403 — matching `leave/errors.md`'s own rule, since every row here still resolves to a real `adminId`-scoped source lookup underneath.

## Shape 5 — State-transition guard

| Case | Code | Message | Notes |
|---|---|---|---|
| Approve/Reject clicked on a row that's no longer Pending | `REQUEST_NOT_PENDING` | "This request has already been actioned." | Same `ConflictError` Leave Requests' own buttons raise — this page calls the SAME endpoint, never a parallel implementation, so this is inherited behavior. Per the conventions file's rule for shape 5, the UI must refresh (here: remove) that row from its own list on receipt of this error, not just toast it |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Approving from Approvals races approving the same request from Leave Requests directly | `REQUEST_NOT_PENDING` | (same as shape 5) | Exactly the scenario the shared-endpoint design exists to make safe — whichever click reaches the server first wins once `leave/errors.md`'s conditional-write fix lands there; until it does, this page inherits that same unfixed double-approval race, since it is not a parallel bug to fix here, it is the same bug through a second door |
| **A row is approved/rejected by someone else between this page loading its current page and the admin acting on (or paging past) it** | (today: silent skip or duplicate row on the next page, not a user-facing error at all) | — | **This is the finding genuinely specific to this page.** A single-collection paginated grid (Leave Requests' own list) only has to tolerate its own rows changing status under it. This page's queue additionally shrinks out from under a *skip/limit* union query as other admins clear Pending rows from any source — classic offset-pagination drift: an admin sitting on page 2 who has page 1 approved out from under them by someone else gets page 2 re-computed with different rows shifted up, silently seeing an item twice or missing one entirely, with no error surfaced because the query itself succeeded. Gets worse, not better, as more source types union in, since each is mutating independently. The fix is the same one the conventions file already prescribes for concurrency (prevent over detect): paginate the union on a stable keyset cursor (last-seen `adminId`+sort-key+`_id`) rather than `skip`/`limit`, so a row leaving the Pending set shifts nothing for an admin already past it |
| Two admins both act on two *different* rows from two *different* source types at the same time | (no conflict — independent writes) | — | Not a race at all; called out only to confirm the union adds no shared-resource contention beyond what each source's own endpoint already serializes for its own rows |

---

## Backend controller requirements

- **Fix the sort-key contract before adding a second source**: either give `LeaveRequest` a real indexed `createdAt` and re-point `GetLeaveRequestPagination`'s sort to match what `approvals.md` promises, or explicitly redefine the union's common sort key as `fromDate` and document that instead — today the plan and the code disagree, and a second source built against the plan as written will sort inconsistently against Leave's rows.
- **Paginate the union on a keyset cursor, not `skip`/`limit`** — see the Shape 9 finding above; this is the module's own version of "database-level guard over pre-check-then-write," applied to reads instead of writes, and it's the one piece of this page that has no equivalent in any single-collection module reviewed so far.
- **Approve/Reject stay a pure pass-through to each source's own endpoint** — no new write path, no new validation, no duplicated business logic. If a future source's approve/reject action doesn't already return the acted-on row's fresh state in its response body, add that at the source, not here, so this page can update the row in place instead of re-fetching the whole union.
- **Any "N pending" count or badge this page shows must be computed from the same union match at read time**, never cached per source and summed client-side — otherwise the Type filter's counts drift the moment a second source is added with its own independent count endpoint.
- **Everything else is inherited, not owed here**: tenant isolation, the approve/reject conditional-write race, and safe-worded error responses are `leave-request.js`'s responsibility per `leave/errors.md` — this page must not silently re-implement (and re-break) any of that logic locally.

## Frontend component requirements

**No legacy precedent exists for this page at all** — there is no `approvals`-named component anywhere in the current Angular admin app; this is new-for-v2 UI with nothing to port and nothing to diff against. Requirements below are derived from first principles, matching the guard patterns already proven out in Leave/Holiday:

- **Per-row `isClick`-style guard on Approve/Reject, keyed by row id, not one page-level flag** — because this list can hold several independently-actionable rows at once (unlike a single-record form), a global "request in flight" flag would block one row's action while another is still loading. Each row's Approve/Reject icons disable independently for the duration of that row's request.
- **Optimistic removal from the queue on a successful Approve/Reject**, rather than re-fetching the current page — the row simply drops out of the visible list; only a failed action re-adds it (with the server's message), so the list never flashes to a stale full reload for a one-row change.
- **A `REQUEST_NOT_PENDING`/`REQUEST_NOT_FOUND` response on click must remove that row from the list with an inline toast** ("Already actioned by someone else — refresh to see the latest.") instead of a generic error banner that leaves a now-invalid row sitting in the table inviting a second failed click.
- **Empty state and error state must be visually distinct** — "no pending approvals" (an empty union result) and "couldn't load approvals" (the fetch itself failed) are different outcomes an admin needs to tell apart at a glance; collapsing them into one blank table is the same class of gap flagged for missing error callbacks in Holiday/Leave's list fetches, worth avoiding from the start here since there's no legacy fetch to copy the bug from.
- **Changing any toolbar filter (search, the Person-Type cascade, Type, Status) must reset pagination to page 1** — standard for any filtered grid, but worth stating explicitly here since a stale page number against a freshly-filtered, differently-sized union result is exactly the kind of off-by-page confusion the Shape 9 cursor fix above is meant to prevent.
- **The per-type "Details" one-line summary needs an explicit fallback for an unrecognized `type`** (e.g. "View details") rather than a null/blank cell or a thrown error — the whole point of this page's design is that new approvable-request types union in over time, and the frontend's per-type renderer will lag the backend's source list at least once.

---

**Structure and depth follow the Leave / Holiday / Certificates modules' format** (`leave/errors.md`, `holiday/errors.md`, `certificates/errors.md`); this page's error surface stays intentionally thin because it borrows almost all of it from Leave.
