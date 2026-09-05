# Holiday — Assign page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `assign.html` (same folder)

Third of three separate Holiday pages. Someone with no template gets
no holidays — a day they don't come in still counts as Absent.

---

## Assignment granularity

**Staff** are assigned one at a time. **Students are assigned by
CLASS** — one row covers every student in it, since assigning 40
individual students to the same template per class would be pointless
repetition.

## Toolbar

Search → Person-type (Staff / Students by class) → Department+
Designation (Staff, adjacent pair) → Class+Section (Student,
existence-check) → Holiday Template selector — same filter treatment
as every other assign-type page (Assign Salary, Leave Assign).

## Selection + bulk action

Checkbox column + selection bar ("N selected" + "Assign" button,
disabled until both a row is checked AND a template is chosen in the
toolbar).

## Table

Name (or Class, when Student) → Department (or blank for Students) →
Assigned Template (name, or muted "Not assigned") → Action ("Assign"
if nothing set, "Edit" if a template is already active).

## Edit-one-assignment modal — gated behind explicit confirmation

Changing a LIVE assignment decides whether these people are marked
Absent or Holiday going forward, so this is treated with more care than
a routine field edit:
- Shows current state: "Currently on **[Template name]**" (or "no
  template").
- An amber-tinted gate: "I confirm I want to change this assignment"
  checkbox — the template dropdown AND both footer buttons (Remove
  template / Save) stay disabled until this is ticked.
- A note: "The change takes effect straight away — the attendance
  register picks it up on its next run."
- "Remove template" (unlink) sits as a distinct, separately-gated
  action from changing to a different template — removing entirely is
  a different decision than swapping one for another.

## Empty state

No holiday template exists yet: a note pointing to **Templates** to
make one first (a link, since this page can't do anything without one).
