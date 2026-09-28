# Leave — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
`leave-assignment.js`/`leave-request.js`/`leave-type.js` controllers and
the legacy Angular components (`leave-limit`/`leave-request`/`leave-type`).
Unlike Staff and Academic Setup, this module's backend is already a
carefully-written v2 controller (transactions, working-day expansion,
balance aggregation) — most of the gaps below are narrower than "no
check existed at all," but the two that do exist (a real approval race
and a silent tenant-isolation hole) are as serious as anything found in
the other modules. Organized by the 9 shapes, one case-table per shape
actually used — same precedent as Staff/Academic Setup.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Leave Type name blank | `LEAVE_TYPE_NAME_REQUIRED` | "Name is required." | `leave-type.js`'s `CreateLeaveType`/`UpdateLeaveType` already check this |
| Leave Type `maxDaysPerYear` missing/non-numeric/≤0 | `LEAVE_DAYS_INVALID` | "Enter a valid number of days." | Frontend form already enforces `min(1)`; backend has **no independent check** — a direct API call can save `maxDaysPerYear: -5` or a string |
| Apply Leave: date range missing or To before From | `LEAVE_DATE_RANGE_INVALID` | "Choose a valid date range." | `createRequest` already validates this correctly |
| Apply Leave (admin path) for a past `fromDate` without `allowPastDates` | `LEAVE_PAST_DATE_BLOCKED` | "Cannot apply leave for past dates." | Teacher route hard-codes `allowPastDates:false` and cannot reach the override — correct, keep as-is |
| Leave Assign bulk-assign: `leaveTypeIds`/`persons` empty or malformed | `VALIDATION_FAILED` | "Select at least one leave type and one person." | `BulkAssignLeave` never guards an empty array before `Promise.all`/`bulkWrite` — an empty `persons[]` currently succeeds silently with `assignedCount:0`, which reads as success rather than "nothing selected" |

## Shape 2 — Uniqueness

| Case | Code | Message | Notes |
|---|---|---|---|
| Leave Type name already exists (case-insensitive) | `LEAVE_TYPE_DUPLICATE` | "A leave type with this name already exists." | Pre-check only via `RegExp` (see Shape 9) — no unique index today |
| A person already has a `PersonLeaveAssignment` for this type (Leave Assign) | (not an error — by design) | — | `BulkAssignLeave` is intentionally idempotent-by-upsert: an existing row is matched and left untouched, reported as `skippedCount`, never a conflict. Correct as built — no code change needed here |

## Shape 3 — Cross-field / business bound (the module's core logic)

