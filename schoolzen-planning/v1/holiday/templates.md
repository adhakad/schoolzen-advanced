# Holiday — Templates page (finalized design)

Status: **Approved** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `templates.html` (same folder)

Second of three separate Holiday pages. A template bundles a school
year's holidays under one name; people are assigned a template, not
individual holidays — so adding a day later is one edit here, not a
re-assign for everybody.

---

## Toolbar

Search + "Add Template" (primary) + "Generate from Public Holidays"
(secondary — neutral-tint button, deliberately styled down so the
primary action stays the obvious one on this screen).

## Table

Template Name → Holidays (count) → Assigned To (count, or muted
"Nobody yet") → Created On → Action (Edit/Delete).

## Add/Edit modal

Template Name → a checklist of every existing holiday (checkbox + its
date range/day-count as a sub-label) — tick which belong in this
template. Empty-state note if no holiday exists yet, pointing to the
Holidays page. A note clarifies an empty template is fine — name the
year now, tick holidays as they're added.

## Delete confirmation

"The holidays inside it are kept — only the grouping goes." Per the
global cascade-delete rule, if people are currently assigned to this
template, the modal names the count and requires type-to-confirm (with
"move them to another template first" as guidance, not a hard block) —
the destructive action is always available, never silently prevented.

## Generate from Public Holidays modal

Year → State (dropdown, shows holiday count per state; loading and
empty states both handled explicitly) → Template Name (the school's own
name for the result). Note clarifies: this COPIES the public list into
the school's own editable holidays under a new/existing template —
nothing stays linked, so changing the public source later never
changes what the school already generated.
