# Academic Setup — Subjects page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `subjects.html` (same folder)

A flat master list of every subject the school teaches (Hindi,
English, Maths, Biology, etc.) — this is the pool that Subject Groups
picks from via checkboxes. Simple CRUD, same shell as Departments/
Designations.

---

## Toolbar

Search + "Add Subject" — inside the toolbar.

## Table

Name → Type (Core/Elective chip) → Status chip → Action.

**Core vs Elective**: Core subjects are ones everyone in a class takes
regardless of group (Hindi, English); Electives are only relevant once
picked into a Subject Group (Biology, Computer Science). This
distinction exists so the Subject Groups checklist can be built from a
meaningful pool rather than a flat undifferentiated list.

## Create/Edit modal

Name → Type (Core/Elective, with a hint explaining the distinction) →
Status (Active/Inactive, same convention as every other Active/
Inactive toggle in the app).

## Delete confirmation

Per the global cascade-delete rule: a subject referenced by any
Subject Group triggers type-to-confirm naming the dependent groups; an
unreferenced subject uses the lighter single-confirm.
