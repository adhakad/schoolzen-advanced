# MAJOR REFACTOR — Unified Staff Model + Role-Based Single Dashboard

## Why this file exists separately from CLAUDE.md

CLAUDE.md documents the CURRENT architecture (admin + teacher as two
separate collections/auth-flows/dashboards). This refactor changes that
foundational assumption. Do NOT delete CLAUDE.md — it stays accurate for
everything this refactor doesn't touch (Fees, Admission, Marksheet, etc.),
and gets updated section-by-section as each part of this refactor lands.
This file is the working plan for the refactor itself; once complete, its
conclusions get folded into CLAUDE.md and this file can be archived.

## The five things requested, restated precisely

1. Teacher becomes a role WITHIN Staff — ONE collection, period. There is
   no end state where a separate `teacher` collection still exists
   alongside Staff. The `teacher` collection gets fully migrated into
   Staff and then retired (dropped from active use) once migration is
   verified. This is not "Staff references Teacher" or "Teacher extends
   Staff" — it's one Staff collection, full stop, matching how real-world
   HR/identity systems (Workday, BambooHR, and most well-built MNC
   internal tools) model "employee" as a single entity with roles/
   permissions attached, not a different table per job function.
2. Role-based dashboard access, not hardcoded "admin sees X, teacher sees
   Y" logic split across separate frontend modules.
3. ONE dashboard shell for everyone (admin, teacher, other staff) — what
   they see and can do is entirely determined by their permissions, not by
   which login portal they came through.
4. Dashboard UI/UX redesign as part of this.
5. A properly generalized permission system, and improving other modules
   as this unification touches them.

## Industry-standard pattern to follow (RBAC, not ad-hoc flags)

Model this the way mature systems do — Role-Based Access Control (RBAC),
not a growing list of one-off boolean flags per feature:

- **Staff** — one person, one document: identity fields (name, contact,
  joiningDate, departmentId, designationId, etc.) plus `roles: [String]`
  (e.g. `['teacher']`, `['teacher', 'classTeacher']`, `['accountant']`,
  `['admin']` if admin itself ever becomes a Staff role rather than a
  wholly separate actor — decide this explicitly in R1 planning: is
  School Admin also just a Staff record with an `'admin'` role, unifying
  even further, or does Admin genuinely stay a separate actor because it
  represents "the school account owner" rather than "an employee"? Lean
  toward the industry-standard answer: the account owner is usually
  still its own concept even in unified systems, e.g. Workspace Owner vs
  Employee in Google Workspace — investigate and recommend, don't assume.)
- **Role** (optional, if roles need their own metadata beyond a string) —
  a small reference collection: `{ name: 'teacher', displayName: 'Teacher' }`
  — only worth adding if roles need attributes beyond a name; a plain
  string array on Staff is fine if not.
- **Permission** — the granular capability: `{ module: 'attendance',
  action: 'approve' }`, `{ module: 'leave', action: 'apply' }`, etc.
- **RolePermission** or an inline mapping — which permissions each role
  grants by default (e.g. `'teacher'` role grants `attendance:view`,
  `leave:apply`).
- **Staff-level overrides** for the class-scoping this codebase already
  needs (a teacher's `attendance:manage` permission is scoped to specific
  classes, not the whole school) — this is where the existing
  `classes: [Number]` pattern from `attendancePermission`/`leavePermission`
  lives on, just attached to a proper permission-scope structure instead
  of one bespoke boolean-plus-array field per feature.

This is the standard RBAC shape used across real production systems —
apply it here rather than inventing a novel structure, and rather than
just renaming the existing ad-hoc blocks.

## Why this is genuinely hard (be honest about scope before starting)

This is not a feature addition — it's a foundational identity model
change. Nearly every module built so far (Roster, Attendance, Leave,
Holiday, Payroll, Device sales-assign, Socket.io rooms) currently branches
on `personType: 'staff' | 'teacher' | 'student'` and/or checks `isAdminAuth`
vs `isTeacherAuth` as two entirely separate middleware/token/guard stacks.
Every one of those checkpoints needs deliberate re-examination — this
cannot be done as one giant sweeping change safely. It must be phased, with
a working, testable system after each phase, exactly like Phases 1-10 were
built.

## Non-negotiable constraints carried over from CLAUDE.md

- Existing `student` collection is still never modified.
- Existing DATA must not be lost — current teacher and staff records need
  a migration path, not a delete-and-recreate.
- Each phase must leave the app in a working, locally-testable state —
  same discipline as the original Phase 1-10 build.

---

## PHASE R1 — Data model unification (backend only, no UI change yet)

Goal: make Staff the single source of truth for every human who logs in
and has a role, WITHOUT changing any frontend behavior yet. This phase is
invisible to end users — it's groundwork. END STATE: exactly one
collection (`staff`) holds every teacher and every other staff member.
There is no long-term "both collections exist" state — the migration in
this phase is the path to full retirement of the `teacher` collection,
not a permanent parallel structure.

- Add `roles: [String]` to the Staff model (RBAC pattern above), plus
  whatever permission-scope structure R3 will formalize — R1 can ship a
  minimal version of this (even just the roles array) if the full
  permission redesign is being sequenced into R3, as long as R1's schema
  doesn't block R3's design.
- Write a one-time migration script: for every existing document in the
  `teacher` collection, create a corresponding Staff record, preserving
  every field that has a home in Staff already, and mapping teacher-
  specific fields (subject expertise, class-teacher assignment, the
  various `xPermission` blocks like `attendancePermission`,
  `leavePermission`) onto the Staff record's new roles/permissions
  structure.
- Run the migration, verify every teacher's data landed correctly and
  completely in Staff (a verification script comparing old vs new record
  counts and spot-checking field values), THEN retire the `teacher`
  collection from active use — stop all new writes to it immediately, and
  plan its actual drop for after R2 (auth) confirms no login flow still
  depends on it.
- Every existing backend module that currently queries `personType:
  'teacher'` against the `teacher` collection must be identified (grep
  across the codebase) and listed for Phase R2/R3 rewiring — this phase
  only discovers and documents that list, it does not yet rewire every
  consumer, but it MUST produce a complete list so nothing is missed
  later.

## PHASE R2 — Unified auth (backend)

Goal: one login, one token type, one auth middleware for every human
staff member (including teachers), while keeping Admin (the school-owner
account) and Student (no login) as they are — this refactor is about
merging Staff+Teacher, not about touching Admin or Student auth.

- Design ONE `StaffAuthService`/`isStaffAuth` middleware/token pair,
  modeled on whichever of the existing `admin-token`/`teacher-token`
  patterns is cleaner, replacing the separate teacher-specific auth stack.
- The JWT payload carries the Staff's `_id`, `adminId` (the school
  they belong to — Staff is still tenant-scoped, unlike SalesUser), and
  their role(s)/permissions needed for authorization checks.
- Every backend route currently gated by `isTeacherAuth` gets re-gated by
  `isStaffAuth` PLUS a specific permission check (see Phase R4) instead of
  a blanket "any teacher can access this."
- Migration for login credentials: existing teacher login records
  (`TeacherUserModel` or equivalent) need their credentials carried over
  to whatever the new unified Staff login credential store is — do not
  force every existing teacher to "re-register," preserve their ability
  to log in with the same credentials post-migration.
- Keep this phase backend-only and fully backward compatible: the OLD
  teacher-auth endpoints can proxy to the new unified logic temporarily
  if needed to avoid breaking the still-separate frontend from Phase R2
  through Phase R4 — full old-endpoint removal happens only after the
  frontend catches up in R4/R5.

## PHASE R3 — Permission system redesign (backend)

Goal: replace the current pattern (a growing list of ad-hoc
`xPermission: { status: Boolean, classes: [Number] }` blocks bolted onto
the Teacher model one feature at a time — `attendancePermission`,
`leavePermission`, etc.) with one coherent, scalable permission model.

