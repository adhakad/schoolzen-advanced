# Examination — Generate Marksheet (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`, Marksheet
Structure (a class must have a structure before results can be entered)
Reference: `generate-marksheet.html`

Upgraded to the full shell polish established by Payroll's Generate
Payroll reference — this page previously used a plain HTML table with
no summary context; it now matches Payroll's exact pattern: profile
dropdown (school identity, My Profile, Settings, Logout), an `ls-strip`
summary above the card, and the flex-row table (avatar+name, fixed-
width chips, icon-button actions) instead of a plain `<table>`.

---

## Summary strip

Total students in the filtered class → Term 1 entered/pending counts →
Term 2 entered count — an at-a-glance read of entry progress before
scrolling into the table, same shape as Payroll's "locked / pending
drafts / total staff" strip.

## Toolbar

Search → Class+Stream (existence+dependency pair) → "Print Selected
(N)" — now tied to the checkbox selection below it rather than a
blanket "Bulk Print," so it's clear exactly who gets printed and the
button visibly shows the count.

## Table — flex-row, not plain HTML table

Checkbox → Roll No. → Student (avatar + name) → one **term status
chip per exam term** the structure defines ("Entered"/"Pending", same
green/muted convention used elsewhere) → row actions: a compact "+
Result" pill (primary) opens the marks-entry modal, an eye icon
(disabled with a tooltip until at least one term has results) previews
that student's marksheet. Checkbox selection feeds the toolbar's
"Print Selected" — a teacher can select exactly the students ready to
print, not just everyone-or-nothing.

## Add/Edit Result modal — grouped exactly like the structure defines

Exam Term selector, then one group per marks-type the structure has
subjects for (Theory/Practical/Periodic Test/Project — a group with no
subjects configured simply doesn't render), each showing a max-marks
reminder in its heading ("Theory Marks (Max 80)"). Co-Scholastic
Activity & Grade appears last, using the grade options the structure
defined. This modal's shape is entirely DRIVEN by what Marksheet
Structure Setup configured — no hardcoded subject list. The footer
shows a live "N of M fields filled" progress note next to the action
buttons, so a long multi-subject entry never feels directionless.

## Printable marksheet

Follows the same letterhead-document treatment as the Admission Letter
and Fee Receipt (bordered frame, serif school name, formal layout) —
subject-wise marks table, Co-Scholastic grade table, the grade-range
legend from the structure, and Class Teacher/Principal signature
lines, matching the CBSE-style format the legacy component already
produced but restyled to the app's established printable-document
language.
