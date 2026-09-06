# Examination — Admit Card Structure (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `admit-card-structure.html`

Carries the same profile dropdown and `ls-strip` summary (total
classes / exams configured) established across the module for shell
consistency.

Much simpler than Marksheet Structure — no marks or grading involved,
just an exam's name/dates and which student fields print on the card.

---

## Toolbar

Class+Stream (existence+dependency pair) + "Create" — no Search, same
reasoning as Marksheet Structure (at most one structure per class per
exam, not a searchable list).

## Table

Exam Name → Class → Stream → Exam Dates → Action (Edit/Delete).

## Create/Edit modal

Exam Name → Exam Start/End Date → **"Fields to show on the card"**
checklist (Photo, Admission No., Roll No., Father's Name, Date of
Birth, Exam Center) — same "which fields appear" pattern established
by Settings' Admission Form Fields, applied here to a printable
document instead of a form.
