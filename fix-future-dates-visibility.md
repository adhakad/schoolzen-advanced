# Fix — Future Dates Must Show Known Leave/Holiday/Shift Info

Two related bugs across two pages: dimmed future dates are hiding information
that is already known and should be visible, even though the date itself
hasn't happened yet.

## Bug 1 — Attendance Calendar Grid: future Leave/Holiday not shown

### Current behavior
Future date cells in the attendance calendar always render as dimmed/empty
("—"), regardless of whether an approved Leave or an assigned Holiday already
covers that date. This hides information the admin already knows and needs
to see — e.g. a teacher approved for leave from Oct 20-25 should show that on
the calendar right now, not just once Oct 20 arrives.

### Fix
- When building the attendance grid (attendance-calendar.js /
  getSchoolMonthGrid, and the same logic wherever the frontend fetches month
  data), the existing leave map and holiday map queries currently used for
  past/present dates must ALSO be applied to future dates in the same month —
  do not skip the leave/holiday lookup just because a date is in the future.
- Cell rendering logic:
  - Future date, no leave, no holiday → render exactly as today (dimmed,
    "—", non-interactive) — UNCHANGED behavior.
  - Future date, covered by an approved Leave → render the Leave status
    chip (same visual style as a past Leave day: color, label) but keep the
    cell non-clickable/non-interactive (no day-detail modal opens, no manual
    entry allowed for a future date).
  - Future date, covered by an assigned Holiday → render the Holiday status
    chip the same way, non-interactive.
  - If a date is somehow both Leave and Holiday (edge case), Holiday takes
    precedence for display, matching the same precedence order already used
    for past dates (Holiday > Leave, per attendance-status.js's documented
    precedence: manual > Holiday > Leave > computed).
- Tooltip on hover (for these future Leave/Holiday cells only):
  - Leave cell → "Leave: {leaveTypeName}" (e.g. "Leave: Casual Leave")
  - Holiday cell → "Holiday: {holidayName}" (e.g. "Holiday: Diwali")
  - Use the existing tooltip mechanism already present elsewhere in this
    app (e.g. Angular Material's matTooltip, or whatever the codebase
    already uses) — do not introduce a new tooltip library.
- Do NOT add tooltips or chips to future dates that have no leave/holiday —
  those stay exactly as they are today (plain dimmed empty cell, no tooltip).
- Do NOT make future Leave/Holiday cells clickable or open any modal — this
  is display-only information, not an interactive cell.

### Files likely involved
- backend/modules/services/attendance-calendar.js (getSchoolMonthGrid and
  buildDayEntries — remove any "skip if future" guard around the leave/
  holiday map lookups)
- Frontend attendance component (whichever renders the grid cells and
  currently short-circuits future dates to a plain dash)

---

## Bug 2 — Roster Grid: future month shows empty even when shift IS assigned

### Current behavior
When a shift has been assigned to a person for a future month (e.g. admin
assigns October's roster in September), the Roster grid still shows "—" for
those future dates, exactly like unassigned dates. There is no way to tell,
just by looking at the grid, whether a future date has a shift assigned or
not.

### Fix — minimal, don't over-build
- Future date cells in the Roster grid must show the shift name (or a short
  label/chip, matching whatever compact style the grid already uses for
  past/today assigned cells) whenever a shift IS assigned for that date —
  same visual treatment as an assigned past/today cell, just still
  non-clickable/non-editable since it's in the future.
- Future date cells with NO shift assigned remain a plain empty "—", exactly
  as today — no change to this case.
- Tooltip on hover for an assigned future cell: show the shift name and its
  timing, e.g. "Morning Shift, 09:00–17:00" — reuse the Shift model's
  existing name/startTime/endTime fields, no new data needed.
- Do NOT add any other behavior — no new colors beyond what's already used
  for assigned cells, no click interaction, no additional badges or icons.
  This is purely: make the already-known assignment visible + a tooltip,
  nothing more.

### Files likely involved
- backend/modules/controllers/roster.js (GetRosterMonth or equivalent —
  confirm it isn't filtering out future dateKeys before returning the
  rosterMap)
- Frontend roster component (wherever the grid currently renders a dash for
  any date beyond "today" regardless of whether rosterMap has an entry for
  it — this is likely a frontend-only display bug since the backend already
  stores and can return future-dated Map entries via the monthly-snapshot
  Roster model)

---

## Testing checklist
1. Approve a Leave request for a staff member covering 3 days next month —
   open Attendance calendar for that month, confirm the Leave chip shows on
   all 3 future dates with correct tooltip text, and clicking does nothing.
2. Assign a Holiday template covering a date 2 months from now — confirm
   the Holiday chip renders on that future date with the correct tooltip.
3. Confirm a future date with NEITHER leave nor holiday still renders as a
   plain dimmed "—", unchanged from current behavior.
4. Assign a shift to a person for next month's Roster — confirm the shift
   name/chip is visible on those future dates in the grid, with a tooltip
   showing shift name + timing.
5. Confirm a future Roster date with no shift assigned still shows a plain
   "—", unchanged.
