# Dashboard (finalized design — v5)

Status: **FINAL** — v1
Depends on: `_core/refactor-plan-and-design-system.md`, and reads
summary data from Student, Staff, Attendance, Fees, and Approvals
(Leave) — this page has no data of its own, everything on it is
computed from other modules
Reference: `dashboard.html`

The home landing page after login.

---

## Design history (why it looks like this)

Went through several iterations: a first draft too close to the
legacy page's flat 4-cards layout; a gradient hero banner that turned
out to be a generic, overused SaaS trope mismatching the app's own
all-white-card look; a version stripped back to ONLY already-
established components (`ls-strip`, `layout-row`, `sw-card-main`) with
no bespoke page-specific pattern at all. The final version merges the
best of both: the plain component-reuse structure for the body of the
page, plus a white-card hero (not a gradient banner) for the top
greeting, with soft pastel blob decoration for quiet visual interest
instead of color.

## Hero

A white card (matching every other surface in the app) with:
- A gradient **date badge** (day + month, e.g. "06 / SEP") — reinforces
  "today" before the calendar panel even loads.
- Welcome text + context line (day of week, school name, active
  session).
- Four right-aligned stat pairs (Students, Staff, Attendance,
  Collected) — plain numbers, no chips or colored backgrounds.
- Three soft, low-opacity blurred pastel circles (light purple, pink,
  teal — matching the app's existing status-chip colors) positioned
  behind the stats as quiet texture, never competing with the text.

This is the ONLY place these numbers appear on the page — no duplicate
summary strip beneath it.

## Body — reused components only

- **Attendance this week**: a 7-day bar chart in a standard
  `sw-card-main` card, today's bar visually distinguished.
- **Fee collection**: a donut + legend, same Fees module color language
  (purple = collected, pale pink = due).
- **Quick actions**: five icon-tile shortcuts (New Admission, Collect
  Fee, Apply Leave, Issue TC, Generate Marksheet) into the most common
  cross-module tasks.
- **Calendar** (side column): month grid, today's date in the same
  purple gradient used for primary actions app-wide, small dot under
  holiday dates (recolored white when it lands on today).
- **Pending approvals** and **Upcoming holidays** (side column): short
  lists mirroring Approvals and Holiday's own data, each with a "View
  all" link through to the full module — the dashboard surfaces
  urgency, it doesn't replace either module.

## Layout

Uses the exact `layout-row` two-column structure (main + 300px side
column) already established by Attendance Overview — no bespoke grid
system invented for this page.
