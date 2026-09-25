# Build: Approvals module (1 page)

Depends on Leave module (must be built and have real request data first — this page has nothing to show otherwise).

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/approvals/approvals.{html,md}`
3. Leave module's built controller for `LeaveRequest` — this page must call through to the SAME approve/reject logic, not duplicate it.

## Build
**Backend**: `controllers/approvals/approvals.controller.js` (no own model — reads/aggregates other modules' request collections) + routes.
**Frontend**: `approvals/requests/` component; `shared/services/approvals/requests.service.ts`.

## Critical rules
- This is a read+action VIEW over other modules' data, not its own collection. Right now only `LeaveRequest` feeds it; the aggregation should be written so adding a future request-producing module (once one exists) means adding one more source to union in, not rearchitecting this page.
- Approve/Reject here must call the exact same backend action Leave Requests' own buttons call — never a parallel/duplicate implementation that could drift out of sync.

## Design rules
Zero native `<select>`. Bootstrap Icons only.

## When done
Show the page running with real Leave request data, confirm approving here actually updates the same `LeaveLimit` Leave Requests' own approve action updates.
