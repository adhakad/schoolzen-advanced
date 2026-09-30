# Settings — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a fresh deep dive of the real legacy
`academic-session.js` controller and, for the marksheet-templates page,
`exam-result-structure.js`'s `MarksheetTemplateModel` path (its sibling
`MarksheetTemplateStructureModel` path is the seed/subject-marks concern
already owned by `examination/errors.md` — kept separate below, not
duplicated). The other two pages (`admission-form-fields`,
`roles-permissions`) have **no legacy backend or frontend precedent at
all** — confirmed by an explicit search (no `field`/`config` controller
exists; no role/permission model or endpoint exists anywhere in
`users/admin-user.js`, `users/teacher-user.js`, `users/sales-user.js`;
`admin/admin/` has no `session`/`permission`/`role`/`field`/`template`
folder beyond `school/`, which holds unrelated school-profile fields).
Settings' four pages are genuinely disjoint v2-designed concerns with no
shared controller — organized page-wise below rather than by the 9
shapes, since a shape table shared across four unrelated schemas would
obscure which page a builder is actually working on; each page's table
still cites its shape number inline for cross-reference.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below
refer to it), `student/errors.md` (Dynamic Fields section — the
FieldConfig interpreter this page's schema feeds), `examination/errors.md`
(Marksheet Structure cascade/tenant findings, referenced not repeated)

---

## Page 1 — Academic Sessions

**Legacy reality**: `academic-session.js` is a single function,
`GetAcademicSession`, doing `AcademicSessionModel.findOne({})` — no
`adminId` filter, no Create/Update/Delete endpoint, no status field at
all. It returns whatever one global session document happens to exist
in the entire collection, shared across every school. Every legacy
Angular component that reads a session (`student`, `admission`,
`admin-student-fees-structure`, `dashboard`, ...) just consumes that one
string as `academicSession` — there is no settings UI to create, close,
or switch a session anywhere in the legacy frontend. This page is
therefore a genuinely new build on both sides, not a port: the backend
needs its first real `AcademicSession` schema (`adminId`, `label`,
`startDate`, `endDate`, `status`) and the frontend needs its first
Create/Set-Active UI, per `academic-sessions.md`.

| Case | Code | Message | Notes | Shape |
|---|---|---|---|---|
| Label/start/end date missing, or End before Start | `SESSION_DATE_RANGE_INVALID` | "Choose a valid session date range." | | 1 |
| Label doesn't match the full `YYYY-YYYY` format | `SESSION_LABEL_FORMAT_INVALID` | "Session label must be in the format 2026-2027." | Per `backend/modules/helpers/academic-session-format.js` | 1 |
| Session label already exists | `SESSION_LABEL_DUPLICATE` | "A session with this label already exists." | Unique `(adminId, label)` | 2 |
| "Set as Active" confirmation text doesn't match the session's own label | `SESSION_CONFIRM_MISMATCH` | "Type the session label exactly to confirm." | Session-specific type-to-confirm, not generic "DELETE" | 3 |
| "Set as Active" on a session already Active | `SESSION_ALREADY_ACTIVE` | "This session is already active." | | 5 |
| "Set as Active" on a Closed session (reactivating the past) | `SESSION_REACTIVATION_BLOCKED` | "A closed session can't be reactivated — create a new session instead." | | 5 |
| Delete a session with any records against it (attendance, fees, payroll, admissions) | `SESSION_IN_USE` | "This session has existing records and can't be deleted." | New guard — legacy has no delete endpoint to compare against | 6 |
| "Copy forward" — one or more of Fee/Marksheet/Admit Card Structure, Salary Groups, Holiday Templates fails to copy | `SESSION_COPY_FORWARD_PARTIAL` | "N of the selected item types couldn't be copied — the rest were created normally." | Never rolls back the successful copies for one failed type | 7 |
| Two admins hit "Set as Active" on two different sessions at once | `SESSION_ALREADY_ACTIVE` | (same as above) | The active-flip is one atomic transaction (old→closed, new→active); the loser re-reads and finds either its own target already active or a DIFFERENT session now active, and should re-confirm rather than silently override | 9 |

---

## Page 2 — Admission Form Fields (FieldConfig)

**No legacy backend precedent** — confirmed, no `field`/`config`
controller exists anywhere in the legacy codebase; the legacy admission
form (`student.component.ts`) hardcodes every field and its
`Validators` inline, exactly the anti-pattern `admission-form-fields.md`
exists to retire. This page's own schema and rules are already
specified in full by `student/errors.md`'s "Dynamic (school-created
custom) fields" section (the `FieldConfig` shape, the `buildJoiSchema`/
`buildValidators` interpreter, the seeded-vs-custom distinction) — not
re-derived here. What follows is specific to *managing* FieldConfig
rows from this settings page, as distinct from the admission form that
*consumes* them.

