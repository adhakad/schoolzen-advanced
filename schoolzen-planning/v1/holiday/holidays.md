# Holiday — Holidays page (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `holidays.html` (same folder)

**Split from a 3-tab single component into 3 separate pages** (Holidays,
Templates, Assign) — matches the app-wide convention already
established for Payroll and Leave (separate sidebar sub-items, not
tabs on one screen).

---

## Toolbar

Search (mandatory) + "Add Holiday" — inside the toolbar, same row.

## Table

Name → Start Date → End Date → Days → Action (Edit/Delete icons).

## Add/Edit modal

Name (hint: e.g. Diwali, Independence Day, Summer Break) → a single
date-RANGE input for first+last day together (shades every day between
as picked, so a multi-day break is visible before saving; a one-day
holiday is the same date picked twice — not a separate "single day"
toggle) → a computed note: "That is N day(s) off, first and last day
included."

## Delete confirmation

States the real consequence, not a generic warning: "It is removed
from every template that contains it, so anyone on those templates
will be expected in on that day from now on. Attendance already
recorded for it is not changed." Per the global cascade-delete rule,
if this holiday is inside any template, the modal names that and
requires type-to-confirm; a holiday in no template can use the lighter
single confirm.
