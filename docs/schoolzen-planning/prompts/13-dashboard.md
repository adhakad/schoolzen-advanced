# Build: Dashboard (1 page) — build LAST

Depends on Student, Staff, Attendance, Fees, Leave, Holiday, Approvals — build this only after those exist, since it's a pure aggregation over their data.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/dashboard/dashboard.{html,md}` — **read the `.md`'s "Known inconsistency" section carefully before writing any icon markup.**

## Build
**Backend**: `controllers/dashboard/dashboard.controller.js` (no own model) + routes.
**Frontend**: `dashboard/dashboard/` component; `shared/services/dashboard/dashboard.service.ts`.

## Critical rules
- **Convert every inline SVG icon in the reference to `bi bi-*`** — the reference file itself is out of date on this one point; the design system's icon rule (Bootstrap Icons everywhere, no inline SVG) still governs.
- One aggregation endpoint returns everything this page needs — never one API call per widget.
- Today's date drives the calendar highlight and the hero's date badge — never hardcoded.

## When done
Show the page running next to `dashboard.html`, with icons converted to Bootstrap Icons (visually equivalent, not the raw inline SVG).
