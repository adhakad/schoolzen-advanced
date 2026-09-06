# Examination — Generate Admit Card (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`, Admit Card
Structure (a class must have a structure + a defined exam before cards
can be generated)
Reference: `generate-admit-card.html`

Upgraded to the same Payroll-level shell as Generate Marksheet:
profile dropdown, an `ls-strip` summary (total students / selected
exam / its dates), and a flex-row table with avatars instead of a
plain HTML table.

---

## Summary strip

Total students in the filtered class, plus the currently-selected
exam's name and dates — confirms at a glance which exam is about to
be printed for, before scrolling into the table.

## Toolbar

Search → Class+Stream (existence+dependency pair) → Exam selector
(which Admit Card Structure/exam to generate for).

## Table — flex-row with avatars

Checkbox → Roll No. → Student (avatar + name) → Admission No. →
Preview (eye icon) — matches the flex-row pattern used across
Payroll/Attendance/Generate Marksheet rather than a plain HTML table.

## Checkbox multi-select with bulk print

Same pattern as Admission's bulk "Print Letters": header checkbox +
per-row checkboxes + a selection bar ("N selected" + "Print Selected",
disabled until ≥1 row checked). A per-row "Preview" (eye icon) opens
the same card preview for a single student without needing to select
first.

## Professional Admit Card — same letterhead language as every other printable document

Reuses the exact visual treatment established for the Admission Letter
and Fee Receipt: a bordered frame, serif school name in the header, a
centered title band, dotted-underline field values, and signature
lines (Student's Signature / Principal's Signature) — so every
printable document the app produces shares one visual identity, not a
one-off design per feature. Which fields actually appear in the card
body comes directly from that exam's Admit Card Structure config, not
a fixed list.