| Case | Code | Message | Notes | Shape |
|---|---|---|---|---|
| A new/edited field has no name or no recognized `validationRule.type` | `FIELD_DEFINITION_INVALID` | "Enter a name and type for this field." | The `buildJoiSchema` switch in `student/errors.md` only recognizes a fixed set of types — an unrecognized type must be rejected at FieldConfig save time, never allowed to reach the admission form as a silently-unrenderable field | 1 |
| Custom field key collides with an existing field key | `FIELD_KEY_DUPLICATE` | "A field with this key already exists." | Unique `(adminId, fieldKey)` | 2 |
| Un-require or hide a `locked` field (Name/Class/DOB/Gender, or Admission No./Roll No.) | `FIELD_LOCKED` | "This field is required by law/board rules and can't be hidden or made optional." | Must be a backend backstop, not just a disabled toggle — a direct API call bypasses the UI entirely, same class of gap every other module's `locked`/protected-row cases guard against | 3 |
| A state-specific field's `stateSpecific` value doesn't match any configured state | `VALIDATION_FAILED` | "Select a valid state for this field." | | 1 |
| Editing a `FieldConfig` row by an ID that doesn't exist | `NOT_FOUND` | "This record no longer exists." | | 4 |
| Deleting (not hiding) a custom field that already has data entered against existing students | `FIELD_HAS_DATA` | "N student record(s) have data in this field — hiding it is reversible, deleting it is not." | Hiding (`visible:false`) is always allowed and non-destructive; only a hard delete needs this guard — schema-safety concern specific to changing a field's shape after data exists, since a field's stored values are keyed by `fieldKey`, not migrated on delete | 6 |
| Changing a field's `type` (e.g. text→dropdown) after student records already hold values under its key | `FIELD_TYPE_CHANGE_UNSAFE` | "Changing this field's type may make existing student data invalid — review affected records first." | Not in the legacy reference (no precedent exists) — derived from first principles: existing `text` values don't validate against a new `dropdown`'s `options` enum, so a bare type-swap silently produces already-invalid stored data with no error until the next read/re-save. Should return the count of affected records the same way `FIELD_HAS_DATA` does, non-blocking warning at minimum, hard block if the new type's schema can't losslessly represent the old values (e.g. free text → enum) | 3 |
| Narrowing a `dropdown` field's `options` to remove a value already stored on existing students | `FIELD_OPTION_REMOVAL_UNSAFE` | "N student record(s) use an option you're removing — they'll show an unrecognized value." | Same schema-safety family as the type-change case above; non-blocking warning with the affected count | 3 |
| Two admins edit the same `FieldConfig` row at once (e.g. one narrows `options` while the other is mid-admission-form-fill against the old rule) | `FIELD_CONFIG_CHANGED` | "This field's rules were just changed by someone else — refresh before continuing." | New concern, no legacy precedent — a live admission-form session should not silently validate against a rule that changed mid-fill; the safer failure is the in-progress form's submit re-validating server-side against current `FieldConfig` and surfacing this if it changed | 9 |

---

## Page 3 — Roles & Permissions

**No legacy backend precedent at all** — confirmed by inspecting all
three `users/` controllers. Legacy authorization is exactly three
hardcoded actor types (`AdminUserModel`, `TeacherUserModel`,
`SalesUserModel`), each with its own login/token flow and no
`Role`/`Permission`/`RoleAssignment` model, no per-module
view/edit grant, and no concept of a scoped (class-limited) role or a
protected owner account — an admin account IS the Super Admin, full
stop, with nothing else configurable. `roles-permissions.md`'s entire
two-step model (Role capabilities, then per-person `RoleAssignment`),
the `isOwner`-protection rule, and the unified-login-via-permissions
principle are new v2 design, not a migration of existing behavior.

