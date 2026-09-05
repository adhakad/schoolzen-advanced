# Settings — Admission Form Fields (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `admission-form-fields.html` (same folder)

---

## Single source of truth for Student data structure

This page controls which fields exist across the ENTIRE Student
module, not just the Admission form:
- **Admission** form fields (which appear, in what order, which are
  required).
- **Manage Students** edit form — same fields, same show/hide state
  (Class/Stream/Admission No. still become read-only there per that
  page's own rule — this config controls WHICH fields exist, not the
  separate editable-vs-read-only rule already established).
- **Table columns** on both pages — a hidden field's column disappears
  from the table too.
- **Excel Import/Export** — column set matches exactly what's enabled
  here; a field marked Required makes Excel import reject any row
  missing it, with the failure reported the same way Bulk Assign
  Cards reports row-level failures (row + reason).

Toggling a field's visibility or required-state here takes effect
everywhere at once — there's no separate configuration per page.

## "Always Required" — locked core fields

Name, Class, Date of Birth, Gender are shown in a visually distinct
locked group with no toggle — the app cannot function without a class
placement or basic identity, so these can never be hidden or made
optional. Every other field (Aadhar, Samagra ID, UDISE, Bank details,
Last School, Parent Qualification/Occupation/Income) is a plain
Show/Hide switch plus an independent "Required" checkbox — a field can
be shown but optional, or shown and required, or hidden entirely.

## "Always Required" — separate rows, one default rule each, more addable

Name, Class, Date of Birth, and Gender are each their own row (not one
combined line) — every field a school might want to add an extra check
to needs its own settings icon. Each carries **one non-removable
default rule** baked into what the field fundamentally is:
- Name: must be text
- Class: must match a class defined in Academic Setup
- Date of Birth: cannot be a future date
- Gender: must be Male, Female, or Other

These four rows have no Show/Hide switch and no Required checkbox at
all — they're always shown, always required, by definition, so there's
nothing to toggle. But their settings icon still opens the Edit Field
modal, where the default rule renders as a fixed, non-removable row
(no delete button) and **"+ Add another rule" is still available**
below it — a school can layer an extra check on top (e.g. Name: max 50
characters) without touching the fixed default. "Locked" here means
"this default rule can't be removed and the field can't be hidden," not
"nothing about this field can ever be adjusted."

## Every existing field is editable, not just new custom ones

Every other configurable field row (everything under Student Info,
Parents Info, Parents Contact, and the always-on Admission
Number/Roll Number) has the same settings icon, opening the same
Add/Edit Field modal:
- For an ordinary field, everything is editable — label, type, rules,
  Required, and a "Remove Field" option.
- For Admission Number and Roll Number (locked Show/Required, same as
  before), the Label and Required checkbox are disabled and "Remove
  Field" is hidden — but their Validation Rules list is fully
  editable, same principle as the four base-identity fields above.

## Validation rules are STRUCTURED, never free text

A rule is picked from a fixed dropdown of rule TYPES the system
actually knows how to enforce — "Exact length," "Minimum length,"
"Numeric characters only," "Must start with," "Must be unique," "Cannot
be a future date," etc. — never a free-text sentence like "must be
unique" typed as a string, which the system has no way to parse or
act on. Rules that need a parameter (Exact length, Min/Max length,
Starts With, Min/Max value) show a small value box next to the
dropdown once picked; self-contained rules (Must be unique, Numeric
only, Cannot be a future date) need nothing further. "+ Add another
rule" adds another dropdown+value pair; every rule added must pass
together.

This is what makes the earlier stacked-rules design actually
implementable: Aadhar's "12 digits AND numeric-only AND unique" is
really three structured rows (Exact length: 12, Numeric characters
only, Must be unique), each independently checkable by the system —
not a sentence describing what a human should read and interpret.

## Add Custom Field

Lets a school add a field this list doesn't anticipate (e.g. "Sibling
Name", "Transport Needed", "Blood Group") — appears alongside the
built-in fields with the same Show/Hide + Required controls, and flows
into the same form/table/Excel pipeline as every built-in field.
Adding one asks for Field Label, Field Type (Text / Number / Date /
Dropdown / Phone Number — Dropdown additionally asks for its list of
options), and a **list of structured validation rules**, not just one:
"+ Add another rule" stacks additional rule-dropdown-plus-value pairs
(e.g. Exact length: 6, then Must not start with: 0), all of which must
pass together. This matches how several built-in fields already need
more than one rule stacked (Aadhar: Exact length 12 + Numeric only +
Must be unique; Parents Contact: Exact length 10 + Must start with
6/7/8/9 + Digits cannot all be the same).

## Built-in fields carry more than format checks — best-practice rules

Beyond simple length/pattern checks, a few fields need rules that are
specific to what the data actually means, shown the same way in this
settings list:
- **Uniqueness**: Aadhar Number, Admission Number (school-wide), and
  Roll Number (unique within its class+section, not school-wide,
  since two different classes can both have a Roll No. 1) all reject
  a duplicate.
- **Date sanity**: Date of Birth cannot be a future date, and must
  fall within a plausible age range for the class being applied to
  (catches an obvious typo — e.g. a birth year that would make someone
  30 years old applying to 6th grade).
- **Non-negative numeric**: Family Annual Income cannot be entered as
  negative.

Date of Birth, Admission Number, and Roll Number are always-on rules
(no toggle) — they're locked the same way the "Always Required" group
is, since the app depends on them being sane and unique to function
correctly, not just on them being filled in.

## Validation and error handling are driven from this same config

Every rule shown here — whether a single check or several stacked
together — isn't separately configured per form, it's read from this
one place wherever the field appears:
- **On the Admission/Manage Students form**: an invalid value shows an
  inline error using that rule's plain-language description (e.g.
  "Aadhar number must be a 12-digit number"), and a Required field left
  empty shows "X is required" on blur/submit — same convention already
  used across the app's other forms (Shift, Salary Group, Leave Type).
  When several rules apply, the first one that fails is what's shown —
  the person fixes issues one at a time rather than seeing every rule
  at once.
- **On Excel Import**: the same rules apply per column, evaluated in
  order; a row that fails any one of them is excluded from the import
  and reported in the failure table (row + which rule it failed), same
  pattern as Bulk Assign Cards' success/failure summary — never a
  silent partial import.

Because the rules live in one place, a field's checks are consistent
everywhere they're evaluated — there's no way for the form to accept a
value that Excel import would reject, or vice versa.

## Impact note

A calm, informative banner (not a warning) states plainly what this
page controls, so an admin understands the blast radius of a toggle
before saving — this isn't a scary confirmation, just upfront framing
since the setting's reach is wider than a typical single-page config.
