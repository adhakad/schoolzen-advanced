# Dashboard

Status: **FINAL** (content/layout) — **⚠ icon system needs correction, see below**
Reference: `dashboard.html`

---

## Frontend

**Hero**: date badge + "Welcome back, Admin" + day/school/session line, right-aligned stat quartet (Students/Staff/Attendance%/Collected).

**Body** (two-column `layout-row`, `.col-main` + side column):
- Attendance this week: 7-day bar chart (today highlighted, Saturday muted as a partial/half day).
- Fee collection: a donut (Collected % vs Due) + a legend with amounts.
- Quick actions: icon-tile shortcuts (New Admission, Collect Fee, Apply Leave, ...).
- Calendar (side): current month, today highlighted, holiday dates marked.
- Pending approvals (side): short list, links to Approvals.
- Upcoming holidays (side): short list, links to Holiday.

## ⚠ Known inconsistency — fix during build

This reference file still uses **inline SVG icons** (`<svg class="icon-svg">`) throughout — calendar nav arrows, quick-action tiles, holiday-type icons — instead of the Bootstrap Icons (`bi bi-*`) the rest of the app (and `design-system.md`) standardizes on. **When building this page, convert every inline SVG here to the equivalent `bi bi-*` icon** — don't replicate the inline-SVG pattern just because this one reference file still has it. This is the same category of fix already applied once to Attendance Overview during its own build.

## Backend

No own model — one aggregation endpoint (`GET /dashboard`) reading Student, Staff, AttendanceRecord, StudentFeeRecord, LeaveRequest, and Holiday collections, returning everything this page needs in one response (hero stats, week's attendance bars, fee donut numbers, calendar holiday-dates, pending approvals, upcoming holidays) — never one call per widget. Each sub-aggregation (e.g. the fee donut's Collected-vs-Due sum across every student) is a proper `$group` pipeline with `$match` on `adminId` as its first stage — never fetch-all-students-then-sum-in-Node.

**This is `performance-principles.md`'s own named example for Redis caching** ("Dashboard's aggregated stats") — `GET /dashboard` is cached with a short TTL (e.g. 60–120s) via the centralized `CacheService` (see `additional-technical-considerations.md`'s caching section), since it's hit on every login/page-load but its underlying numbers don't need to be instantaneously live. Invalidate proactively on the writes that would visibly stale it (a fee payment, an attendance sync completing, a leave approval) rather than only waiting out the TTL, so an admin who just collected a fee doesn't see yesterday's total.
