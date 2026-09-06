# App Shell — Header + Sidebar (finalized design)

Status: **FINAL** — v1
Depends on: `refactor-plan-and-design-system.md` (R3 permission system,
R4 unified frontend shell)
Reference: `app-shell.html`

This is the **definitive** header + sidebar component — every one of
the 35 page references across this whole package has been showing a
static snapshot of a header/sidebar for illustration only. This file
is the real, interactive component those snapshots were standing in
for, and it supersedes them: when implementing, build THIS shell once
(per the R4/R5 shared-shell plan) and every page renders inside it,
rather than each page carrying its own copy of the header/sidebar
markup.

Built from the legacy `side-navbar`/`header-navbar` (Admin) and
`side-nav`/`header-nav` (Teacher) components — both role variants'
real behavior is preserved and extended, not replaced.

---

## Two real problems this solves that the legacy shell didn't

1. **The legacy sidebar was a flat, ungrouped list of ~20 items** —
   Admission, Student, Fees, Id Card, Admit Card, Marksheet, Class
   Promote, Transfer Certificate, Teacher, Department, Designation,
   Staff, Shift, Roster, Attendance, Leave, Leave Type, Leave Limits,
   Holiday, Payroll, Subject, Class With Subjects — one long unscannable
   column. Now grouped into 13 collapsible sections matching this
   package's 13 modules, one open at a time (accordion), the current
   page's group auto-expanded.
2. **The legacy mobile menu was a barely-styled full list in an
   absolute-positioned toolbar** — no drawer animation, no backdrop, no
   grouping carried over. Now a genuine off-canvas drawer (real CSS
   `transform: translateX()` transition, backdrop, closes on backdrop
   click) at a real breakpoint (860px), with the exact same grouped
   content as desktop — resize the browser to see it, this isn't a
   simulated toggle.

## Role-aware sidebar — Admin vs. Teacher, exactly matching legacy's two real behaviors

The legacy codebase has two distinct sidebar/header pairs because
Admin and Teacher genuinely see different things, in two different
ways:

- **Admin-only groups/items disappear entirely** for a Teacher — Staff,
  Academic Setup, Holiday, and Settings groups, plus items like
  Manage Staff, Departments, Salary Groups, Fee Structure, Marksheet
  Structure, Admit Card Structure, TC Structure, Leave Create, Leave
  Assign, Manage Shifts, Roster. These aren't permission-gated in the
  legacy code at all — a teacher's role simply doesn't have a route or
  menu entry for them, so they're not shown, not locked.
- **Permission-gated items show a lock icon and stay unclickable**
  when the specific permission is false — Admission, Student, Fees,
  Admit Card, Marksheet, Class Promote, Transfer Certificate, Attendance
  all follow this pattern in the legacy `side-nav.component.html`
  (`*ngIf="xPermission"` shows the real link; `*ngIf="!xPermission"`
  shows a muted button with a lock `mat-icon` instead). This shell
  reproduces that exactly: the sub-item's icon swaps to `ti-lock`, text
  greys out, and the click handler does nothing — the item stays
  VISIBLE (so a teacher knows the feature exists and who to ask for
  access) rather than disappearing, which is the meaningful difference
  from the admin-only groups above.

**In the real app**, both the admin-only visibility and the per-item
permission booleans come from the logged-in staff member's `roles` and
`permissions` array (see R3 and the Roles & Permissions module) — the
Admin/Teacher toggle in this reference file exists only so a static
`.html` can demonstrate both states; it is not a UI control in the
shipped product.

## Header

Logo/brand → (mobile only) hamburger → session selector → **notification
bell** (new — see `additional-technical-considerations.md`'s unified
Notifications service; a red dot indicates unread, the dropdown shows
the most recent few with a "View all" link) → profile dropdown (school
identity, My Profile, School Settings — Admin only, hidden for
Teacher, matching how Teacher's legacy header had no profile menu at
all, just a bare Logout button — and Logout).

The legacy Admin header's "UPGRADE PLAN" button is deliberately not
carried into this shell — it's a SaaS billing upsell unrelated to the
actual product surface this package designs.

## Responsive breakpoint

860px, matching the point where the fixed 210-224px sidebar plus a
reasonably-usable main content area stops fitting comfortably. Below
it: the sidebar becomes a fixed off-canvas panel, the header's session
selector and profile name text hide (icon-only, to save header width),
and the hamburger button appears to open the drawer.