| Case | Code | Message | Notes | Shape |
|---|---|---|---|---|
| Role name blank | `ROLE_NAME_REQUIRED` | "Role name is required." | | 1 |
| Role name already exists | `ROLE_NAME_DUPLICATE` | "A role with this name already exists." | Unique `(adminId, name)` | 2 |
| Attempting to edit/delete the seeded Super Admin role, or flip its `isSuperAdmin`/`isScoped` flags | `SUPER_ADMIN_ROLE_PROTECTED` | "The Super Admin role can't be edited or removed." | Backend backstop — every school needs exactly one role that can't be misconfigured into locking everyone out | 3 |
| `RoleAssignment` for the same `(roleId, classId, sectionId)` already held by someone else | `ROLE_SCOPE_ALREADY_ASSIGNED` | "This class/section is already assigned this role to someone else." | Enforced by the unique index on `RoleAssignment`, not just client validation | 3 |
| Attempting to remove the Super Admin role from, or delete the `RoleAssignment` of, the `isOwner` staff member | `OWNER_ROLE_PROTECTED` | "The account owner's Super Admin access can't be removed." | Backend backstop regardless of who's asking, including another Super Admin — both the role-removal endpoint and `DELETE /role-assignments/:id` must check this server-side, per `roles-permissions.md` | 3 |
| A `classId`/`sectionId` given for a `RoleAssignment` whose role has `isScoped:false` | `ROLE_SCOPE_NOT_ALLOWED` | "This role isn't class-scoped — leave the class/section blank." | Mirrors Academic Setup's `STREAM_NOT_ALLOWED` shape — a scope field only makes sense in combination with the flag that enables it | 1 |
| Referenced Role or Staff on a `RoleAssignment` doesn't exist (or belongs to another school) | `NOT_FOUND` | "This record no longer exists." | Wrong-tenant reported identically to genuinely missing | 4 |
| Delete a Role currently held by any staff (`RoleAssignment` exists) | `ROLE_IN_USE` | "N staff member(s) hold this role — reassign them first." | | 6 |
| Two admins assign the same class+role to two different staff at once | `ROLE_SCOPE_ALREADY_ASSIGNED` | (same as above) | Caught by the unique index, never a pre-check-then-write | 9 |

---

## Page 4 — Marksheet Templates

