# Approvals — Requests

Status: **FINAL**
Reference: `approvals.html`

A single inbox for every request needing sign-off, across every module — currently Leave is the only request Type, but the Type column and filter are built to hold more as other modules add their own approvable requests.

---

## Frontend

**Toolbar**: row1 (search), row2 (Person Type→Dept/Class→Designation/Stream→Section cascade — same shape as Leave Requests/Leave Assign), row3 (Type filter, Status filter).

**Table**: Type (tag — "Leave" today), Name (+code/class), Details (a one-line human summary specific to that request type, e.g. "Casual Leave · 05–06 Aug (2 days)"), Status, Action — Pending shows Approve/Reject icons directly in the row (no separate modal needed for the simple case, though a confirm step still applies per the design system's rule for consequential actions).

## Backend

This is a **computed/aggregated view, not its own collection** — it reads from each source module's own request collection (currently only `LeaveRequest`) via a `$unionWith`-style aggregation (or equivalent per-type queries merged server-side), tagging each with its `type`. As more modules gain their own approvable-request flow, this page's backend adds another source to union in — it never becomes a place where requests are created directly.

Approving/rejecting here calls through to the SAME endpoint Leave Requests' own Approve/Reject buttons call — this page is a second entry point to the same action, not a parallel implementation of it.

**Scale note**: a `$unionWith` across multiple source collections can't share one compound index the way a single-collection query can — each unioned source is matched+sorted on its own index (`adminId`, then a common `createdAt`-equivalent field every source module must expose consistently) before the union, and the combined result is paginated on that common sort key. As more modules add their own approvable-request type, each one's source collection needs that same `adminId+createdAt` shape so this page's union/sort/paginate logic never has to special-case a new source.