- Design a single `Permission` concept: something like
  `permissions: [{ module: String, actions: [String], scope: Object }]`
  on the Staff record, OR a separate `StaffPermission` collection keyed
  by staffId+module — decide based on query patterns (how often is "does
  this staff have permission X" checked vs "list all staff with
  permission X"). Investigate both existing `xPermission` blocks'
  actual shape and usage sites before finalizing the schema, so the new
  model can express everything the old ad-hoc blocks did (module access,
  class-scoping for teacher-side attendance/leave, etc.) without losing
  any expressiveness.
- Modules to bring into this unified permission model (based on what
  exists today): Attendance (view/manage, class-scoped), Leave (self-
  apply, class-scoped apply-for-students, approve), Roster (if any staff
  besides admin should see/manage it), Payroll (almost certainly
  admin-only, but express it as a permission rather than a hardcoded
  admin-only check, so it's consistent), Device Sales module (this one
  is SalesUser-scoped, separate from Staff — do not merge Sales into this
  permission system, it's a genuinely different actor type per the
  existing cross-tenant design).
- A migration step: convert every existing `attendancePermission`,
  `leavePermission` value on current teacher records into the new
  permission model's equivalent entries, so no teacher silently loses
  access they had before.
- Every backend controller/route that currently checks a specific
  `xPermission.status` flag gets rewritten to check the new unified
  permission model instead — this is the actual "rest of the modules
  improve" part of the request: Attendance, Leave, Roster controllers all
  get touched here to use the new check instead of the old ad-hoc one.

## PHASE R4 — Unified frontend shell + role-based dashboard

Goal: one dashboard component tree, one set of routes, rendering
different sidebar items/widgets based on the logged-in Staff member's
permissions — replacing the current entirely-separate `pages/admin/*` vs
`pages/teacher/*` module trees for anything that should now be shared.

- This is the largest single piece of work in the whole refactor — plan
  it as its own multi-step Plan Mode session, likely split further once
  its own plan is written (e.g. R4a: shared shell + auth wiring, R4b:
  sidebar/permission-driven nav, R4c: migrate each existing teacher-only
  page into the shared shell one at a time, verifying nothing breaks).
- Decide, as part of planning THIS phase specifically: which existing
  `pages/admin/*` feature pages become "shared, permission-gated" pages
  reachable by any sufficiently-permissioned Staff member, vs which stay
  genuinely admin-only (e.g. Payroll generation, Device sales-assignment,
  School-level settings) and should never be reachable regardless of a
  staff member's permissions. This decision list must be explicit before
  writing code — don't let it be discovered ad-hoc while coding.
- The route guard becomes ONE `StaffAuthGuard` (replacing
  `AdminAuthGuard`+`TeacherAuthGuard` for everything now unified), with
  page-level or component-level permission checks layered on top (a
  directive or a route-data-driven check reading required
  permission(s) for that route, redirecting/hiding if the logged-in
  Staff member lacks it).
- Old `pages/teacher/*` module tree gets deprecated and removed only after
  its equivalent shared-page migration is verified working — don't delete
  before the replacement is confirmed functioning, per the same discipline
  every other phase in this project has followed.

## PHASE R5 — Dashboard UI/UX redesign (SCOPE: dashboard shell only, for now)

Scope note: this phase is currently limited to the DASHBOARD (header,
sidebar, home/landing view, and the permission-driven navigation shell
from R4) — NOT a full app-wide redesign of every module's pages. Whether
this later expands to other modules is a separate decision to be made
after seeing the dashboard redesign, not assumed now.

STATUS: ON HOLD. Do not plan or implement this phase yet. The user wants
to review dashboard design visualizations/mockups first (via the
visualize tool, in a separate conversation) before deciding direction.
Wait for explicit instruction to resume before writing an R5 plan.

### What "major" means for the dashboard specifically

Investigate and explicitly call out, before designing anything:
- What specifically about the CURRENT dashboard/shell is inadequate
  (gather this from the project's history of ad-hoc UI corrections along
  the way — the per-module settings-icon-inside-the-page pattern used
  early on for Payroll (now being corrected to a sidebar-only pattern per
  the note below), tab-vs-lazy-route
  decisions, sidebar clutter concerns — these hint at what the dashboard
  shell should get right from the start rather than patch incrementally).
- Whether the visual design language itself (colors, spacing, typography)
  needs a genuine refresh, or whether the redesign is mainly about
  information architecture (what's grouped where, how nav adapts to
  permissions) while keeping the existing Bootstrap+Material visual base.

### Scope of this phase (dashboard shell only)

- Header (including the R7 session selector and R4 permission-driven
  elements), sidebar (permission-driven nav items), and the home/landing
  dashboard view (permission-aware summary widgets — attendance summary,
  pending approvals, quick actions — reimagined properly, not assembled
  ad-hoc).
- Mobile/responsive behavior for this shell specifically.
- Does NOT include: individual feature module pages (Leave, Holiday,
  Payroll, Attendance grid, etc.) — those keep their current
  already-established patterns unless a future phase explicitly extends
  the redesign to them.

### Codebase cleanup as part of this phase

- While rebuilding the dashboard shell, remove any now-unused files this
  creates: old header/sidebar components being replaced (once confirmed
  nothing else still references them), dead CSS rules from the previous
  shell implementation, and any shared/common CSS that becomes
  duplicated between the old and new shell during the transition — clean
  up once the new shell is verified working, not left as leftover dead
  code.
- Audit shared CSS files (`common` folder styles, any global stylesheet)
  for rules that were specific to the OLD shell and are no longer used
  anywhere once the new shell replaces it — remove rather than
  accumulate unused CSS.
- This cleanup applies specifically to shell-related files touched by
  this phase — not a general full-codebase cleanup sweep (that's out of
  scope here).

### Process — mandatory visualization/mockup step before any code

1. Produce mockups (via the visualize tool) for: the new header+sidebar
   shell and the redesigned home dashboard — covering the shell's
   recurring patterns so the design is proven before implementation.
2. Get explicit approval on the design from these mockups BEFORE any
   component code is touched — matching this project's established
   discipline for every UI decision so far.
3. Only after approval, plan the actual implementation — shell rebuild,
   verify nothing breaks functionally, then the cleanup pass described
   above.

### Typography — modern, highly readable, no eye strain

- **Font family**: use a modern, humanist sans-serif designed for screen
  UI readability — e.g. Inter, Roboto, or Poppins (all free, widely used
  in production SaaS products, and easily loaded via Google Fonts or
  self-hosted for performance). Avoid decorative or overly geometric
  fonts (e.g. Poppins for body text at small sizes can feel slightly
  less legible than Inter/Roboto — if choosing between them, prefer
  Inter or Roboto for body/data-dense screens, reserving Poppins-style
  fonts only for large headings if a bit more character is wanted there).
  Do not introduce more than one font family for UI text — one family,
  varying only weight, keeps the interface calm and consistent.
- **Font weights**: stick to 2–3 weights maximum (e.g. 400 regular, 500
  medium, 600 semi-bold for emphasis/headings) — avoid using every
  available weight (300 through 900), which creates visual inconsistency
  and makes the type scale feel arbitrary rather than deliberate.
- **Base body font size**: 14–16px depending on tier (14px acceptable on
  information-dense desktop tables, 16px minimum on mobile per standard
  mobile-accessibility guidance — never go below 14px anywhere, and never
  below 16px on any input field on mobile specifically, since browsers
  auto-zoom on focus for inputs under 16px, which is a real usability
  papercut worth avoiding).
- **Line height**: 1.4–1.6 for body text (tighter, ~1.2–1.3, is
  acceptable for headings and dense table cells) — this is what makes
  paragraphs and multi-line labels comfortable to read rather than
  cramped.
- **Line length**: for any prose/paragraph content (not table cells),
  keep line length to roughly 60–80 characters at the content's max-width
  — this ties back to the content max-width cap on large/4K screens
  above; unrestricted line length on wide screens is a well-documented
  readability problem.

### Color — no harsh/eye-straining choices, WCAG-conscious contrast

- **No pure black text on pure white** (`#000000` on `#FFFFFF`) — this
  specific combination is a known source of eye strain at high contrast
  ratios for extended reading; use a dark charcoal/near-black (e.g.
  `#1a1a1a`–`#2d2d2d` range) for primary text on a white/near-white
  background instead — softer contrast, still fully readable, easier on
  the eyes over a full workday of dashboard use.
- **No fully saturated, high-chroma colors as large fill areas** (e.g. a
  pure saturated red/green/blue background spanning a whole card or
  section) — reserve fully saturated hues for small accents (icons,
  small badges, status dots) and use their muted/pastel tints (as this
  project's existing `.status-leave { background:#dcecfb;
  color:#1f6fad; }` pattern already correctly does — a soft tinted
  background with a matching darker foreground) for any larger colored
  surface. This "soft tint background + matching darker text" pattern
  is exactly the direction already validated during the Leave module's
  redesign (soft tinted chips over solid chips) — extend that same
  principle system-wide in R5, not just to status chips.
- **Sufficient contrast, verified, not assumed**: every text/background
  pairing in the final design system should meet WCAG AA contrast
  (4.5:1 for normal text, 3:1 for large text/UI components) — check this
  with a contrast checker during the mockup approval step, not left to
  "looks fine" visual judgment alone.
- **Dark backgrounds avoided for large surfaces** unless a genuine dark-
  mode toggle is being built (out of scope for R5 unless explicitly
  requested) — a dark sidebar/header on an otherwise light app, done
  inconsistently, often reads as visually jarring rather than modern;
  if a dark accent area is wanted (e.g. the sidebar), keep it a muted
  dark neutral (charcoal, not pure black) with adequately light text, not
  stark black-on-white-on-black zones fighting each other on one screen.
- **Limit the palette**: one primary accent color (used for the active
  nav item, primary buttons, links, the session-selector highlight) plus
  the semantic status colors already established (green/amber/orange/
  red/grey for Present/Late/HalfDay/Absent/Holiday-style states across
  modules) — avoid introducing additional arbitrary brand colors beyond
  these, which is what keeps a multi-module app feeling like one
  coherent product rather than a patchwork.



Use this exact 7-tier breakpoint set — it aligns with Bootstrap 5's own
breakpoints (already loaded globally in this app per CLAUDE.md's frontend
architecture notes: `xs`/`sm`/`md`/`lg`/`xl`/`xxl`), so the design system
rides on the CSS framework already in the stack rather than introducing a
second, conflicting breakpoint scheme.

| Tier | Range | Bootstrap equivalent | Typical devices |
|---|---|---|---|
| Mobile portrait | 320–480px | `xs` (<576px) | Standard phones, portrait |
| Mobile landscape | 481–767px | `xs`–`sm` boundary | Phone rotated |
| Tablet portrait | 768–991px | `md` (≥768px) | iPad portrait |
| Tablet landscape | 992–1199px | `lg` (≥992px) | iPad landscape |
| Small laptop | 1200–1439px | `xl` (≥1200px) | 13" laptops, small desktops |
| Desktop | 1440–1919px | `xxl` (≥1400px) | Full HD monitors |
| Large/4K | 1920px+ | beyond `xxl` | Wide monitors, 4K displays |

Persistent sidebar (vs. the mobile/tablet overlay drawer) begins at the
Tablet-landscape/`lg` (992px) boundary — matching Bootstrap's own `lg`
threshold, which is the point most Bootstrap-based admin layouts already
switch from a collapsed to an expanded nav.

**Components scale by tier, not just by fluid reflow — be explicit about
sizing at each tier, not just "make it responsive":**
- Sidebar width: 0 (drawer overlay) below 992px → 160–180px (laptop) →
  180–200px (desktop) → 200–220px (large/4K) — width step-increases at
  each tier rather than being either fixed or infinitely fluid.
- Summary/metric card grid columns: 1 (mobile portrait) → 2 (mobile
  landscape / tablet portrait) → 3 (tablet landscape / small laptop /
  desktop) → up to 4–6 (large/4K) — more columns of the SAME card size at
  larger tiers, not the same column count with cards stretched wider
  (stretched cards waste whitespace and reduce information density,
  which is the wrong trade at 4K — surface more information instead).
- Content max-width: capped at large/4K tiers (e.g. content area doesn't
  exceed ~1600–1800px even on a 4K display) so text/tables don't stretch
  to unreadable line lengths — the extra width at very large screens goes
  to additional sidebar width, additional card columns, or wider
  margins, never to a single column of content stretching edge-to-edge.
- Typography and spacing scale modestly across tiers (e.g. base font-size
  and `--pad-*`/`--gap-*` values step up slightly from mobile to
  large/4K) rather than staying pixel-identical at every tier — this
  should be a deliberate, small type/spacing scale decided during the
  mockup step, not left unspecified.
- Table/grid density: mobile/tablet favor fewer visible columns (with
  horizontal scroll or a card-based row layout as an alternative to a
  wide table) while laptop/desktop/4K show full table columns —
  audited per the earlier Frontend Performance section's virtual-scroll
  guidance for very large row counts.

### Filters, search, and navigation — rearrangement and consistent design

**Approved sidebar visual style (do not change further without explicit
direction)**: solid accent-color fill (not a soft tint) on the active
PARENT item when it's expanded, white icon/text on that fill; its
sub-items hang off a thin vertical connector line, indented; the
currently-selected sub-item is shown in accent-color text (not a filled
background); collapsed (not-yet-expanded) parent items show a right-facing
chevron, which rotates/points down once expanded. This was confirmed
against a reference screenshot and locked as the visual pattern — do not
re-explore alternate sidebar visual treatments unless asked.



This is currently one of the most inconsistent areas across modules
(each phase invented its own filter/toolbar placement as it was built —
worth consolidating here into one clear, repeatable pattern rather than
each screen continuing to differ).

**Global search (new)**:
- Add one global search entry point in the header (a search icon that
  expands into a search input, or a persistent compact search box,
  depending on how much header space is available at each breakpoint —
  collapse to icon-only below tablet-landscape, full input box from
  laptop width up) — for finding a person (staff/teacher/student) by
  name/ID quickly across the app, rather than navigating to a specific
  module first. Scope this to what's actually feasible: a simple
  name/ID search hitting a small set of indexed fields across Staff/
  Student, not a full-text search engine — decide the exact backend
  query shape during this phase's own planning, informed by which
  fields are actually indexed today.

**Per-module filter placement — one consistent rule**:
- Filters (status, module, date-range, personType, etc.) and the
  page's primary action button(s) (Add/Generate/Assign/Apply) sit
  together in ONE toolbar row directly above that page's main table/grid
  — this pattern is already correctly established in Payroll/Holiday/
  Leave from earlier phases; R5 extends it as the mandatory rule for
  every module, including older ones (Roster, Shift, Attendance) that
  may have filters placed less consistently today.
- Filter controls are always selects/dropdowns (per the established
  "no radio buttons" rule) or a date-range picker — never a separate
  filter sidebar/panel unless a module's filter set is unusually large
  (more than ~4 simultaneous filters), in which case a collapsible
  "More filters" expansion within the same toolbar row is preferred over
  a permanent side panel that eats horizontal space.
- On mobile/tablet, the toolbar's filters collapse into a single
  "Filters" button that opens a bottom sheet or dropdown panel listing
  all filters vertically (since a horizontal row of 3-4 selects doesn't
  fit mobile width) — the primary action button stays visible in the
  toolbar row itself, only the filter controls collapse.

**Navigation — sidebar structure**:
- **CORRECTED RULE (supersedes any earlier mention of a per-page
  settings-gear icon)**: No module page contains its own settings icon.
  Every setup/configuration screen (Salary Groups, Assign Salary, Leave
  Types, Holiday Templates, Class-Shift assignment, etc.) is reached
  ONLY via the SIDEBAR — either as its own sidebar entry, or nested under
  its parent module as a sidebar sub-item/expandable group (e.g. Payroll
  in the sidebar expands to reveal Generate Payroll, Payment History,
  Salary Groups, Assign Salary as sub-items — a click target reached by
  expanding the sidebar item, not by an icon inside the page content
  area). A module's main content area (the toolbar + table + primary
  action) never carries its own settings affordance — the sidebar is the
  single, consistent home for all navigation, setup included.
