# Academic Setup — Subject Groups page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `subject-groups.html` (same folder)

A Subject Group is a named bundle of subjects a student picks as one
unit (e.g. "Mathematics Group" = Hindi + English + Maths + Science) —
relevant mainly for 11th/12th, where students choose between
combinations within a stream rather than each subject being picked
individually.

---

## Toolbar

Search → Class filter → Stream filter (dependency-gated: disabled
until a Class is chosen — same mutual-dependency pattern used
everywhere) → "Add Group".

## Table

Class → Stream → Group Name → Subjects (tags — this list is naturally
short, 4-6 subjects per group, so inline tags are fine here unlike the
Streams/Sections count-pill case) → Action.

## Add/Edit modal

Class → Stream (disabled until Class is chosen, options depend on the
selected Class per Classes & Sections' data) → Group Name (with a
hint: "A student picks one group; it decides their full subject set")
→ a **checklist of every subject from the Subjects master list**
(checkbox grid) — ticking builds the group's subject set live from
that shared pool, so a subject added or renamed in Subjects
automatically reflects here.

## Delete confirmation

Standard single-row confirm (per the global cascade-delete rule, this
upgrades to type-to-confirm only if students are currently assigned to
this specific group).
