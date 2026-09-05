# Student — Admission page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `admission.html` (same folder)

A separate intake workflow from Manage Students — this is where a NEW
student enters the system. Confirming an admission here creates the
underlying student record, and Class/Stream/Admission No./Roll No. are
still EDITABLE at this stage (an application, not yet a placed student
— those same fields become read-only once a student reaches Manage
Students).

**Field set is dynamic**: which fields appear below (beyond the
locked Name/Class/DOB/Gender) is controlled by
`../settings/admission-form-fields.md` — this page's field list
reflects the DEFAULT/all-enabled state for design reference; the
actual rendered form only shows whatever is currently toggled on
there, in the same order.

---

## Shows ALL admissions by default

Same principle as Manage Students: the table shows everything
(paginated) without requiring a filter first. Class and Status are
optional narrowing filters, not a gate.

## Toolbar

Search (by name or admission no.) → Class filter → Status filter
(Pending Documents / Admitted) → "Create" — inside the toolbar row.

## Multi-select with bulk action

Checkbox column + a selection bar: "N selected" + "Print Letters",
disabled until ≥1 row is checked. Batch-printing admission letters for
a selection is the one bulk action that genuinely fits this page (a
school admitting a whole new class section at once needs to print
several letters together, not one at a time).

## Table

Checkbox → Photo → Admission No. (muted "Not yet issued" until
confirmed) → Student → Father Name → Class → Stream → Roll No. →
Session → Status chip (Pending Docs / Admitted) → View → Letter.

## New Admission modal — three grouped sections (sticky header+footer)

**Admission Info**: Session (read-only) → Medium → Class Applied for →
Stream (disabled/"N/A" unless 11th/12th) → Admission No. → Roll Number
→ Admission Fee (read-only) → Fees Concession.

**Student Info**: Photo upload → Name → Date of Birth → Gender →
Aadhar (optional) → Samagra ID (optional) → Category → Religion →
Nationality → Address → UDISE (optional) → Last School (optional) →
Bank A/C Number (optional) → Bank IFSC Code (optional).

**Parents Info**: Father/Mother Name, Qualification, Occupation,
Family Annual Income, Parents Contact (optional).

## Professional View modal

Same profile-style layout as Manage Students' View modal — a header
band (photo, name, identity summary), then Admission Info / Student
Info / Parents Info as clearly labeled two-column sections.

## Professional Admission Letter — redesigned as a genuine formal document

This is what gets printed and handed to a parent, so it's styled to
look like an actual certificate rather than another form:
- A double-line border frame around the whole letter.
- A letterhead with the school logo, name in serif type, and
  affiliation/address/contact on one compact line.
- A centered "CERTIFICATE OF ADMISSION" title band with the academic
  session as a subtitle.
- Fields grouped under small labeled section headers (Admission
  Details / Student Details / Parent-Guardian), each value shown with
  a dotted underline — reads like a filled certificate, not a table
  dump.
- A highlighted fee-paid band (amount + a green "PAID" badge) instead
  of a plain table row, since that's the one line a parent most needs
  to see confirmed.
- Two signature blocks (Applicant's Signature / Authorized Signatory)
  with an actual line to sign above each label.
- Footer has a single "Print" action; when triggered from the bulk
  "Print Letters" action, this same layout repeats once per selected
  student.