- **Accordion behavior — reference pattern approved (see attached
  screenshot in conversation history)**: a parent nav item with sub-pages
  shows a chevron on its right edge. Clicking it expands a vertical
  connector line running down the left edge of its sub-items (a thin
  line, not a filled background block), with each sub-item indented and
  listed below. Only the currently-active sub-item is visually
  highlighted (a distinct accent color on its text, e.g. the reference's
  teal "Departments" among otherwise-plain-dark sibling items) — other
  sub-items stay plain, unstyled text until hovered or clicked. The
  PARENT item itself gets a solid filled background (accent color) only
  while its group is expanded/active, matching the reference's solid
  blue "Employees" parent row. Collapsed parent items with no active
  child show no fill and no connector line — only their chevron, which
  points right until expanded, then rotates down.
- Sidebar items appear/disappear based on the logged-in Staff member's
  permissions (from R3/R4) — a teacher with only Attendance+Leave
  permissions sees only those two items plus Dashboard, not a full admin
  sidebar with hidden-but-technically-reachable links.
- Active/current sidebar item is visually distinguished using the
  established accent-color + soft-tint pattern (from the Typography/
  Color section above), not a heavy solid-fill highlight that competes
  visually with the accent color used elsewhere for primary actions.

**Breadcrumb / "where am I" context** (new, for deeper pages):
- Any page reached via drilling into a record (e.g. a single Payroll
  slip view, a single Leave request's detail) shows a simple breadcrumb
  or a clear "← Back to [parent page]" link near its own page header —
  this project has already informally adopted this pattern in a few
  places (e.g. the Leave Payment History "Back to Payroll" link) — R5
  makes it the consistent standard for every drill-down view, not
  ad-hoc per module.

### FINAL APPROVED DESIGN SYSTEM (locked — apply consistently to every module, do not re-explore alternatives)

The following was iterated through visualization and explicitly approved.
This is the design system for R5 — every module's page follows this exact
pattern. Treat this as done design work, not a starting point for further
exploration.

**Overall palette & feel**: soft lavender-grey page background (`#f4f4fb`),
white content cards with soft shadows (`box-shadow: 0 2px 8px
rgba(20,20,60,0.05)`), generous corner radius (14–20px) throughout. Primary
accent is a purple gradient (`linear-gradient(135deg,#7b6ef6,#5b4fd6)`),
used for: the active/expanded sidebar parent item, primary action buttons,
avatar-square gradients, and any "hero" numeric highlight.

**Header** (top of every page, same everywhere):
- Left: Schoolzen's own small brand mark (a rounded-square gradient
  logomark + wordmark) — this is product branding, NOT the school's
  identity. Small and quiet, never competing with page content.
- Right: session selector (pill-shaped, light accent tint, calendar icon +
  a select for the academic year, e.g. "2026-27") and a profile pill
  (avatar circle + first name + chevron). No notification bell icon.
- Clicking the profile pill opens a dropdown containing the SCHOOL's own
  identity (logo, name, board/location meta) at the top, followed by
  "My Profile" / "School Settings" / "Logout" — this is where "whose
  school is this" lives, not the header itself.

