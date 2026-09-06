# Academic Setup — Classes & Sections page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `classes-sections.html` (same folder)

New top-level module: **Academic Setup**. This is the source data
behind every Class/Section/Stream filter used across the whole app
(Attendance, Leave, Holiday, Manage Students, Admission, Subject
Groups) — it's config, not a records list, which is why it sits
separate from the Student module (that's for actual student records).

---

## Toolbar

Search + "Add Class" — inside the toolbar.

## Table — fixed-width count pills, not inline tags

Class → Streams → Sections → Students → Action.

Streams and Sections are shown as a **fixed-width count pill** ("2
streams", "4 streams") rather than listing every tag inline — 2
streams and 10 streams must render identically in the row. Clicking
the pill opens a popover listing the actual names. This was a specific
correction: inline tags would make the column grow unpredictably wide
as more streams/sections get added.

## Add/Edit Class modal — stream toggle restructures the form

- Class Name (dropdown of standard class names).
- **"This class has streams (11th/12th)" toggle** — this is the pivot
  point of the whole form:
  - **Off**: a flat "Sections" block directly on the class (add/remove
    rows with a "+"/"×", same inline-editor pattern as Salary Groups'
    allowances).
  - **On**: the Sections block is replaced by a "Streams" block (same
    add/remove pattern), and EACH stream gets its OWN independent
    Sections block beneath it — a stream can have sections or none at
    all, same existence-based principle used everywhere else (e.g.
    Commerce having no sections shows "None — add one if this stream
    needs sections").

## Delete confirmation

Per the global cascade-delete rule: a class/stream/section with
students currently in it triggers type-to-confirm naming the count
("142 students are in this class and will need reassigning"); an empty
one uses the lighter single-confirm.
