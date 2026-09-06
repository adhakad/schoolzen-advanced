# Student — Manage Students page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `manage-students.html` (same folder)

Lists and edits students already admitted (via the Admission page).
Depends on Classes & Sections (pre-existing module) for its Class+
Section options.

**Field set is dynamic**: same source as Admission —
`../settings/admission-form-fields.md` controls which fields exist on
this page's edit form and table columns too (Class/Stream/Admission
No. additionally follow their own read-only-here rule regardless of
that config).

---

## Shows ALL students by default

Unlike an earlier draft that gated the whole page behind a mandatory
Class selection, this final version shows every student by default
(paginated) — Class/Stream/Section are optional NARROWING filters, not
a requirement to see anything. Search and Create work immediately, no
class needs to be picked first.

**Excel Import/Export is the one exception**: it stays disabled until a
Class (+Stream for 11th/12th) is chosen, because a bulk file operation
needs a concrete scope even though browsing the table doesn't — the
modal itself states the active scope plainly ("Scope: 8th").

## Toolbar

Search → Class+Stream+Section (existence+dependency chain, same
two-stage rule as everywhere else: Section only appears if the school
has configured it, and stays disabled until its parent is picked) →
"Excel Import/Export" (secondary, scope-gated) → "Bulk Cards"
(secondary) → "Create" (primary) — all inside the toolbar row.

## Multi-select with bulk actions

Checkbox column (header = select-all) + a selection bar: "N selected"
+ "Assign Card to Selected" and "Delete Selected", both disabled until
≥1 row is checked — same pattern as Payroll/Roster's bulk-action bars.
Card assignment is available BOTH ways: one row at a time (row icon)
and in bulk (either via CSV upload or via this checkbox-selection
path), so an admin can pick whichever fits the moment.

## Table

Checkbox → Photo → Admission No. → Student → Class(+Section tag) →
Father → Mother → Roll No. → Contact → Card (tag or muted "Not
assigned") → Action (View / Assign Card / Resync / Edit / Delete).

## Edit Student modal — Class/Stream/Admission No. are READ-ONLY here

Same three groups as Admission (Academic Info / Student Info / Parents
Info), but Class, Stream, and Admission No. are disabled — those are
fixed facts once a student is actually placed, not something to change
casually from an edit form. Date of Admission and First Enrolled Class
appear here instead of the admission-time fields, since those matter
once a student has an enrollment history.

## Professional View modal

Redesigned as a profile-style read-only view: a header band with a
circular photo/initials avatar, the student's name and a one-line
identity summary (Admission No. · Class · Section · Roll No.), then
clearly labeled sections (Academic Info / Personal Info / Parents
Info) as a two-column grid of label/value pairs — reads like an actual
student record, not a dump of raw fields.

## Delete confirmation — cascade, type-to-confirm

Works identically whether triggered from a single row or from the bulk
selection bar (the modal's wording adapts to the count). Names the real
dependent data — login access, fee records, admit cards, results —
before requiring "DELETE" typed to confirm.
