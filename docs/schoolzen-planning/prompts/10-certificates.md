# Build: Certificates module (both pages)

Depends on Student module.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/certificates/tc-structure.{html,md}`
3. `docs/schoolzen-planning/v1/certificates/generate-tc.{html,md}`

## Build
**Backend**: `models/certificates/tc-structure.js`, `transfer-certificate.js`; `controllers/certificates/*.controller.js`; matching routes.
**Frontend**: `certificates/tc-structure/`, `certificates/generate-tc/`; `shared/services/certificates/*.service.ts`; `shared/models/certificates/*.model.ts`.

## Critical rules
- TC Structure is a SINGLE school-wide settings form, not a table — the 19 certificate fields are locked/disabled checkboxes (a fixed constant in code, not per-school configurable data); only the serial number is editable.
- Generate TC shows all students by default; filters narrow, never gate.
- A generated TC snapshots the student's data AT ISSUE TIME (including the serial number) — never recompute these on reprint even if the underlying student record changes later.
- Issuing a TC transactionally increments `TcStructure.nextSerialNumber`.
- Reuse the shared letterhead print template (from Admission Letter/Admit Card) for the printed certificate — don't build a new one.

## Design rules
Zero native `<select>`. Bootstrap Icons only.

## When done
Show both pages next to their references. Confirm the serial number increments correctly on issue and stays fixed on reprint.
