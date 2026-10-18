# Attendance + Leave + Holiday — one coordinated fix

The ONLY fix file for these three modules together (plus the Staff pages' UI audit).
Run in a fresh Claude Code session, no agents, don't commit.

**Source of truth:** `v1/<module>/<page>.html` (UI and functionality) and its `.md`.
Never invent your own components or behaviour. If the build differs from the html, the html wins.
Read first: `v1/attendance/roster.html|md`, `attendance-overview.html|md`, `manage-shifts.html|md`,
`v1/leave/*.html|md`, `v1/holiday/*.html|md`, `v1/staff/*.html|md`, each module's `errors.md`,
`v1/_core/database-design-principles.md` and `v1/_core/design-system.md`.

**Ground rules:** fix, then prove with an essential test; don't change data models beyond A–B; keep the
holiday / holiday-assign / leave-limit permissions, activity-log entries and the Assign page's
"Remove template" link; build must pass; report pass/fail per item at the end, one line each.

---

## A. One shared working-day resolver (P0)

Attendance Overview, Leave (request create, balance, approve, cancel) and the reconcile worker currently
decide "is this a working day" separately. Make ONE backend service that all of them call.

For a person + date, precedence:
1. Holiday — dated holiday from the person's assigned Holiday template
2. Leave — approved leave
3. Weekly Off — from the person's **Roster** WO
4. Otherwise a working day

- Where a person has no roster entry, keep exactly the behaviour that existed before the Holiday build,
  and report in the final summary what that fallback is.
- **Remove** `weeklyOffDays` from Holiday Templates (model, API, UI), the seeded default Holiday
  Template, and the "no template assigned" warning in Leave / Attendance. Leave shows no template
  warning at all. Holiday Templates hold only dated holidays.

**Acceptance:** a leave range crossing a roster WO day and a template holiday counts neither day;
Attendance shows the same day as WO / Holiday; both agree because they call the same service.

## B. Weekly off lives in Roster (P0)

Per `roster.html`: the Assign dialog has weekday chips (Mon–Sat active by default, Sunday off) plus a date
range; WO cells render the WO chip in the staff grid. Roster WO is what the resolver uses for that person.

**Acceptance:** pick Saturday as WO for one staff member over a date range; Attendance and Leave treat
Saturday as off for that person only.

## C. Attendance is wrong even when a roster is set (P0)

1. **Diagnose first, change nothing:** for a staff member with a roster for the month, trace
   roster shift → expected shift → punches → status (Present / Absent / Late / Half / WO / Holiday /
   Leave). Report the root cause in 5 lines max.
2. Then fix it so every status is computed correctly.

**Acceptance:** one staff member with each case (on-time, late, half, no punch, WO, holiday, approved
leave) shows the right status in Overview.

## D. UI must match the html exactly (P1)

Audit these pages against their html and fix every mismatch; list changes one line per page:

- **Holiday** (Holidays, Templates, Assign): Add/Edit Holiday uses ONE date-range picker for Start/End,
  not two calendars. Toolbar month-nav popover, table columns, Source tag, modals as in the html.
- **Leave Create:** table columns (Name, Who Can Take It tag, Assigned Days, Paid, Status, Action);
  modal with `.dd` for who-can-take, toggle-switch for "Salary is paid", Status `.dd`.
- **Leave Assign:** one dynamic column per active leave type ("12 days" or "Not set" with inline "Set"
  link); "Set Leave Limit" disabled until rows selected; student mode shows class/section rows that
  expand to individual students (override), per the hybrid decision; bulk modal leaves untouched
  values as they are.
- **Leave Requests:** 9 filters across two rows; one status-dependent action icon (Pending →
  Approve/Reject, Approved → Cancel, Rejected → Delete); Apply Leave modal; force-approve confirm dialog.
- **Attendance** (Overview, Manage Shifts, Roster) and **Staff** (Manage Staff, Departments,
  Designations): same audit.
- Use the design system's shared components everywhere: `.dd` dropdowns, ONE shared date-range picker,
  type-to-confirm delete, existing toasts. No native selects, no custom one-off widgets.

---

Tests: essential only — resolver precedence, roster WO, leave balance counting holiday/WO days,
the attendance status cases in C. No boilerplate tests.