**This is a distinct concern from Examination's Marksheet Structure —
confirmed by reading both the spec and the legacy code, not assumed.**
`settings-marksheet-templates.md` is a fixed, seeded gallery of
grading/layout designs an admin *picks and assigns* to a class (visual/
grading-scheme choice); Examination's Marksheet Structure (already
finalized in `examination/errors.md`) is the *subjects and max-marks*
configuration for a class. Legacy code confirms this split already
exists as two separate models in `exam-result-structure.js`:
`MarksheetTemplateModel` (per-`(adminId, class, stream)` assignment of a
named template — `templateName`, `templateUrl`, a cloned `examStructure`
— this is this Settings page's real precedent) versus
`MarksheetTemplateStructureModel` (the seed catalog keyed by
`templateName` alone, cloned onto a class's subjects at assignment time
— that seed catalog and the resulting per-class structure are
Examination's concern, not repeated here).

| Case | Code | Message | Notes | Shape |
|---|---|---|---|---|
| Assigning a Marksheet Template ID that isn't in the seeded catalog | `TEMPLATE_NOT_FOUND` | "This template doesn't exist." | Same code as `examination/errors.md` uses for the same underlying not-found case | 4 |
| Fetching a template by an ID that doesn't exist, **or belongs to another school** | `NOT_FOUND` | "This record no longer exists." | **Confirmed legacy gap**: `GetSingleMarksheetTemplateById` and `DeleteResultStructure` both resolve `MarksheetTemplateModel` via bare `findOne({_id: id})`, with zero `adminId` check — a guessed template-assignment ID from School A can be read or deleted by School B. Same class of bug `examination/errors.md`'s Critical tenant-isolation section already flagged for this exact file's sibling functions — must be fixed here too, not assumed already covered because it's "the same file" | 4 |
| Assigning a template already in use by other classes | `TEMPLATE_REASSIGN_WARNING` | "This template is used by N other class(es) — they'll be affected too." | Warning, not a block — matches `examination/errors.md`'s identical case for the same underlying model; `usedBy` must be computed live from current assignments, never a stored counter that can drift | 3 |
| A class already has a template assigned when a new assignment is attempted | `CLASS_TEMPLATE_ALREADY_ASSIGNED` | "This class already has a template assigned — replacing it will regenerate its marksheet structure." | Legacy's `CreateExamResultStructure` treats this as a hard block ("this class template already exists") with no reassignment path at all — v2 needs a real reassign flow (per `TEMPLATE_REASSIGN_WARNING` above and `settings-marksheet-templates.md`'s "Use This Template" with a warning note), not silently porting the legacy hard block | 5 |
| No Subject Group configured for the class+stream being assigned a template | `SUBJECT_GROUP_MISSING` | "Set up this class's subject group before assigning a marksheet template." | Legacy's `CreateExamResultStructure` already checks this correctly (`ClassSubjectModel` lookup before building `examStructure`) — keep, cross-reference `academic-setup/errors.md` | 4 |
| Reassigning a template while generated marksheets already exist for the class under the old template | (not blocked — explicit consequence) | "This will regenerate the marksheet structure for this class — already-generated marksheets aren't retroactively changed." | Mirrors the snapshot principle `examination/errors.md`'s Critical section establishes for Admit Cards — a generated `ExamResult`/marksheet document must already have its own scored data snapshotted at generation time, so a later template reassignment here must not silently alter a family's already-issued marksheet | 6 |

---

## Backend controller requirements

- **Academic Sessions needs its first real, tenant-scoped schema and CRUD** — legacy's `academic-session.js` is one untenant-scoped `GetAcademicSession` reading a single global document; the `adminId`, `status` enum, exactly-one-active-per-`adminId` invariant, and the atomic old→closed/new→active transaction are all new, not ported. No other legacy endpoint to reconcile against.
- **Tenant isolation on every single-record lookup in the marksheet-templates path** — `GetSingleMarksheetTemplateById` and `DeleteResultStructure` both currently use bare `findOne({_id})`/no ownership check; move both to `findOne({_id, adminId})`, matching the fix `examination/errors.md` already specifies for this same file's other functions. Wrong-tenant reads identically to missing, never a 403.
- **FieldConfig needs schema-change safety checks that have no legacy precedent to copy**: before persisting a `type` change or an `options` narrowing on an existing field, count student records holding a value under that `fieldKey` and surface it (`FIELD_TYPE_CHANGE_UNSAFE`/`FIELD_OPTION_REMOVAL_UNSAFE`) — derived from first principles (a stored value's shape can silently stop matching its own field's validator), not from a legacy gap, since no legacy FieldConfig system exists to have a gap in.
- **RoleAssignment's uniqueness and the `isOwner` protection must both be real backend checks, not client-only** — the unique index on `(adminId, roleId, classId, sectionId)` is the actual guard against double-assignment; the owner-protection check on both the role-removal endpoint and `DELETE /role-assignments/:id` must run server-side regardless of the caller's own role, per `roles-permissions.md`'s explicit callout that even another Super Admin can't remove it.
- **A single shared `requirePermission(module, 'view'|'edit')` middleware, not a hardcoded `if (role === 'admin')` anywhere** — legacy's three separate hardcoded auth flows (Admin/Teacher/Sales, each its own token service) must converge on one permission-resolution path reading `RoleAssignment`, so a future 4th actor type (accountant, librarian) needs zero new authorization code, only new `Role` rows.
- **"Copy forward" and template reassignment are both multi-document operations that must report partial failure per item, never abort-the-whole-thing nor silently skip** — `SESSION_COPY_FORWARD_PARTIAL` and the marksheet-template reassignment's structure-regeneration step both follow the same shape #7 principle already established in `error-catalog-conventions.md` and used by `student/errors.md`'s bulk-import.
- **Deleting a Role, an Academic Session, or a FieldConfig field all need the same cascade-count-before-block pattern** established across every other module's catalog (`ROLE_IN_USE`, `SESSION_IN_USE`, `FIELD_HAS_DATA`) — none of these three have a legacy delete endpoint to compare against, so the count-and-block behavior must be built fresh, not assumed present because "delete usually checks something."
- **Response envelope cleanup**: `academic-session.js`'s and `exam-result-structure.js`'s catch blocks return bare strings (`'Internal Server Error!'`) inconsistently with the rest of the codebase's typed-error middleware — standardize here too, matching every other module's cleanup note.

## Gap found outside this module's own 4 pages — no School Profile page exists anywhere in the plan

Confirmed while reviewing where a school-level identifier like
`udiseNumber` should actually live (see `student/errors.md`'s note —
UDISE identifies a school, not a student): the legacy admin frontend
has a real School Profile page (`school.component`) with
`schoolName`, `schoolLogo`, `affiliationNumber`, and `board` — but no
equivalent page exists anywhere across the 13 modules / 38 pages this
package plans. If UDISE is genuinely school-level, and `board`/
`affiliationNumber` are already known school-level fields with no
home in the new plan either, this package is currently missing a
School Profile settings page entirely, not just missing one field on
an existing page. This needs a scope decision (add a 39th page to
Settings, or fold into an existing page) before the affected fields
can be placed correctly — flagged here rather than silently invented,
since it changes the module's page count.

## Frontend component requirements

- **Academic Sessions, Admission Form Fields, and Roles & Permissions have zero legacy frontend to port from** — confirmed, no matching component folder exists under `admin/admin/` for any of the three (only `school/` exists, and it covers unrelated school-profile fields, not sessions). All three pages' entire frontend — the Create Session modal, the type-to-confirm Set-Active flow, the FieldConfig grouped-list editor with its gear-icon rule modal, and the two-step Role/RoleAssignment matrix UI — is new v2 work built directly from `academic-sessions.md`/`admission-form-fields.md`/`roles-permissions.md`, not a migration, and should not be described as "matching legacy behavior" anywhere in the build since there is no legacy behavior to match.
- **Marksheet Templates has partial legacy precedent** (`MarksheetTemplateModel`'s assign/reassign flow) but its own frontend gallery-card UI (`settings-marksheet-templates.md`'s card grid with usage counts and a preview modal) is also new — the legacy reference only confirms the *backend* shape (template assignment, cascade on delete), not any existing gallery UI to port.
- **Every one of this module's four pages needs its own error-vs-empty-state distinction from day one** — since none of them have legacy code to inherit a *missing* distinction from, this is a build requirement to get right the first time, not a "same gap as legacy" fix: an empty Sessions table (no sessions yet, first-ever school setup) must render differently from a fetch failure, and the same applies to the Role×Staff matrix and the FieldConfig list.
- **The Role×Staff assignment matrix and the FieldConfig list both need a double-submit guard on every mutating action** (assign role, remove role chip, save FieldConfig row) — new UI, so this must be designed in from the start (an `isClick`-style flag per cell/row, not a page-level flag, since both are multi-row grids where one row's in-flight state must not block another's), rather than retrofitted the way several other modules' catalogs had to do after finding the gap in ported legacy code.
- **FieldConfig's gear-icon rule editor must re-fetch and show the live affected-record count before a destructive change is saved** — narrowing `options` or changing `type` should show `FIELD_OPTION_REMOVAL_UNSAFE`/`FIELD_TYPE_CHANGE_UNSAFE`'s count inline in the modal itself, not only after a failed save, mirroring the "count fetched with the list, not discovered after the attempt" principle `staff/errors.md` and `academic-setup/errors.md` both establish for cascade deletes.
- **Marksheet Templates' "Use This Template" action must show the `TEMPLATE_REASSIGN_WARNING`/`CLASS_TEMPLATE_ALREADY_ASSIGNED` consequence inline in the preview modal before confirming**, not as a toast after the fact — the modal already exists per `settings-marksheet-templates.md`'s spec (full grading table preview), so the warning belongs in the same surface the admin is already looking at.

---

**Structure and depth follow the Staff / Academic Setup / Leave modules' format** (`staff/errors.md`, `academic-setup/errors.md`); page-wise organization (rather than shape-wise) is used here specifically because this module's four pages share no controller, schema, or frontend precedent with each other, unlike those three modules' more cohesive page sets.