**Summary/live strip** (below header, above the page's main content, used
wherever a page has top-line numbers worth surfacing): a single white
rounded strip containing a small pulsing status badge (e.g. "Session
active") on the left, then a sequence of `<b>number</b> label` pairs
separated by thin vertical divider lines — never separate decorative
cards per metric. One highlighted "hero" number can use the accent purple
color; the rest stay neutral dark text.

**Sidebar** (left of main content, persistent):
- Plain nav items: icon + label, muted grey-purple text (`#4a4a68`).
- The currently-expanded PARENT section gets a solid purple gradient fill,
  white text/icon, and a soft shadow — this is the "you are inside this
  section" indicator.
- That parent's sub-items hang off a thin vertical connector line,
  indented; the specific active sub-item is shown in accent purple text
  (not a filled background) — matches the confirmed HR-tool reference
  pattern.
- Collapsed (not-yet-expanded) sections show a right-facing chevron that
  rotates to point down once expanded.
- No settings icon anywhere inside a module's own content area — all
  setup/config screens are sidebar sub-items only (per the earlier
  navigation-correction note above).

**Module content area** (the pattern every module — Payroll, Leave,
Holiday, Attendance, Roster, etc. — follows):
- One white rounded card holding: a toolbar row (search box that grows to
  fill space + fixed-width filter pills with an icon and a visible
  dropdown chevron, wrapping together with the primary action button as
  one group when space is tight), then a labeled list: uppercase muted
  column headers followed by rows. No separate legend row — the status
  chip/dot colors are self-evident from their label text on each row.
- Rows (not a traditional bordered `<table>`): each row has a
  gradient-colored rounded-square avatar (initials, a different gradient
  hue per row for visual variety — not everyone the same color), a
  name+role stack, whatever metric columns the module needs (e.g.
  attendance dots, net salary), a status pill chip (soft-tint background,
  matching darker text — e.g. amber for Draft, green for Locked), and
  right-aligned small icon-button actions.
- Row hover: a very subtle tint (`#faf9ff`), never a hard color shift.

**This is the design system all future module pages (Attendance, Leave, Holiday,
Roster, Devices, Settings, etc.) should be built or re-skinned to match —
component shapes (avatar, chip, pill filter, row) are shared/reusable
across modules, not redesigned per module.**

### Additional finalized details (supersede/extend anything above)

- **Department filter is mandatory wherever a Staff person-type filter
  exists**: any page with a Staff/Student (or Staff/Teacher/Student)
  type filter must also include a Department filter, enabled only when
  "Staff" is the active person-type (same mutual-exclusion pattern as
  Attendance's Department-vs-Class). Do not build a staff-scoped list
  page without it.
- **A color/code legend (e.g. shift codes on a roster grid) is built only
  from what's actually present in the current view** — never lists every
  possible option configured in settings; an option nobody currently has
  assigned doesn't appear, so the legend stays exactly as long as it's
  useful and never grows into an unrelated reference list. Also render
  it as its own wrapping strip (light-tint background, full toolbar
  width) below the toolbar — not squeezed next to a title, where it
  breaks layout once there are more than 2-3 entries.
- **Where a page has two structurally different sub-views by person-type**
  (e.g. Roster's Staff calendar-grid vs Student class-list — not just a
  filtered subset of the same table, but genuinely different content),
  switch between them with the same person-type DROPDOWN filter used
  everywhere else, not a separate tab-strip control unique to that page.
  Bulk-select and its resulting action (e.g. "Assign to Selected") keep
  identical labels and trigger the identical modal/flow regardless of
  which sub-view is active — only the row content and columns change.
- **Bulk-delete of assigned/scheduled data (e.g. clearing roster shift
  assignments) requires TYPE-TO-CONFIRM, not a plain Yes/No modal**: the
  confirmation modal states in plain language what will be removed, its
  scope (how many people/rows and the date range affected), what is and
  isn't impacted (e.g. "attendance already recorded is not affected, but
  nothing decides expected shift going forward until reassigned"), and
  that it cannot be undone — then requires typing an exact word (e.g.
  "DELETE") into a field before the destructive button enables. A
  Cancel/Delete pair alone is too easy to click through out of habit for
  an action of this scope; a single-row delete (e.g. one salary group)
  can still use the lighter confirm-modal pattern already established.
  Every such deletion is written to the ActivityLog per R6 (who, what,
  how many, when) — this is exactly the kind of mutation R6's audit
  logging exists to capture.
- **Deleting a "main" record that other records depend on (e.g. a Shift
  that Roster entries point to, a Salary Group with people assigned to
  it) — FINAL RULE, supersedes any earlier "block delete if in use"
  wording**: the school owns their data and can choose to delete it.
  Don't silently block the delete or force "set inactive instead" as
  the only option. Instead:
  1. The confirmation modal states exactly what depends on this record
     and will be cascade-deleted with it (e.g. "12 roster entries across
     3 people reference this shift and will also be deleted").
  2. Type-to-confirm (the heavier pattern above) is required whenever
     any dependent data exists — even for what would otherwise be a
     single-row delete — because the blast radius here is bigger than
     the one row being clicked.
  3. On confirm, the main record AND all dependent records are actually
     deleted (real cascade, not a soft "inactive" flag) — this is what
     the person asked for.
  4. The deletion (main record + dependent count) is written to the
     ActivityLog per R6, so there's still a record of what was removed,
     by whom, and when, even though the data itself is gone.
  "Set to Inactive instead" can still be OFFERED as a lighter
  alternative button alongside Delete when dependents exist, but it is
  never the only option — Delete-with-cascade must always be available.
- **For sensitive/important data specifically (attendance, payroll,
  salary payments/slips — not routine settings like a shift name), a
  "delete" is a SOFT delete with a grace-period, not an immediate
  permanent purge**: the record (and its cascaded dependents) moves to
  a recoverable state for a set number of days (e.g. 15-30, exact
  number a later decision) before permanent purge, so a mistaken delete
  isn't instantly unrecoverable. A "Recently deleted" view lets an admin
  restore it within that window.
  - **Restore is blocked, per-item, if new data has since been created
    covering the same scope** (e.g. attendance for the same person+date,
    a payroll for the same person+month) — restoring would otherwise
    silently create a duplicate/conflicting record. That specific item
    becomes permanently unrestorable once superseded; other trashed
    items from the same deletion that weren't re-created stay
    restorable until the grace period ends.
  - This is IN ADDITION TO, not instead of, the type-to-confirm warning
    at delete time — the person still sees and confirms the full
    cascade scope up front; the grace period is a safety net under that
    confirmed action, not a reason to make the warning any lighter.
  - Routine/non-sensitive settings (a shift definition, a salary group
    with nobody on it) can hard-delete immediately per the rule above —
    the grace period applies specifically to data that represents
    something that already happened (recorded attendance, generated
    payroll, recorded payments), not to configuration templates.
- **Tone for every warning/confirmation across the app — calm and
  informative, never alarming**: state facts plainly (what will happen,
  what's protected by the grace period, that it can be undone within
  the window) without stacking multiple warning icons, all-caps, or
  repeated "this is dangerous" phrasing on top of each other. One clear
  sentence of consequence is enough — the type-to-confirm step itself is
  what prevents accidental clicks, not a scarier-sounding message. A
  person doing routine admin work (locking payroll, deleting an unused
  shift, clearing a roster row) should never come away feeling like they
  might have broken something merely for having interacted with a
  delete or lock button in the normal course of their day.
- **Designation filter, alongside Department, EVERYWHERE Department
  appears (not only pay-band-sensitive pages)** — final, broadened
  rule: any page with a Department filter also gets a Designation
  filter next to it, always. Designation is enabled only once a
  Department is chosen (mutual-dependency, not mutual-exclusion —
  Designation narrows within the selected Department rather than
  disabling against it). Where rows are people, show each person's
  designation as a small tag so the grouping is visible before
  filtering/selecting.
- **Stream filter, alongside Class, EVERYWHERE a Class filter or class
  list includes classes 11/12** — final, global rule: 11th/12th split
  into streams (Science/Commerce/Arts, etc.) that can have different
  timings/sections, so any page offering a Class filter (or listing
  classes as rows) must also offer/show Stream, scoped the same way as
  Designation-under-Department: enabled/relevant only once 11 or 12 is
  the class in question, disabled or simply absent for classes that
  don't have streams.
- **Section filter, alongside Class, EVERYWHERE a Class filter exists**
  (every class, not just 11/12) — every class splits into sections
  (e.g. "10th A", "10th B"), so Section sits next to Class the same way
  Designation sits next to Department: enabled once a Class is chosen,
  narrows within it. Order when both Stream and Section apply (11/12):
  Class → Stream → Section — Stream determines which sections exist
  under it for those two years.
- **Section and Stream filters — two separate conditions, both apply**:
  1. **Existence**: if the school has never created any Section (for
     that Class) or any Stream (for 11/12) at all, the filter doesn't
     render — no empty, pointless dropdown taking up toolbar space.
     Same principle as the legend showing only currently-assigned
     shifts — a control that can never do anything useful for this
     school gets no space.
  2. **Mutual-dependency** (only once existence is satisfied): the
     filter renders but stays disabled (standard muted styling) until
     its parent (Class, for Section) is actually selected — same
     pattern as Designation-under-Department.
- **Class Teacher is a role scoped to a specific Class+Section, feeding
  into R3's permission system** — a teacher assigned as Class Teacher
  for e.g. "8th B" gets permissions scoped to that class+section
  specifically (their own students' attendance/records), not the whole
  school; the same teacher CAN be Class Teacher for more than one
  section, and a section can only have one Class Teacher at a time.
  This is a data point for R3 (permission system redesign) to account
  for when that phase is implemented — not a new phase on its own.
- **Class/Section administration needs its own management screen**
  (creating classes, their sections, and assigning each section's Class
  Teacher) — this doesn't exist as a designed page yet. It logically
  sits near Admissions/Settings, not Attendance or Payroll. Flag as a
  page still to be designed, not yet scheduled to a specific module.
- **Any filter that isn't applicable to the current selection is
  DISABLED, never hidden** — this generalizes the existing Department-
  vs-Class and Designation/Stream mutual-dependency examples into one
  rule: if a filter control doesn't currently apply (e.g. Designation
  before a Department is picked, Class/Department while "Student"/
  "Staff" respectively is not the active person-type), it stays visible
  in its usual toolbar position with the established disabled styling
  (muted background, muted text, `cursor: not-allowed`) — it never
  disappears or moves, so the toolbar's shape stays predictable.
- **Related filters sit adjacent to each other in the toolbar, never
  separated by an unrelated filter** — Department and Designation are
  always next-door neighbors; Class and Stream are always next-door
  neighbors. An unrelated filter (Payment Mode, Status, the period
  picker) never sits between two filters that depend on each other,
  even if that means reordering where a previously-placed unrelated
  filter goes. The fixed overall order (Search → scope filters →
  status/mode filters → period picker, established earlier) still
  applies — this rule is about keeping DEPENDENT pairs glued together
  within that order, not about changing the order itself.
- **A search box is mandatory on every list/table page** — if a page
  shows a table of records (staff, students, payroll rows, leave
  requests, etc.) and doesn't yet have one, add it as the first element
  of the toolbar (grows to fill space, per the established toolbar
  pattern), even if it wasn't in an earlier draft of that page.
- **Fixed filter ordering, applied on every toolbar**: Search → scope
  filters (person type, department/class) → status/mode filters → the
  period/calendar picker LAST. The period picker is a single combined
  control (prev/next chevrons around one "Month Year" label, e.g.
  "August 2026"), never two separate Month and Year dropdowns — this is
  the same control shape used in Attendance's toolbar, reused everywhere
  a month/year needs picking, so switching periods looks and works
  identically across every module.
- **Any modal with potentially-long or dynamically-growing content** (add/
  edit forms with repeatable rows, e.g. allowances/deductions; any list
  that can extend past the modal's visible height) uses a sticky
  header+footer layout: the modal box is a flex column with a fixed-
  height header (title + close icon) and fixed-height footer (Cancel +
  primary action), and only the middle content area scrolls
  (`overflow-y: auto`, `flex: 1`). The title and action buttons must
  always be reachable without scrolling to find them, regardless of how
  much content the middle section grows to.


- **Header separation**: the header row has a `border-bottom` (a thin
  light line, e.g. `#e8e6f5`) and an explicit spacer block (~24px height)
  between it and the body below — not just a CSS margin — so the header
  zone and the body zone read as two clearly distinct areas.
- **Back navigation**: any sub-page reached via a sidebar sub-item (e.g.
  Payment History, Salary Groups, Assign Salary under Payroll) shows a
  "← Back to [Module]" link (accent-purple text + left-arrow icon) as the
  first element in its main content area, above that sub-page's own
  summary strip/card — linking back to the module's default/main view.
- **Table structure, finalized column set for a typical module list**
  (adapt columns per module, keep the shape): a leading checkbox column
  (header checkbox = select-all) + entity column (avatar + name/role) +
  domain-specific metric columns (e.g. Attendance dots, or whatever a
  given module needs) + a breakdown pair like Gross/Deductions before a
  final Net/primary-number column + a fixed-width status chip column +
  a right-aligned action column.
- **Status chips are FIXED WIDTH** (e.g. 80px), text centered — every
  chip in a column renders the same visual size regardless of label
  length (Locked/Draft/Pending all equal width), not a hug-content pill.
- **Deduction amounts use the same neutral secondary-text color as other
  numeric columns** (e.g. `#6b6b85`), NOT a saturated red — a leading
  minus sign already communicates "this is subtracted"; coloring it red
  on top reads as an alarm/error rather than a routine calculation line,
  which is the wrong signal for an expected, correctly-computed value.
- **Action column is a fixed-width slot** (e.g. 100px) with icons
  right-aligned AND vertically centered inside it — a row with a single
  action icon (e.g. "Generate" for a not-yet-generated row) occupies the
  exact same box position as a row with two action icons (e.g. View +
  Unlock for a locked row), so the single-icon case never appears
  visually offset or misaligned from the surrounding rows.
- **Table overflow handling, precisely**: the scrollable region is a
  parent wrapper with `overflow-x: auto` and small negative-margin +
  matching padding (so the scrollbar can span the card's full width
  without changing the card's own edges), containing an inner wrapper
  with the real `min-width` sized to the full column set. The min-width
  alone on a single element, with no dedicated scrolling parent around
  it, is NOT sufficient and will let row content spill past the card's
  edge instead of scrolling within it — both layers are required.
- **Row actions are always same-shape icon-buttons** (30×30px, rounded),
  never mixed with pill/text buttons in the same action column. Only the
  icon glyph and color vary by state:
  - Muted style (light purple-tint background) = a neutral action
    (View, Lock, Regenerate)
  - Solid purple fill = the PRIMARY action for that row's current state
    (e.g. Generate, when nothing exists yet for that row)
  - Soft red/warning tint = a reversing/destructive-ish action (e.g.
    Unlock) — always behind a confirmation modal before it takes effect
- **Row states for a generate-and-lock-style workflow** (Payroll is the
  reference case, apply the same three-state shape to any similar
  module): (1) not yet generated → single "Generate" action, metric
  columns show "—"/"Not generated" in muted text, status chip reads
  "Pending"; (2) generated but not locked (Draft) → "Regenerate" action
  (for correcting a mistake, e.g. something generated mid-period before
  data was final) + "Lock" action; (3) locked → "View" action + "Unlock"
  action (behind a confirmation modal explaining what re-opening means
  for any linked records, e.g. payments).
- **Bulk vs single actions, kept distinct**: the toolbar's primary button
  (e.g. "Generate for selected") is DISABLED by default and only enables
  once ≥1 row checkbox is selected, with its label reflecting the
  selected count once active. This is separate from each row's own
  single-row action button in the Action column — bulk and single-row
  triggers never merge into one control.
- **Horizontal scroll for wide tables**: the table's row content sits in
  an inner wrapper with a `min-width` sized to its full column set; the
  outer wrapper scrolls horizontally (`overflow-x: auto`) if the card is
  narrower than that — columns never compress/wrap awkwardly, the whole
  row set scrolls together as one unit instead.

### Reusable component architecture (build once, use everywhere — critical for speed)

The design system above must be implemented as a small set of SHARED Angular
components, not re-coded per module. This is the difference between "every
module looks the same because we copy-pasted the HTML" (slow, drifts over
time, hard to fix globally) and "every module looks the same because they
all use the same component" (fast, consistent by construction, one fix
propagates everywhere).

Build these as standalone, reusable components in a shared module (e.g.
`shared/components/` alongside the existing `AdminSharedModule`/
`TeacherSharedModule` pattern), each with clear `@Input()`s so a module
only supplies its own data/labels, never its own markup for these pieces:

- **`<app-page-shell>`** — the header (brand mark, session selector,
  profile pill + dropdown) + sidebar (nav items, expandable parent with
  connector-line sub-items) + spacer + main content slot. Every module
  page wraps its content in this one shell component — built once in R4,
  never rebuilt per module.
- **`<app-summary-strip>`** — the pulsing-badge + divided count-chip row.
  `@Input() badgeLabel`, `@Input() counts: {label, value, hero?}[]`.
- **`<app-data-toolbar>`** — search box (grows) + N filter-pills (icon +
  select) + a primary action button, all wrapping together as one group.
  `@Input() filters`, `@Input() primaryAction`, emits selection/search
  events — a module just supplies its filter options and a click handler.
- **`<app-status-chip>`** — fixed-width, centered, soft-tint chip.
  `@Input() status` (a string key) + `@Input() variant` (maps to the
  established color pairs: draft/locked/pending/present/late/absent/etc.,
  extend the variant map as new statuses are needed, don't invent new
  colors ad hoc).
- **`<app-row-avatar>`** — the gradient rounded-square initials avatar +
  name/role stack. `@Input() name`, `@Input() role`, `@Input() colorSeed`
  (deterministically picks one of the established gradient hues so the
  same person always gets the same color, and different rows visually
  vary).
- **`<app-icon-action>`** — the single 30×30 icon-button, with
  `@Input() variant: 'neutral' | 'primary' | 'warning'` mapping to the
  three established action colors, and an `@Input() confirm` flag that
  wraps the click in the shared confirmation-modal component when true
  (for Unlock-style reversing actions).
- **`<app-confirm-modal>`** — the reusable confirmation dialog (title,
  body text, Cancel + confirm button), used by Unlock and any other
  destructive/reversing action across modules — not a one-off modal
  built inside Payroll alone.
- **`<app-data-table>`** — the scrollable row-list shell: checkbox column
  (with select-all), a generic column-header row driven by
  `@Input() columns`, and a row template that projects module-specific
  cell content via `ng-content`/`ContentChild` while the checkbox,
  hover-state, and horizontal-scroll-wrapper behavior are handled once,
  centrally.
- **`<app-back-link>`** — the "← Back to [Module]" link, `@Input() label`
  and `@Input() route`.

### Why this matters for speed specifically

- Building a new module page becomes "assemble these 8 components with
  this module's data," not "write 200 lines of matching CSS again" — this
  is the actual time savings, not just a style preference.
- A future visual tweak (e.g. adjusting the chip's fixed width, or the
  icon-button's border-radius) is ONE change in ONE component file,
  instantly consistent everywhere — not a find-and-replace across a dozen
  module templates that risks missing one.
- This also directly serves the earlier-stated goal of this refactor
  (R4/R5): a role-based dashboard where different modules appear/disappear
  per permission — that's far more reliable when every module is built
  from the same shell/toolbar/table components than if each module has
  its own hand-rolled header and table markup that might subtly diverge.

### Sequencing note for this component library

Build this shared component set as the FIRST concrete step of R5
(immediately after the mockup-approval step already specified in R5
above) — before any individual module (Payroll, Attendance, Leave, etc.)
is migrated to the new design. Payroll's design above is the reference
implementation these components are extracted from (it was fully
designed and approved first); the components should reproduce it exactly,
then every other module consumes the components rather than being
designed from scratch again.

### Quality bar for the shared component library — scalable, optimized, bug-free

These components become the foundation every module page is built on —
a defect or performance problem here doesn't stay isolated, it replicates
into every module that uses it. Treat this library with the same rigor
as the backend's performance-optimization pass earlier in this project,
not as disposable UI scaffolding.

**Scalability**:
- `<app-data-table>` must handle realistic row counts (hundreds of staff/
  students per school) without degrading — apply `OnPush` change detection
  and `trackBy` on its row-rendering `*ngFor` from day one (per the
  Frontend Performance section earlier in this file), not as a later
  retrofit.
- Every `@Input()` is typed (a TypeScript interface, not `any`) so a
  module wiring in the wrong shape of data fails at compile time, not as
  a silent runtime bug discovered later in a specific module.
- Components must not assume a fixed number of columns/filters/rows —
  `app-data-toolbar`'s filters and `app-data-table`'s columns are
  driven by input arrays, so adding a filter or column to one module
  never requires touching the shared component itself.

**Performance**:
- `ChangeDetectionStrategy.OnPush` on every one of these shared components
  — they render on every module page, so this is the highest-leverage
  place in the whole app to get change detection right.
- No function calls inside templates for these components (e.g. status
  color lookup, avatar gradient selection) — precompute in the component
  class or use a pure `Pipe`, per the earlier Frontend Performance
  guidance, since these run once per row × every module page in the app.
- `<app-confirm-modal>` and any dropdown/menu component lazy-renders its
  content (doesn't exist in the DOM until opened) rather than being
  hidden-but-present, to avoid dozens of unused modal DOM nodes across a
  page with many action buttons.

**Bug prevention — this is the priority**:
- Write these components with unit tests covering their `@Input()`
  contract (e.g. `app-status-chip` renders the correct color for every
  defined variant, `app-icon-action` correctly gates a click behind
  `app-confirm-modal` when `confirm=true` and does NOT when false) —
  since every module depends on these behaving correctly, a bug here is
  a bug everywhere.
- No component silently swallows an unexpected input (e.g. an unknown
  `status` string passed to `app-status-chip`) — fall back to a clearly
  visible default/neutral style and log a console warning in development,
  rather than rendering broken/blank output that's hard to trace back to
  its source module.
- Before any module is migrated to use these components, verify byte-for-
  byte visual parity against the approved reference (the Payroll design
  and the HTML reference file already produced) — a pixel-diff or manual
  side-by-side check, not just "looks about right." Regressions introduced
  while extracting the reusable components from Payroll's original markup
  are the most likely source of subtle, hard-to-spot bugs at this stage.
- Each shared component ships with a short usage comment (its `@Input()`s,
  what each does, one example) at the top of its file — this is what lets
  a future module's implementation actually reuse it correctly instead of
  guessing at its contract and reintroducing per-module drift.

---

## PHASE R6 — Audit logging, device/IP footprint, rate limiting, app-level security

### Principle — log what matters, not everything

Before building this, explicitly decide the boundary: this is a SECURITY
and ACCOUNTABILITY audit trail, not a general-purpose analytics or replay
system. Log actions that answer "who did what, when, from where" for
things that matter if disputed or investigated later — not every read,
every page view, or every trivial UI interaction. Concretely:

**DO log** (write/mutate operations, and sensitive reads):
- Authentication events: login success, login failure, logout, token
  refresh failure (repeated failures matter for security)
- Every Create/Update/Delete across every module (Attendance manual entry,
  Leave approve/reject/cancel, Holiday assign, Payroll generate/lock/
  unlock, Salary payment record/confirm/dispute, Roster/Shift assignment,
  Device assign/activate/block, permission changes to any Staff member)
- Access to specifically sensitive data reads where read-access itself is
  security-relevant (e.g. viewing another staff member's salary details,
  viewing a Payroll record — these are the "sensitive reads" worth
  logging; routine reads like "opened the attendance calendar" are not)

**DO NOT log**:
- Routine page navigation / route changes
- Every GET request for lists/dashboards (Attendance grid load, Leave
  list view, etc.) — these are not security-relevant reads
- Repeated identical no-op reads (e.g. auto-refresh polling)
- Frontend-only UI state (tab switches, modal open/close, hover states)

This distinction is the actual engineering discipline here — a system
that logs everything becomes both a storage/performance burden and, more
importantly, useless as an audit trail because a genuine security event
gets buried under noise. Keep the signal-to-noise ratio high.

### Data model — ActivityLog

One collection, following this codebase's existing conventions (inline
schema, manual `createdAt`, plain String FKs):

```
adminId: String, required          // tenant scope
actorType: String, enum ['staff','admin','sales'], required
actorId: String, required
action: String, required           // 'create','update','delete','login','login_failed','logout','approve','reject','lock','unlock','confirm','dispute', etc.
module: String, required           // 'attendance','leave','holiday','payroll','roster','shift','device','auth','permission'
targetType: String                 // e.g. 'LeaveRequest','Payroll','Staff'
targetId: String
changes: Object                    // { before: {...}, after: {...} } — only the fields that changed, not full document dumps, for update actions
ipAddress: String
userAgent: String
deviceFootprint: {                 // see device/IP footprint section below
  ip: String,
  approxLocation: String,          // city/region-level only, from IP geolocation — never precise GPS unless the app already has location permission for another reason
  userAgent: String,
  deviceType: String               // 'mobile'|'desktop'|'tablet', parsed from user-agent
}
timestamp: Date, default Date.now
```

Indexes: `{ adminId: 1, timestamp: -1 }` (recent activity for a school),
`{ adminId: 1, actorId: 1, timestamp: -1 }` (one person's activity trail),
`{ adminId: 1, module: 1, targetId: 1 }` (full history of one record, e.g.
"show me everything that happened to this Payroll record").

### Implementation — one shared logging utility, not copy-pasted per controller

Build a single `logActivity(req, { action, module, targetType, targetId,
changes })` helper (in `helpers/activity-log.js` or similar), called
explicitly from the handful of controller actions that matter (per the
DO/DO-NOT list above) — do NOT build this as blanket middleware that
intercepts every request, since that's exactly the "log everything"
anti-pattern being avoided. Explicit calls at the specific mutation points
keep the log meaningful and keep the change auditable in code review (you
can see exactly which actions are logged by grepping for
`logActivity(...)` calls).

Fire-and-forget this call (don't await it in the response path, don't let
a logging failure break the actual operation) — matching the existing
codebase's tolerance pattern elsewhere (e.g. device resync being
non-blocking).

### Device / IP / location footprint

- Capture `req.ip` (behind whatever proxy/load-balancer config is used in
  production — verify `app.set('trust proxy', ...)` is correctly
  configured so this isn't just the load balancer's IP) and
  `req.headers['user-agent']` on every authentication event (login,
  refresh) and on every logged mutation from the DO list above.
- IP-based approximate location (city/region level, via a lightweight
  IP-geolocation library or a free-tier IP geolocation API) — this is
  coarse location for security/anomaly purposes (e.g. "this login came
  from a different city than usual"), NOT precise device GPS. Do not
  request browser geolocation permission for this — that's a different,
  more invasive capability this feature doesn't need.
- Store this device footprint on both the ActivityLog entries AND
  optionally on the Staff/Admin record as "last known login info" (last
  IP, last login timestamp, last device type) for a quick "is this
  actually me" self-check the user could see in their own profile —
  useful, lightweight, and matches what most production auth systems
  surface to users (e.g. "last login from X").

### Rate limiting — per operation, not a single global limit

Different endpoints need different limits based on their actual abuse
risk — do not apply one blanket rate limit everywhere.

- **Login endpoints** (admin, staff/teacher, sales): aggressive limiting —
  e.g. 5 attempts per 15 minutes per IP+identifier combination, with
  exponential backoff or a temporary lockout after repeated failures.
  This is the highest-value target for brute-force protection.
- **Password/token refresh endpoints**: moderate limiting — e.g. 10-20 per
  hour per account, since legitimate refresh happens automatically but
  shouldn't be unbounded.
- **Write-heavy endpoints that could be abused for spam or DoS** (Create
  Leave Request, bulk-apply, bulk-assign operations): moderate limiting
  per staff/admin account, e.g. a sane cap like 30-60 per minute — high
  enough to never bother a real user, low enough to blunt a scripted
  abuse attempt.
- **The WDMS sync-now / manual trigger endpoints**: already have jobId
  dedup per Phase 6/7 — add a light per-adminId rate limit on top (e.g.
  max 1 manual sync trigger per 30 seconds) purely to prevent someone
  hammering the button/API from creating unnecessary Redis/Mongo load,
  not for security reasons.
- **General API rate limiting** (a baseline for every authenticated
  route): a generous per-account limit (e.g. 300-600 requests/minute) as
  a backstop against a runaway frontend bug or a compromised token being
  used for scraping — not meant to be hit by normal usage.
- Implement via a well-established library (`express-rate-limit` with a
  Redis store — `rate-limit-redis` — since Redis is already in this
  stack for BullMQ, reuse the same connection rather than adding a new
  dependency's own storage layer) rather than hand-rolling rate-limit
  logic.

### Other app-level security to add in this phase — organized by layer

Security must be enforced at all three layers independently (defense in
depth) — a check on only one layer is not sufficient, since any single
layer can be bypassed (a compromised frontend, a direct API call skipping
the UI, a database credential leak).

#### Backend (Express/Node) layer

- **Helmet** (`helmet` npm package) for standard HTTP security headers
  (X-Frame-Options, X-Content-Type-Options, Content-Security-Policy,
  Strict-Transport-Security, etc.) — check `app.js` first, add if missing.
- **Input validation on every write endpoint**: audit that Joi validation
  (`validate(schema)` middleware) covers every POST/PUT/PATCH route — list
  any endpoint currently accepting raw `req.body` unchecked and fix it.
- **NoSQL injection guard**: audit every place a client-supplied object
  reaches a Mongoose query filter directly (e.g. a raw `req.body.filter`
  passed into `find()`) — whitelist expected keys explicitly rather than
  passing client objects through to query construction.
- **Parameter pollution / type confusion guard**: confirm route params and
  query strings are validated for expected type (e.g. an `id` param is
  checked to look like a valid Mongo ObjectId/String format before being
  used in a query, not passed through blindly).
- **Output sanitization**: confirm no endpoint accidentally returns
  password hashes, JWT secrets, or other internal-only fields — audit
  Mongoose `.select()`/projection usage on user-facing reads, especially
  anything touching Staff/Admin/SalesUser login documents.
- **JWT handling**: confirm access tokens have short expiry with refresh-
  token rotation (already the pattern per CLAUDE.md); confirm secrets are
  environment-variable-sourced (already the pattern) and document secret
  rotation as an operational runbook step for this phase.
- **CORS policy**: confirm production CORS config in `app.js` whitelists
  actual known frontend origins, not a wildcard `*`, and doesn't reflect
  the request's Origin header unconditionally.
- **Rate limiting** — per the operation-specific limits detailed above.
- **File upload validation** (Multer configs in `file-upload.js`): confirm
  file type/size limits are enforced server-side, not just via frontend
  `accept` attributes (which are trivially bypassable), and that uploaded
  files are scanned/validated for actual content type, not just trusting
  the file extension or client-reported MIME type.
- **Error message hygiene**: confirm error responses in production don't
  leak stack traces, internal file paths, or database error details to
  the client — generic messages to the client, full detail only in
  server-side logs.
- **Dependency audit**: run `npm audit` on both `backend/` and the root
  frontend `package.json`, and address any high/critical vulnerabilities
  found in current dependencies — this is a five-minute check worth doing
  as part of this phase.

#### Frontend (Angular) layer

- **XSS prevention**: confirm no template uses `[innerHTML]` with
  unsanitized user-supplied content (search for `innerHTML` bindings
  across the codebase) — Angular's default interpolation
  (`{{ }}`) auto-escapes, but any `innerHTML`/`bypassSecurityTrust*` usage
  needs explicit review to confirm it's not rendering user-controlled
  input unsanitized.
- **Sensitive data never in localStorage in plaintext long-term**: confirm
  tokens are stored per the existing `storage.service.ts` pattern
  consistently — if that pattern already uses cookies/secure storage
  appropriately, just confirm no NEW code introduces a raw
  `localStorage.setItem('token', ...)` shortcut bypassing the established
  service.
- **Route guards fail closed, not open**: confirm every guard
  (`AdminAuthGuard`, `TeacherAuthGuard`, and the new unified
  `StaffAuthGuard` from R4) denies access by default on any error/
  ambiguous state, rather than accidentally allowing navigation through if
  a check throws or returns undefined.
- **CSRF consideration**: since this app uses Bearer-token auth (not
  cookie-session auth) for API calls per CLAUDE.md's interceptor pattern,
  classic CSRF is largely mitigated already — confirm no endpoint relies
  on cookie-based auth alone for any state-changing operation, which
  would reintroduce CSRF risk.
- **Dependency audit**: `npm audit` on the frontend `package.json` as well
  (Angular, Angular Material, and third-party libs like `jspdf`/`xlsx`/
  `html2pdf.js` — these process user/file data and are worth checking for
  known CVEs).
- **Sensitive info not logged to browser console** in production builds —
  audit for stray `console.log` statements that might print tokens, full
  user objects, or API responses containing sensitive fields.

#### Database (MongoDB) layer

- **Least-privilege DB user**: confirm the MongoDB Atlas (or self-hosted)
  connection string uses a database user scoped to only the permissions
  the app needs (read/write on its own database), not an admin-level
  account — verify current `.env` `DB_URL` credentials and rotate to a
  scoped user if the current one is over-privileged.
- **Network access restriction**: confirm MongoDB Atlas's IP whitelist is
  restricted to actual production server IPs, not `0.0.0.0/0` (open to
  the world) — this was fine for local dev troubleshooting but must be
  locked down before/at production launch.
- **Encryption at rest and in transit**: confirm MongoDB Atlas's default
  encryption-at-rest is enabled (standard on Atlas) and the connection
  string uses `mongodb+srv://` (TLS by default) — verify this hasn't been
  disabled anywhere.
- **Sensitive field handling**: bank account numbers (StaffBankDetails),
  passwords (already hashed via bcryptjs per existing pattern) — confirm
  bank account numbers are at minimum not returned in plaintext on any
  list/read endpoint that doesn't specifically need them (e.g. a payroll
  list view showing "Account ending in 4417" rather than the full number,
  matching how this same principle is already applied to other sensitive
  identifiers elsewhere in this system).
- **Backup strategy**: confirm MongoDB Atlas automated backups are enabled
  (or equivalent for self-hosted) — this is a resilience/security
  concern (ransomware/accidental-deletion recovery), not just a
  performance one; document the current backup/restore procedure as part
  of this phase if none exists yet.
- **Index-level protection against DoS via expensive queries**: covered
  already by the performance-optimization pass, but explicitly cross-
  reference it here — an unindexed query that lets a malicious or buggy
  client trigger a full collection scan is both a performance AND
  availability/security concern at scale.

#### Sensitive data in logs (all layers)

- Explicitly confirm the ActivityLog's `changes` field NEVER stores raw
  passwords, tokens, or full bank account numbers even when logging an
  update to a record containing them — redact/omit specific sensitive
  fields from the `changes` diff (e.g. log that `accountNumber` changed,
  not its before/after values).
- Confirm server-side application logs (console output, any future
  centralized logging) never print full request bodies for
  authentication endpoints (which would include passwords) or full JWTs.

### Frontend — where this surfaces to the user

- A simple "Recent Activity" or "Audit Log" view, admin-only, under
  Settings — reached via the sidebar per the corrected navigation rule
  above, not an in-page settings icon — filterable by module, actor, and date range, paginated.
- A "My Recent Logins" or "Security" section in each Staff member's own
  profile, showing their own last few login events with device/location
  info (self-service security awareness, e.g. "was this you?") — this is
  the user-facing payoff of capturing the footprint, not just a hidden
  backend record nobody ever sees.

## Verification (R6)
1. Perform one of each DO-list action (create a Leave request, approve it,
   lock a Payroll, fail a login 3 times) and confirm exactly one
   corresponding ActivityLog entry per action, with correct actor, IP, and
   change diff — and confirm NO log entries were created for routine reads
   in between.
2. Attempt rapid-fire login failures and confirm rate limiting kicks in at
   the configured threshold, with a clear error response, not a silent
   drop or a crash.
3. Confirm the ActivityLog collection's size after a normal day of testing
   is proportionate to actual mutations performed, not bloated by
   accidental blanket logging.

- Run these phases IN ORDER (R1 through R6). Do not attempt R4 (frontend
  unification) before R2/R3 (backend auth + permissions) are solid — the
  frontend needs a stable, complete backend permission model to render
  against, or it will need to be rebuilt when the backend model changes
  underneath it. R6 (audit/security/rate-limiting) should follow R1-R3
  since it needs the unified actor identity to attribute logs correctly,
  but can run in parallel with R4/R5 (frontend work) since R6 is largely
  backend-only until its own small frontend surface (Recent Activity view,
  My Logins view).
- After EACH phase, the app must still fully work end-to-end for a
  regular test session (login as admin, login as an existing teacher via
  whatever their new login mechanism is, exercise Attendance/Leave/Roster)
  before moving to the next phase — same verification discipline as
  Phases 1-10.
- Because this touches auth (the most sensitive layer), test the
  migration scripts (R1, R2) against a COPY of real data first, not
  directly against the live database, given how much is already built on
  top of the current teacher/staff split.
- Update CLAUDE.md's "Auth" section and the relevant naming-convention
  notes once R2/R4 land, since those sections currently describe the
  two-separate-auth-flow reality this refactor is replacing.

## PHASE R7 — Academic session-based data scoping

Goal: every dashboard view shows data scoped to a specific academic
session (e.g. "2026-27"), so past, present, and future session data never
mixes or gets lost — matching the standard ERP pattern of session-wise
data (a student's attendance/fees/marks from 2024-25 stays cleanly
separated from 2026-27, even though it's the same student across years).

### Investigate before planning (do this first, in R7 planning itself)

This codebase already has SOME session concept — `cron-session-service.js`
handles "academic session rollover." Before designing anything new:
- Read `cron-session-service.js` and every model it touches to understand
  what "session rollover" currently does (promotion? data archival? just
  a date flag?).
- Determine whether an `AcademicSession` collection/concept already
  exists (even partially) or whether this phase must create one from
  scratch.
- Identify every EXISTING module that already has an implicit session
  boundary (e.g. Roster/Attendance are month+year scoped, which loosely
  works within one session but doesn't explicitly know "which session is
  this month part of") vs modules with NO session awareness at all today
  (Leave balance resets — does LeaveType's `maxDaysPerYear` reset at
  calendar-year boundary or academic-session boundary? currently probably
  neither, explicitly). This audit produces the real scope of R7 — don't
  assume, verify by reading the actual code.

### Core data model — AcademicSession

```
adminId: String, required
name: String, required            // e.g. "2026-27"
startDate: Date, required
endDate: Date, required
status: String, enum ['upcoming','active','completed'], default 'upcoming'
createdAt: Date, default Date.now
```
Only ONE session per adminId can be `'active'` at a time — enforce this
in the controller (not just convention).

### What must become session-scoped (decide per-module during planning,
### this list is a starting hypothesis to verify, not a final answer)

- **Student class/section** — a student's class in 2026-27 is different
  from 2025-26 (promotion). If Student model currently stores `class` as
  a single mutable field (per the "do not modify student.js" constraint
  from the original build), this is a real tension to resolve carefully:
  the constraint says don't touch student.js's schema, but promotion
  history needs to live SOMEWHERE session-scoped. Investigate whether a
  separate `StudentSessionRecord { adminId, studentId, sessionId, class,
  section }` collection (referencing Student by ID, not modifying it) is
  the right non-invasive answer — this follows the exact same
  "reference, don't modify" pattern already used for BiometricMapping.
- **Attendance (PunchLog/DailyAttendance)** — already date-scoped, but
  needs a `sessionId` field (or a derivable session from date) so a
  session-filtered dashboard view is a simple indexed query, not a
  date-range guess.
- **Leave balance** — `LeaveType.maxDaysPerYear` and
  `PersonLeaveAssignment` need to clarify: does balance reset per
  academic session or per calendar year? This must be an explicit,
  configurable decision (schools may differ), not hardcoded either way.
- **Payroll** — already month+year scoped; needs a `sessionId` field for
  session-wise payroll history views (e.g. "show all payroll for 2025-26"
  spanning its months, which may not align with calendar-year boundaries)
- **Fees, Marksheet, Admission** — the ORIGINAL pre-Schoolzen-attendance
  codebase (300+ files) likely already has session-awareness for these,
  since fee structures and marksheets are inherently session-bound in any
  real school system — audit and confirm current behavior here rather
  than assuming Fees needs the same rework as newer modules.
- **Roster/Shift** — likely doesn't need session-scoping itself (a Shift
  definition like "Morning 9-5" isn't session-specific), but Roster
  assignments (who's on which shift) are naturally bounded by whichever
  session is active — verify whether this needs an explicit sessionId or
  whether date-scoping already implicitly handles it correctly.

### Session selector — top header, standard ERP pattern

Place the session selector in the TOP HEADER bar (`app-header-navbar`,
already a shared component per CLAUDE.md's layout structure — visible on
every admin page, not just the dashboard home) — this matches how every
mature school/college ERP (and general multi-period business software)
surfaces this: a persistent, always-visible session/period selector in
the header chrome, not buried inside one page.

- A dropdown/select in the header showing the current session in a
  human-readable form (e.g. "2026-27"), defaulting to whichever session
  is `'active'`.
- This selection is GLOBAL STATE for the session — implement it as a
  value held in a shared Angular service (e.g. `SessionContextService`,
  a `BehaviorSubject<AcademicSession>`), not per-component local state.
  Every session-aware component subscribes to this shared service rather
  than each page having its own session-picking UI — this is the actual
  "best practice" part: ONE source of truth for "which session am I
  looking at," referenced everywhere, not duplicated logic per page.
- Persist the selected session across page navigation within the same
  browser session (e.g. in the same storage mechanism `storage.service.ts`
  already uses for auth state) so switching pages doesn't silently reset
  back to the active session — but always default back to `'active'` on a
  fresh login.
- Every backend list/read endpoint that returns session-scoped data
  (Attendance, Leave, Payroll, StudentSessionRecord, etc.) accepts a
  `sessionId` query/body parameter, defaulting server-side to the
  `'active'` session if none is supplied (so older frontend calls or
  direct API testing don't break) — the frontend's `SessionContextService`
  is responsible for attaching the currently-selected `sessionId` to every
  relevant HTTP call, likely via an HTTP interceptor (following the same
  interceptor pattern already used for auth headers) rather than every
  component manually adding it to every request.
- Switching the header dropdown re-fetches/re-renders whatever
  session-scoped view is currently open — the selected session change
  should propagate reactively (the shared service emits the new value,
  subscribed components refetch) rather than requiring a manual page
  refresh.
- Write operations remain restricted to the `'active'` session regardless
  of what's selected in the dropdown for VIEWING — if a user has
  "2025-26" selected to review old data and tries to, say, apply a new
  Leave request, the backend rejects it (this session is not active for
  writes) with a clear message, even if the frontend doesn't fully
  prevent attempting the action in every corner case — server-side
  enforcement is the actual guarantee, per this project's established
  discipline.

### Session transition (rollover) behavior

- When an admin marks a session `'completed'` and a new one `'active'`
  (or this happens automatically at the configured `endDate`), any
  necessary rollover logic runs: e.g. copying forward each Staff's
  Shift/Roster assignment pattern, running any student promotion logic
  (likely already partially handled by `cron-session-service.js` —
  extend, don't duplicate), and resetting per-session leave balances if
  that's the configured reset behavior.
- This must be transactional/atomic where multiple documents change
  together (matching the existing `mongoose session/transaction` pattern
  used elsewhere for multi-document writes), so a rollover can't partially
  complete and leave the system in an inconsistent state.

## FINAL PHASE ORDER (decided — this supersedes any tentative ordering mentioned earlier in this file)

Run in exactly this sequence. Each phase depends on the one(s) before it
being settled, so this order minimizes rework:

1. **R1 — Data model unification** (Staff+Teacher merge, migration).
   First, because every later phase references "the Staff record" — the
   identity model must be settled before auth, permissions, sessions, or
   logging can be built against it.

2. **R2 — Unified auth**. Depends on R1's Staff shape. Precedes R3
   (permissions need a token/identity to attach checks to) and R6 (audit
   logs need a stable actor identity to attribute actions to).

3. **R3 — Permission system redesign**. Depends on R1+R2. Precedes R4
   (frontend can't be permission-aware until the model it reads is final)
   and R6 (security/rate-limit rules may reference specific permissions).

4. **R7 — Academic session scoping**. Runs after R1-R3, not in parallel
   with them, even though its subject (time-scoping data) is conceptually
   separate from identity/permissions — because R7 touches Staff-adjacent
   data (Roster assignments, session-wise records), and building it
   against the soon-to-be-replaced Staff/Teacher split would mean redoing
   that integration once R1-R3 land. Building R7 right after R3 means it's
   built once, against the final identity model.

5. **R4 — Unified frontend shell + role-based dashboard**. Depends on
   R1+R2+R3 (final auth/permission model to render against) AND R7 (the
   dashboard shell built in R4 is also where R7's top-header session
   selector lives — building the header chrome once with both role-based
   nav and the session dropdown together avoids reworking it twice).

6. **R5 — Dashboard UI/UX redesign**. Depends on R4 being functionally
   complete — this is the visual/interaction polish pass over a shell
   that already works; redesigning visuals before the structure (nav,
   session selector, permission-driven widgets) is settled means
   redesigning twice.

7. **R6 — Audit logging, device/IP footprint, rate limiting, security**.
   Last. R6 needs (a) the final Staff/actor identity from R1/R2 to
   attribute logs correctly, (b) the final permission model from R3 for
   permission-aware security rules, and (c) the final session model from
   R7 if any log entries should be session-scoped for reporting. Running
   R6 last also means it audits the ACTUAL final shape of every module
   (including R4/R5's frontend and R7's session-scoping), not an interim
   state that then changes underneath it — a security review is most
   accurate when done against a settled system, not one mid-restructure.

### Why NOT security-first (the tempting-but-wrong alternative)

It's tempting to do security first ("shouldn't security always come
first?"), but doing so here would mean rate-limiting rules written
against routes R2 is about to replace, audit logs attributing actions to
an identity model R1 is about to restructure, and a security review of a
system mid-refactor rather than settled. Security work against a moving
target has to be redone when the target finishes moving — sequencing it
last means it reviews the system once, when stable, which also mirrors
how a real security audit is typically commissioned in practice (after a
system is built, not interleaved mid-build).

**Summary**: R1 → R2 → R3 → R7 → R4 → R5 → R6

## What to do right now

Do not start coding yet. Use Plan Mode to produce a detailed PHASE R1 plan
only (data model unification + migration script), reading this file plus
CLAUDE.md plus the actual current `teacher.js`/`staff.js` models and every
`xPermission` block, before writing any code. Stop and get explicit
approval on the R1 plan before proceeding, exactly like every other phase
in this project.
