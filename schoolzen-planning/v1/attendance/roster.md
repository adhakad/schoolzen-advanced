# Attendance — Roster page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `roster.html` (same folder)

Reached via sidebar sub-item "Roster" under Attendance. Shows the
standard "← Back to Attendance" link.

---

## Person-type: dropdown, not tabs

Staff and Student are genuinely different views here (a calendar grid
vs a class-list — not a filtered subset of the same table), but the
switch is still the standard person-type DROPDOWN filter used
everywhere else in the app — not a page-specific tab-strip control.
Switching clears any current row selection. Department filter sits
beside it, enabled only for Staff (mutual-exclusion, same as
Attendance's Department/Class). Designation filter sits immediately
next to Department, enabled once a Department is chosen. (The Student
view doesn't need a separate Class/Stream filter — its rows already
list every class, with 11th/12th expanding into stream sub-rows.)

Month+Year combined picker (prev/next chevrons) applies to BOTH views —
a class's shift mapping is time-scoped too, not just staff's roster.

## Legend

A wrapping strip (light-tint background, full toolbar width) below the
toolbar, built ONLY from shift codes actually present in the currently
visible grid — a shift configured in Manage Shifts but assigned to
nobody in this view does not appear. Never squeezed next to the title;
that breaks once there are more than 2-3 shifts in use.

## Selection bar — two distinct actions

Once ≥1 row/class is checked: "N selected" + two buttons, both disabled
until something is selected:
- **"Assign to Selected"** (primary purple) — opens the shift-assign
  modal.
- **"Delete Selected"** (soft red/warning tint) — visually distinct from
  Assign so the two can never be confused at a glance. Opens the
  type-to-confirm delete modal (see below).

Both buttons and their resulting modals are IDENTICAL in label and
behavior whether the Staff grid or Student class-list is the active
view — only the row content differs.

## Staff view — calendar grid

Checkbox column (header = select-all) + sticky Name+code column + one
column per date. Cells show a compact shift-code chip (e.g. "M", "E"),
color-coded per shift, with a tooltip naming the full shift and timing.
Clicking a cell opens the single-assign modal for that person+date.

## Student view — class list with streams and sections

Same checkbox+table shape as the Staff view (not a chip-grid or
different UI pattern — consistency was a specific correction during
design). Columns: checkbox, Class, Shift(+timing), Change.

**Classes 11 and 12 expand into indented stream sub-rows** (Science,
Commerce, Arts, etc.) — a class-level heading row carries no shift
itself; only its streams do, since different streams can run different
timings.

**Sections appear as a further level, but ONLY where the school has
actually created sections for that class or stream** — existence-based,
same rule as every other Section/Stream filter in the app:
- A class with no sections created (e.g. "1st" in the reference) stays
  a single flat, directly-assignable row.
- A class WITH sections created (e.g. "6th") becomes a heading row (no
  shift of its own) with one indented sub-row per section — same visual
  convention as a class with streams.
- Under 11th/12th, a stream can independently have sections or not: a
  stream with sections (e.g. "Science") becomes its own heading row
  with doubly-indented section rows beneath it; a stream with none
  (e.g. "Commerce") stays a normal assignable row at the stream level.

Each innermost row (whether it's a plain class, a stream, a section
under a class, or a section under a stream) is independently checkable
and independently assignable — the nesting is purely about which level
actually carries a real, distinct shift assignment for this school.

## Single assign/change modal

One shift-select field. Used for: a single grid-cell click (staff), a
row's Edit/Assign icon (student class or stream). Title and behavior
otherwise identical across both entry points.

## Bulk assign modal ("Assign to Selected")

One shift-select field + a one-line note confirming the shift will
apply "to everyone currently selected, for the period shown above" (the
toolbar's month/year, or a from/to date range with a weekday-repeat
picker for the original component's staff bulk-assign — carry that
range+weekday capability forward here). No override options — bulk
assignment is the same shift for everyone selected.

## Delete-selected modal — TYPE-TO-CONFIRM (global rule, see `_core`)

This is a bulk-destructive action, not a single-row delete, so it uses
the heavier type-to-confirm pattern rather than a plain Cancel/Delete
pair:
- A red-tinted warning box explaining scope: "This will permanently
  remove the shift assignment for N people across every selected date."
- Clarifies what's NOT affected: attendance already recorded for those
  dates stays intact — only the forward-looking expected-shift mapping
  is removed.
- States plainly: "This cannot be undone."
- A text field requiring the exact word "DELETE" typed before the
  destructive button enables (monospace input, turns green on exact
  match).
- The action is written to the ActivityLog (R6) — who deleted what, how
  many entries, for which date range, when.

## Empty state

If no active shift exists yet, the page can't do anything — plain note:
"No active shifts yet — create one on the Shift page before assigning a
roster."
