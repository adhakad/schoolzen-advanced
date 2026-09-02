# Attendance — Manage Shifts page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `manage-shifts.html` (same folder)

Reached via sidebar sub-item "Manage shifts" under Attendance. Shows the
standard "← Back to Attendance" link.

---

## Toolbar

Search (mandatory) + "Create" primary button. No person-type or
department filter — a shift definition isn't staff/student-scoped
itself (it applies to whichever person-type is assigned to it later).

## Table

No. → Name → Start → End → Early In → Grace → Half Day After → Early
Out → Late Out → Status (fixed-width chip) → Action (Edit + Delete
icon-buttons). 11 columns — uses the standard two-layer horizontal-
scroll pattern.

## Create/Edit modal — grouped sections, sticky header+footer

- Name, Start Time, End Time — apply to everyone.
- **"Punch-In Settings" group** (Early Punch + Grace) — a light divider
  + heading + note: "Applies to staff and students."
- **"Staff Only" group** (Half Day After, Early Checkout, Late
  Checkout) — divider + heading + note explaining these don't apply to
  students (a student's day is decided by their arrival punch alone;
  they're never marked Half Day and never checked out), and can be left
  blank for a shift only a class will use.

  Named "Staff Only", NOT "Staff / Teacher Only" — Teacher is unified
  into Staff (R1), so there's no separate Teacher category left to name.
- Status (Active/Inactive).

Each numeric field carries its own inline hint explaining what the
number controls, in plain language, directly under the field — not
relying on the label alone to convey meaning.
