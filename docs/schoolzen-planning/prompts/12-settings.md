# Build: Settings module (all 4 pages)

Depends on Student (Admission Form Fields), Staff (Roles & Permissions), Examination (Marksheet Templates feeds Marksheet Structure) — build this module LAST among these dependents, since it configures/constrains behavior in modules that should already exist.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/settings/academic-sessions.{html,md}`
3. `docs/schoolzen-planning/v1/settings/admission-form-fields.{html,md}`
4. `docs/schoolzen-planning/v1/settings/roles-permissions.{html,md}`
5. `docs/schoolzen-planning/v1/settings/settings-marksheet-templates.{html,md}`

## Build
**Backend**: `models/settings/academic-session.js`, `field-config.js`, `role.js`, `role-assignment.js`, `marksheet-template.js` (seeded catalog); `controllers/settings/*.controller.js`; matching routes.
**Frontend**: 4 page components under `settings/`; `shared/services/settings/*.service.ts`; `shared/models/settings/*.model.ts`.

## Critical rules
- Exactly one `AcademicSession` is active per school at any time — flipping active sessions is one atomic transaction (old→closed, new→active together), never two separate writes.
- `FieldConfig` (Admission Form Fields) is the SINGLE source both the Admission form's own validation AND Manage Students' Excel bulk-import validation must read — write one shared validator function, never two hand-written implementations that can drift.
- Roles & Permissions' `RoleAssignment` has a unique `(adminId, roleId, classId, sectionId)` index — this is what actually enforces "same class+role can't go to two people," at the database level, not just client validation.
- Marksheet Templates are a fixed, seeded catalog — not admin-created data; "usedBy" counts are computed live from `MarksheetStructure` references, never stored redundantly on the template.
- Every "in use, can't delete/change without confirmation" pattern here (deleting a Role, reassigning a Template) follows the same type-to-confirm or named-consequence-warning pattern used everywhere else in the app.

## Design rules
Zero native `<select>`. Bootstrap Icons only.

## When done
Show all 4 pages next to their references. Confirm: activating a new Academic Session actually flips the old one to Closed atomically; the Admission form's validation genuinely reads from Admission Form Fields' config rather than a hardcoded rule set.