| Case | Code | Message | Notes |
|---|---|---|---|
| Requested days exceed remaining balance at creation | `LEAVE_BALANCE_EXCEEDED` | "Not enough {type} balance: N day(s) left, M requested." | `createRequest` computes this correctly against the real per-person assignment (or the type's `maxDaysPerYear` when unassigned) — no override on this path, by design |
| **New leave request overlaps an existing Pending/Approved request for the same person** | `LEAVE_REQUEST_OVERLAP` | "This person already has a leave request covering these dates." | Enforced in `createRequest` (a `fromDate ≤ toDate` / `toDate ≥ fromDate` overlap query), correctly excluding Rejected rows — **this case existed in code but was missing from this catalog entirely**; must ship with the rest |
| Requested range expands to zero grantable working days (all Sundays/holidays) | `LEAVE_RANGE_EMPTY` | "This date range has no working days to grant." | Checked both at creation and again at approval time (the calendar can change between the two) |
| No `PersonLeaveAssignment` exists for this person+leaveType | `LEAVE_LIMIT_MISSING` | "This person has not been assigned this leave type — assign it first before approving." | Blocks **approval only**, not creation — a request can be filed against the type's school-wide cap before anyone is individually assigned |
| Leave Type's `applicableTo` doesn't match the requesting person's type | `LEAVE_TYPE_NOT_APPLICABLE` | "This leave type does not apply to a {personType}." | |
| Leave Type is `status:'inactive'` | `LEAVE_TYPE_INACTIVE` | "This leave type is inactive." | Applies to `createRequest`; an inactive type is correctly excluded from `GetApplicableLeaveType`'s dropdown already |
| Narrowing a Leave Type's `applicableTo` while requests from another person type exist against it | `LEAVE_TYPE_NARROW_BLOCKED` | "This leave type is already used by another person type and cannot be narrowed." | `UpdateLeaveType` already guards this — **but the guard's own lookup query has no `adminId` filter**, so it can be tricked by an ID that happens to collide across schools (see tenant-isolation note below) |
| `forceApprove:true` used to approve a request that has no `PersonLeaveAssignment` at all | (not honored — correctly rejected) | "This person has not been assigned this leave type — assign it first before approving." | Confirmed in `ApproveLeaveRequest`: `forceApprove` only bypasses the balance comparison, never the assignment-exists check — this distinction must survive the rebuild exactly as-is |
| Cancel attempted after `toDate` has passed | `LEAVE_ALREADY_COMPLETED` | "This leave has already been completed and cannot be cancelled." | Server wall-clock (`nowWallClock()`), not client's — correctly implemented |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| Approving/rejecting/cancelling/deleting/viewing a request that doesn't exist, **or belongs to another school** | `LEAVE_REQUEST_NOT_FOUND` | "This request no longer exists." | See "Critical — tenant isolation" below — every one of these five handlers currently looks up by bare `_id` with no `adminId` check |
| Leave Type referenced by a request no longer exists (at decoration time) | (non-blocking, renders blank) | — | `decorateRequests` already falls back to `leaveTypeName: ''` gracefully; no hard error needed, but flag as a data-integrity signal worth a `warnings[]` entry rather than silent blank text |
| Editing/deleting a Leave Type by an ID that doesn't exist or belongs to another school | `NOT_FOUND` | "This record no longer exists." | `GetSingleLeaveType`, `UpdateLeaveType` (the `findByIdAndUpdate`), and `DeleteLeaveType` all filter by bare `_id` only — same class of gap as the request handlers |
| Leave Assign bulk-assign references a Leave Type ID that doesn't exist (already tenant-scoped correctly) | `LEAVE_TYPE_NOT_FOUND` | "One or more leave types were not found." | `BulkAssignLeave` already does this one correctly (`LeaveTypeModel.find({_id:{$in:...}, adminId})`) — the pattern every other lookup in this module should copy |

## Shape 5 — State-transition guard

| Case | Code | Message | Notes |
|---|---|---|---|
| Approve/Reject attempted on a request that isn't Pending | `LEAVE_NOT_PENDING` | "This request is already {status}." | Checked via a `findOne` read before the write — see Shape 9 for why this is not actually race-proof |
| Cancel attempted on a request that isn't Approved | `LEAVE_NOT_CANCELLABLE` | "Only an approved leave can be cancelled." | Same read-then-write pattern |
| There is no "edit a submitted request" path at all today (Pending or otherwise) | (by design — not a gap) | — | Only Create/Approve/Reject/Cancel/Delete exist; an admin who mis-filed a request rejects or deletes it and re-applies. Worth confirming with product before the rebuild, since Staff/Student both support post-submit edits |

## Shape 6 — Cascade / in-use delete block

| Case | Code | Message | Notes |
|---|---|---|---|
| Delete a Leave Type that has existing Leave Requests against it | `LEAVE_TYPE_IN_USE` | "This leave type is used in a leave request and cannot be deleted." | `DeleteLeaveType` already blocks this correctly |
| **Delete a Leave Type that has existing `PersonLeaveAssignment` rows (entitlements) but no requests yet** | (currently: silently deleted, no warning at all) | — | This is the real gap: `DeleteLeaveType` only guards against `LeaveRequestModel`; if the guard passes it unconditionally `deleteMany`s every matching `PersonLeaveAssignment` row with **no count returned and no confirm-overwrite step** — an admin who bulk-assigned 200 staff a new leave type, then deletes it before anyone applies, loses that entitlement data with a plain "deleted successfully" toast and nothing else. Must become part of the same `LEAVE_TYPE_IN_USE` block (`"used by N assignment(s)/N request(s)"`), not a silent cleanup step |

## Shape 9 — Concurrency (the module's second core concern, alongside balance math)

| Case | Code | Message | Notes |
|---|---|---|---|
| **Two concurrent `PUT /approve` calls on the SAME request** | `LEAVE_ALREADY_ACTIONED` (`ConflictError`) | "This request was already approved a moment ago." | **Confirmed real race, not a hypothetical.** `ApproveLeaveRequest` reads the request with a plain `findOne`, checks `status !== 'Pending'` in application code, then — after the balance check — writes with `LeaveRequestModel.updateOne({_id: id}, {$set:{status:'Approved',...}})`: **that final filter carries no `status:'Pending'` condition.** Two overlapping approve requests (double-click, or two admin tabs) can both pass the initial read before either commits, both enter the transaction, both `bulkWrite` the same attendance rows (harmless — upserts on the same keys) and both `$inc: {usedDays: dateKeys.length}` on the `PersonLeaveAssignment` — **silently double-deducting the person's balance** with no error surfaced to either caller. Must become `LeaveRequestModel.findOneAndUpdate({_id:id, status:'Pending'}, {$set:{status:'Approved',...}}, {session})` inside the transaction; a `null` result means someone else already actioned it, abort the transaction and return `LEAVE_ALREADY_ACTIONED`. The exact same gap exists in `RejectLeaveRequest` (harmless there — rejecting twice writes the same `status:'Rejected'` — but still not idempotent-by-guard, worth the same fix for consistency) |
| Two concurrent approvals of **different** Pending requests for the same person+type that together exceed the allocation | `LEAVE_BALANCE_EXCEEDED` | (same as Shape 3) | Once the fix above lands, the conditional `findOneAndUpdate` on each request's own `_id` still does not, by itself, serialize the two balance checks against each other — the safe fix is the same one used elsewhere in this codebase: keep the `usedDays` read fresh per request (already true) and accept that the second approval is intentionally allowed to still land the person in a negative `remaining` value if `forceApprove` was used, exactly as `balanceAfterApproval`'s "deliberately not clamped" comment already documents; without `forceApprove`, the loser's balance check (`used + dateKeys.length > allocated`) reads the OTHER request's now-committed `usedDays` increment and correctly refuses — this one is already race-safe by construction, unlike the same-request case above |
| Two admins create the same Leave Type name at once | `LEAVE_TYPE_DUPLICATE` | (same as Shape 2) | `CreateLeaveType`/`UpdateLeaveType` guard uniqueness with a `findOne` pre-check only — needs a real unique index (`adminId`, case-insensitive collation on `name`) + `11000` catch converted to `ConflictError` |
| Unescaped user search text built into a `RegExp` | `VALIDATION_FAILED` (internal 500 today) | n/a | `leave-type.js`'s `GetLeaveTypePagination` (search) and `CreateLeaveType`/`UpdateLeaveType` (duplicate check) all interpolate raw `name`/`searchText` into `new RegExp(...)` with no escaping — a `(`, `*`, or unbalanced bracket 500s the request; same ReDoS/invalid-pattern class flagged across every other module reviewed this session |

---

## Critical — confirmed tenant-isolation gap, must appear in the backend build, not be silently dropped

**Every single-record lookup in `leave-request.js` and three of `leave-type.js`'s five handlers filter by bare `_id`, with no `adminId` check at all**: `GetSingleLeaveRequest`, `ApproveLeaveRequest`, `RejectLeaveRequest`, `CancelLeaveRequest`, `DeleteLeaveRequest` (all `findOne({_id: id})` or a status-array write keyed the same way), and `GetSingleLeaveType`, `UpdateLeaveType`'s primary write (`findByIdAndUpdate(id, ...)`, though its own duplicate-name pre-check does correctly scope by `adminId`), and `DeleteLeaveType` (`findByIdAndRemove(id)`). A guessed or enumerated `_id` from one school lets an admin at a different school view, approve, reject, cancel, delete, or edit that school's leave data — including writing attendance rows for another school's staff/students via `ApproveLeaveRequest`. This is the same class of bug Staff's `errors.md` flagged for `staff.js`/`teacher.js`, and must be closed the same way: `findOne({_id, adminId})` everywhere, wrong-tenant reported identically to genuinely missing (404, never 403).

---

## Backend controller requirements

- **Tenant isolation on every single-record lookup, across both files** — see the Critical section above; this is the single largest gap in the module and must land before anything else here.
- **Approve/Reject become conditional writes (`findOneAndUpdate` with `status:'Pending'` in the filter, inside the existing transaction), not a read-then-write** — see the confirmed race in Shape 9. This is the module's own version of "database-level guard over pre-check," which the conventions file already prescribes and which this controller gets right for the *balance* check but wrong for the *status* check.
- **`DeleteLeaveType`'s cascade check must include `PersonLeaveAssignment`, not just `LeaveRequestModel`**, and report both counts in one `LEAVE_TYPE_IN_USE` response so the frontend can show "N assignment(s), N request(s)" rather than deleting entitlement rows with zero signal.
- **`BulkAssignLeave` needs a guard against an empty `persons[]`/`leaveTypeIds[]`** before it does any work — currently returns a silent `200 {assignedCount:0, skippedCount:0}` for a no-op call, which is indistinguishable from "everyone already had it."
- **`Leave Type` uniqueness and `maxDaysPerYear` need real validation**, not a pre-check-then-write and not an absent check: a unique case-insensitive index on `(adminId, name)` with an `11000` catch, and an explicit `maxDaysPerYear` range check server-side (currently frontend-only).
- **Sanitize search/name input before building a `RegExp`** in `leave-type.js`, same issue flagged in every other legacy-adjacent controller reviewed this session.
- **Replace `LeaveTypeModel.count()` with `countDocuments()`** (`countLeaveType`, `GetLeaveTypePagination`) and the raw string error responses (`'Internal Server Error!'`, plain string 400s) with the shared typed-error middleware, matching the response-shape contract every other module's catalog already commits to — `leave-request.js` and `leave-assignment.js` are closer to this already (structured logging via `logger.error`) but still return bare strings on the error path, not the `ApiError` envelope.
- **Everything already correct and must not regress in the rebuild**: the approval transaction's attendance+status+usedDays write is properly atomic as a group (the bug is only in the *filter*, not the *transaction boundary*); `expandLeaveDates`/`expandLeaveDatesForPage` correctly exclude Sundays and both holiday sources; `forceApprove` correctly never bypasses the assignment-exists check; overlap validation on create is correct and complete; cancel/delete correctly reverse `usedDays` through a clamped pipeline update rather than a bare `$inc`.

## Frontend component requirements

- **This module's Angular components are materially more defensive than Staff/Academic Setup's** — every dropdown fetch (`getClassOptions`, `getPeopleOptions`, `getLeaveTypeOptions`, `getGrid`, `getLeaveBalance`) already has a proper error callback that clears the list/shows a toast rather than throwing, and every mutating action (create, approve, reject, cancel, delete, bulk-assign, leave-type CRUD) already gates on an `isClick` flag with the button `[disabled]` bound to it. None of the "missing error callback" / "no double-submit guard" gaps found in Staff and Academic Setup recur here — do not port a generic fix for those into this module's plan.
- **The Approve/Reject/Cancel/Delete row icons are not themselves guarded against a rapid double-click**, only the modal's confirm button is — clicking a row icon twice quickly opens the confirmation modal state twice in succession with no visible effect today (low severity, since no network call fires until the modal's own guarded button is pressed), but should be a one-line fix (disable the icon while `showModal` is true) rather than left as an inconsistency with how carefully everything past that point is guarded.
- **The Apply Leave form's client-computed `plannedDays`/`balanceExceeded` is explicitly documented in its own code comment as a preview that can only ever overestimate, never underestimate** (it ignores declared holidays the browser doesn't have) — this is the correct pattern and the opposite of a "trust the client" bug; call this out in the rebuild spec as the reference implementation for any other module's client-side day-count preview.
- **The Approve modal's balance figures (`balanceAllocated`/`balanceUsed`/`balanceRemaining`/`balanceAfterApproval`) are server-computed at the list-fetch, but can go stale between when the page loads and when the admin actually presses Approve** (another admin approving a different request for the same person in between) — not a bug, since the backend re-checks at approval time regardless, but the rebuild should have the approve success/failure response refresh that row's balance figures in place rather than requiring a full re-fetch, so a refused "approve anyway" attempt shows the real current numbers on retry.
- **Leave Type delete has no dependent-count preview** — matches the backend cascade gap above: since `DeleteLeaveType` never reports assignment/request counts today, the frontend has nothing to show before the delete attempt. Must land together with the backend fix, same as the Staff/Academic Setup precedent for cascade warnings.
- **The Leave Limit grid's `cellRemaining` is informational only** (a plain display computation from already-server-provided `allocated`/`used`), never fed into a save decision — no client-trust issue here, unlike a module where a computed remaining balance might be resubmitted as a value.

---

**Structure and depth follow the Academic Setup / Staff modules' format** (`academic-setup/errors.md`, `staff/errors.md`).
