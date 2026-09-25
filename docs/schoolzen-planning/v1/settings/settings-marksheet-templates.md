# Settings — Marksheet Templates

Status: **FINAL**
Reference: `settings-marksheet-templates.html`

A gallery of fixed, ready-made grading/layout designs — pick one, then assign it to a class via Examination › Marksheet Structure. Not user-editable configuration; "Request a new template" is the path to get a design added.

---

## Frontend

**Body**: an info strip stating these are fixed designs, then a card grid — each card shows terms covered, grade scale, and how many classes currently use it. Click → preview modal (full grading table: theory/practical max, pass marks, co-scholastic areas, supplementary-exam limit, the grade-boundary table) → "Use This Template" assigns it (with a warning note if reassigning a template already in use elsewhere).

## Backend

Schema — `MarksheetTemplate`: seeded, fixed catalog (not admin-created) — `id`, `terms[]`, `gradeScale`, `theoryMax`, `theoryPass`, `practicalMax` (nullable), `coScholasticAreas[]`, `supplyLimit`, `gradeRows[[grade,min,max]]`. Read-only from the frontend's perspective; "usedBy" count is computed live from `MarksheetStructure.templateId` references, not stored on the template itself.
