# Build: Examination module (all 4 pages)

Depends on Academic Setup and Student.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/examination/marksheet-structure.{html,md}`
3. `docs/schoolzen-planning/v1/examination/generate-marksheet.{html,md}`
4. `docs/schoolzen-planning/v1/examination/admit-card-structure.{html,md}`
5. `docs/schoolzen-planning/v1/examination/generate-admit-card.{html,md}`

## Build
**Backend**: `models/examination/marksheet-structure.js`, `admit-card-structure.js`; `controllers/examination/*.controller.js`; matching routes.
**Frontend**: 4 page components under `examination/`; `shared/services/examination/*.service.ts`; `shared/models/examination/*.model.ts`.

## Critical rules
- Marksheet Structure shows EVERY class always (existence-based grid) — Admit Card Structure shows only CREATED structures (a searchable list). Don't conflate these two different toolbar/table philosophies.
- Creating/editing/deleting an Admit Card Structure immediately generates/regenerates/removes the actual `AdmitCard` documents for every matching student — this is not a passive config page.
- Generate Marksheet and Generate Admit Card are both pure read+print pages with NO configuration of their own — all setup happens on their Structure counterpart.
- The print-mode-choice pattern (illustrated option cards: "One per page" / "Two per page", not a dropdown) and the shared letterhead print template are reused across Generate Marksheet, Generate Admit Card, and later Generate TC — build this once as a shared component/service.

## Design rules
Zero native `<select>`. Bootstrap Icons only. Match each page's own toolbar shape.

## When done
Show all 4 pages next to their references. Confirm creating an Admit Card Structure actually populates Generate Admit Card's list.
