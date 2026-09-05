# Certificates — Generate Transfer Certificate (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`, TC Structure
Reference: `generate-tc.html`

---

## Shows all students by default

Same principle as Manage Students: Class and Status are optional
narrowing filters, not a gate — a school needs to find any student
(not just ones already flagged as leaving) to issue a TC for them.

## Table — flex-row, matching Payroll/Generate Marksheet exactly

Roll No. → Student (avatar+name) → Class → Date of Leaving (em-dash
until issued) → Status chip ("Issued" green / "Not Issued" muted) →
Action: a "Not Issued" row shows an **"Issue TC"** pill (primary); an
"Issued" row shows a **reprint icon** instead — the two states never
show both actions at once, matching Payroll's Locked/Pending/Draft
per-status action convention.

## Issue TC modal — captures leaving-specific facts, not a duplicate student form

TC Serial No. (read-only, auto-assigned) → Date of Leaving → Reason
for Leaving → Conduct Remark → Attendance % (**auto-pulled from
Attendance, read-only** — never re-typed and risking mismatch with the
real record) → Games/Extra-Curricular (optional) → "All fee dues
cleared" checkbox. This modal only asks for what Manage Students'
regular record has no reason to carry — everything else (name,
father's name, DOB, admission details) is read from the existing
student record, not re-entered.

## Professional Transfer Certificate

Same letterhead language as every other printable document in the app
(bordered frame, serif school name, dotted-underline fields) — a
right-aligned Serial No. line, a two-column field grid, and **three**
signature lines (Class Teacher / Accountant / Principal) rather than
the two used on Admit Card, since a TC specifically needs the
accountant's sign-off on cleared dues alongside academic sign-off.
