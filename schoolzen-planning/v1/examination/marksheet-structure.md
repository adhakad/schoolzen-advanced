# Examination — Marksheet Structure (finalized design)

Status: **FINAL** — v1
Depends on: `../_core/refactor-plan-and-design-system.md`
Reference: `marksheet-structure.html`, `marksheet-structure-setup.html`

Both pages carry the same profile dropdown (school identity, My
Profile, Settings, Logout) established in the Payroll reference, and
Marksheet Structure adds an `ls-strip` summary (total classes /
structures set / not set yet) above the card — consistent shell
across every module rather than a one-off simpler page.

New top-level module: **Examination**, grouped in the sidebar into two
labeled sub-sections — "Marksheet" and "Admit Card" — since the module
holds two genuinely separate document types that happen to share the
Class(+Stream) filter pattern. Naming mirrors Payroll's convention
("Generate Payroll" as the action page, config pages named for what
they configure): **Marksheet Structure** / **Generate Marksheet**,
**Admit Card Structure** / **Generate Admit Card**.

---

## Marksheet Structure — landing page

Class+Stream existence+dependency filter (no Search — there's at most
one structure per class, not a list to search). Three states:
1. **No class chosen** — empty hint.
2. **Structure already exists** for the chosen class — table (Template
   Name, Class, Stream, Created By, Edit, Remove).
3. **No structure yet** — a **template picker grid** (3 template
   thumbnails with a Select button each), matching the legacy
   component's carousel — a marksheet's whole visual layout comes from
   the chosen template, so this is a real choice, not a formality.

Selecting a template navigates to Marksheet Structure Setup to
configure its content.

## Marksheet Structure Setup — one long scrollable form, not modals

Reached after picking a template. A single-scroll page (not multiple
modals) since every section feeds one structure document and an admin
fills it once, rarely revisiting mid-way:

1. **Choose Subjects** — four checkbox groups (Theory / Practical /
   Periodic Test / Project), each pulling from the Subjects master
   list (Academic Setup) — a subject can appear in more than one group
   if a school genuinely tests it multiple ways.
2. **Exam Terms & Max Marks** — a tab per term (Term 1/Term 2, or a
   single "Yearly" tab when the school only has one), each with Max
   Marks inputs per marks-type group. A hint clarifies these are
   ceilings for later per-student entry, not scores being entered here.
3. **Co-Scholastic Activity & Grading** — the grade OPTIONS offered
   later during entry (e.g. A/B/C) per activity (Work Education, Art
   Education, Health & PE) — not a grade being assigned on this page.
4. **Subject Fail Limit for Supplementary** — a single number input
   with a hint explaining its consequence (exceeding it means held
   back instead of eligible for supplementary exams).

## Delete confirmation

Per the global cascade-delete rule: deleting a structure also deletes
every student's exam result entered against it for that class — states
this plainly and requires the standard confirmation before proceeding.
