# Attendance — Overview page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md` (shared shell,
toolbar, card, chip, icon-action components — this doc only covers what's
specific to this page)

---

## Filters (toolbar)

- **Person type**: only "Staff" and "Student" — no separate "Teacher"
  option, since Teacher is unified into Staff (per the R1 refactor).
- **Department filter**: enabled only when "Staff" is selected.
- **Designation filter**: sits next to Department, enabled only once a
  Department is chosen (mutual-dependency).
- **Class filter**: enabled only when "Student" is selected.
- **Stream filter**: appears only if the school has created any stream
  at all; when it appears, it sits next to Class, enabled once the
  chosen class is 11th or 12th.
- **Section filter**: appears only if the school has created any
  section for the chosen class (or, for 11th/12th, for the chosen
  stream) — a class/stream with no sections created never shows this
  filter at all. When it does appear, it's enabled immediately once its
  parent (Class, or Stream for 11th/12th) is selected. Order when both
  apply: Class → Stream → Section.
- Exactly one of Department/Class is ever active at a time — the other
  renders visibly disabled (muted background, muted text,
  `cursor: not-allowed`) rather than being hidden, so the option is
  visible but clearly not applicable to the current person-type.
- Month navigation: prev/next chevrons around a month+year label.
- Primary action: "Sync now" button (triggers the WDMS punch sync).

## Top summary strip

The ONE place Present/Late/Punched/Absent counts are shown — must not be
duplicated anywhere else on the page (e.g. not repeated again inside the
recent-arrivals panel). "Punched" (arrived, not yet classified
Present/Late by the reconcile worker) uses the accent purple number
specifically, to visually distinguish it from the three settled counts.

## Grid

- Sticky name+shift column on the left; one column per date scrolling
  horizontally to the right.
- Column headers show day name AND date stacked (e.g. "Mon" above "24"),
  never date alone.
- Today's column gets a subtle background tint only — no border, no
  heavy visual treatment. It marks "today" without drawing a hard line
  through the table.
- **Default scroll position is today's column, scrolled fully into
  view** — past dates are reached by scrolling left from there. A school
  month is forward-looking from "today," so there's nothing useful to
  default-show to the right of it.
- Status chips inside cells: same soft-tint pattern as elsewhere
  (Present=green, Late=amber, Absent=red/pink, Holiday=outlined neutral),
  two-line stacked layout (status letter + punch time) in a compact 36px
  chip.
- A pending/unclassified punch (arrived today, not yet reconciled) shows
  a pulsing green ring+dot INSTEAD OF a chip — deliberately no chip for
  this state, since reconcile hasn't run yet and showing a status would
  be showing something not yet true.
- A future day with a known Leave/Holiday already assigned shows the
  same chip a past day would (with a tooltip naming it) but no punch
  time and isn't clickable for manual entry.

## Recent-arrivals panel

- Its own separate card, positioned beside the grid card (not embedded
  inside it, not a strip above the grid).
- Split into two clearly separate sub-sections — "Staff" and "Student" —
  each with its own small section heading. Never merged into one
  undifferentiated list.
- Each row: a pulsing green dot (live — matches the top-strip's live
  indicator), the person's name, and the punch time. No inline
  "Staff"/"Student" text label on the row — the section heading already
  establishes that.
- **Clicking a row reveals an inline info panel directly below it**
  (toggle in place, not a separate modal), showing:
  1. Role (staff) or Class (student) — bold line
  2. A labeled, code-styled ID line: monospace font, tinted badge
     background — matching how person codes/roll numbers are styled in
     the main grid's own code column. "Staff ID" for staff rows, "Roll
     No" for student rows.
  3. A one-line monthly present-count summary.

## Manual override modal (per-cell)

Reused from the existing production component's behavior (not redesigned
— this was already working well):
- Shows the device-punch audit trail for that day (list of raw punch
  times, tagged "(manual)" if manually entered).
- Status select + In-time + Out-time fields.
- If the day was already manually overridden, a "Remove override" button
  is available, and a note explains the sync will not overwrite a
  manually-entered day.
- A future date cannot be opened for manual entry (click is refused).
