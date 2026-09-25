# Build: Staff module (all 3 pages)

No dependency on other modules.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/staff/manage-staff.{html,md}`
3. `docs/schoolzen-planning/v1/staff/departments.{html,md}`
4. `docs/schoolzen-planning/v1/staff/designations.{html,md}`

## Build
**Backend**: `models/staff/staff.js`, `department.js`, `designation.js`; `controllers/staff/*.controller.js`; matching routes.
**Frontend**: `staff/manage-staff/`, `staff/departments/`, `staff/designations/` (components); `shared/services/staff/*.service.ts`; `shared/models/staff/*.model.ts`.

## Critical rules
- One `Staff` collection for both teaching and admin staff — no separate Teacher collection.
- Department/Designation dependency: Designation `.dd` in Manage Staff's form is disabled until a Department is picked; but on the Designations page itself, Department is OPTIONAL (a designation can stand alone) — these are two different rules for two different contexts, don't conflate them.
- Card assignment (Manage Staff) has 3 verify modes (Card only / Card + PIN / Card + Fingerprint) — one more than Student's 2 modes.
- Deleting a Department/Designation currently in use requires type-to-confirm.

## Design rules
Zero native `<select>`. Bootstrap Icons only. Match each page's own toolbar shape.

## When done
Show all 3 pages next to their references. Confirm Designation's Department filter/field genuinely allows "none".
