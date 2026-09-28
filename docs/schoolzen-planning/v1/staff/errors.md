# Staff — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
legacy `staff.js`/`department.js`/`designation.js`/`teacher.js`
controllers, cross-checked against the legacy Angular components
(`staff`/`department`/`designation`/`teacher`). Staff is similarly
less form-heavy than Student, so this stays organized by the 9 shapes
rather than a field table, with one case-table per shape actually used
— same precedent as Academic Setup.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

**Naming note**: legacy ships `staff.js` (admin staff: department/
designation) and `teacher.js` (teaching staff: education/permissions)
as two entirely separate collections with no shared fields beyond
name+adminId — `manage-staff.md`'s R1 unification principle merges
these into one `Staff` collection for v2. Every case below that says
"Staff" covers both legacy sources once merged; `teacherUserId` (6-digit,
legacy Teacher) and `empCode` (legacy Staff) become the same optional
unique field, and `education`/permission-set become Staff-only optional
fields rather than a second schema.

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Name blank | `NAME_REQUIRED` | "Name is required." | Legacy `staff.js`'s `CreateStaff` never validates this — a raw Mongoose error currently falls into a generic 500 |
| Name fails letters/spaces pattern (teaching staff only, legacy) | `VALIDATION_FAILED` | "Name can only contain letters and spaces." | Carried from legacy `teacherForm`'s pattern — same Unicode-name gap flagged in Student's `errors.md` applies here too, fix identically (`/^[\p{L}\s.'-]+$/u`), not a re-derivation |
| Joining Date missing/invalid | `JOINING_DATE_INVALID` | "Enter a valid joining date." | |
| Department/Designation title blank | `TITLE_REQUIRED` | "Department/Designation name is required." | Legacy `department.js`/`designation.js` never validate this pre-write; `name: undefined` currently matches `findOne` against other undefined-name docs, producing false-negative dup checks |
| Employee/User ID fails required pattern | `VALIDATION_FAILED` | "Employee ID must contain numbers only." | Legacy Teacher's `teacherUserId` is `required + pattern(^\d{6}$)`; Staff's `empCode` is optional with no format rule today — v2's unified field should keep `empCode` optional but numeric-or-alphanumeric, a decision to confirm with product, not silently pick one |
| Education fails letters/dot/space pattern (teaching staff) | `VALIDATION_FAILED` | "Education can only contain letters, dots, and spaces." | |
| Malformed `TeacherPermission` payload (`type` missing/not an object) | `PERMISSION_PAYLOAD_INVALID` | "Permission data is missing or invalid." | Confirmed inside legacy `TeacherPermission`'s own `try` block — destructuring `req.body.type` with no guard currently throws into the generic 500, not a validation error |
| `ChangeStatus`'s `statusValue` not `0`/`1` | `VALIDATION_FAILED` | "Status value must be 1 (Active) or 0 (Inactive)." | Legacy treats *any* non-`1` value as `'Inactive'` silently — a typo'd payload deactivates a staff member with no error at all |

## Shape 2 — Uniqueness

| Case | Code | Message | Notes |
|---|---|---|---|
| Employee Code already used (when present) | `EMP_CODE_DUPLICATE` | "This employee code is already in use." | Optional field, unique only when present, scoped `(adminId, empCode)` — used to match bulk card-upload CSVs, so a silent duplicate here would misassign cards. Legacy `staff.js` checks this as a pre-check only (TOCTOU) on both Create and Update; legacy `teacher.js`'s equivalent (`teacherUserId`) has the same gap on Create only |
| Department name already exists | `DEPARTMENT_DUPLICATE` | "This department already exists." | Legacy checks this on Create only — **Update has zero dup check at all**, so a rename can silently collide with an existing department name |
| Designation title duplicate within the same Department | `DESIGNATION_DUPLICATE` | "This designation already exists in that department." | A standalone (no-department) designation's uniqueness is `(adminId, title)` with `departmentId: null`. Same Update gap as Department — legacy `designation.js`'s dup check exists only on Create |

## Shape 3 — Cross-field / business bound

| Case | Code | Message | Notes |
|---|---|---|---|
| Designation selected without a Department (on Manage Staff's form specifically) | `DESIGNATION_REQUIRES_DEPARTMENT` | "Pick a department before choosing a designation." | Legacy Staff form makes both `departmentId`/`designationId` hard-`required`, so this is enforced client-side today; the backend has no independent check — must be added, since a direct API call bypasses the form entirely |
| Referenced Department doesn't exist | `STAFF_DEPARTMENT_INVALID` | "Selected department does not exist." | Legacy `staff.js` never verifies `departmentId` resolves to a real (same-tenant) row before save |
| Referenced Designation doesn't exist | `STAFF_DESIGNATION_INVALID` | "Selected designation does not exist." | Same gap for `designationId` |
| Designation's parent Department doesn't exist | `DESIGNATION_DEPARTMENT_INVALID` | "Selected department does not exist." | Legacy `designation.js` never verifies `departmentId` against the Department collection |
| Card Verify Mode requires Fingerprint but no fingerprint enrolled on the device | `FINGERPRINT_NOT_ENROLLED` | "This verify mode needs a fingerprint on file — enroll one on the device first." | |
| Deactivating (not deleting) a Department that still has active Staff | `DEPARTMENT_DEACTIVATE_BLOCKED` (non-blocking warning acceptable) | "N active staff still belong to this department." | Legacy `UpdateDepartment` lets `status` flip to inactive with staff still referencing it, silently breaking any "active department" filter used elsewhere — new guard, not a legacy carryover |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| Department referenced by a Designation/Staff record no longer exists | `NOT_FOUND` | "The selected department no longer exists — refresh and try again." | |
| Editing a Staff/Department/Designation by an ID that doesn't exist, **or belonging to another school** | `NOT_FOUND` | "This record no longer exists." | Legacy `GetSingleStaff`/`UpdateStaff`/`DeleteStaff`, and the equivalent Department/Designation handlers, filter by bare `_id` only with **no `adminId` check at all** — any admin can read/edit/delete another school's record by guessing an ID. Same class of gap Student's `errors.md` found and fixed the same way: `findOne({_id, adminId})`, never bare `findById`, wrong-tenant reported identically to genuinely missing |
| AdminPlan missing for teacher-limited plan check | `ADMIN_PLAN_NOT_FOUND` | "No subscription plan found for this school." | Legacy returns a raw untyped 404 here — convert to the typed `NotFoundError` |

## Shape 6 — Cascade / in-use delete block

| Case | Code | Message | Notes |
|---|---|---|---|
| Delete Department in use by Staff or Designations | `DEPARTMENT_IN_USE` | "N staff/designation(s) use this department — reassign them first." | Type-to-confirm, per the shared confirm-overlay pattern. Legacy checks **neither** — the code comment only acknowledges the Designation-orphan risk, Staff referencing the department is an undocumented second gap. v2 must include both counts in the response payload so the frontend can offer a guided "reassign then delete" action |
| Delete Designation currently assigned to Staff | `DESIGNATION_IN_USE` | "N staff member(s) hold this designation." | Type-to-confirm. Legacy never checks this either — the code comment specifically admits payroll-slip generation reads a dangling `designationId` and silently renders a **blank title** rather than erroring, a payroll-document defect, not just an orphan reference |
| Delete Staff blocked — payroll history | `STAFF_IN_USE_PAYROLL` | "This staff member has payroll records and cannot be deleted. Deactivate instead." | Legacy `DeleteStaff` has **no check at all** against `SalaryStructure`/`Payroll` (both String FK, not `ObjectId` ref) — undocumented gap, on top of the one below that legacy at least comments on |
| Delete Staff blocked — biometric mapping | `STAFF_IN_USE_BIOMETRIC` | "This staff member has an active biometric device mapping and cannot be deleted. Unmap the device first." | Legacy comment acknowledges this dangling FK risk but does nothing about it |
| Delete Staff (teaching-staff path) blocked — leave/payroll/biometric | `TEACHER_IN_USE_LEAVE` / `_PAYROLL` / `_BIOMETRIC` | "This teacher has associated {leave records / payroll records / a biometric mapping} and cannot be deleted. Deactivate instead." | Legacy `DeleteTeacher` performs **no cascade check at all** — same class of gap as Staff, compounded by the login-record bug below |
| Delete Staff/Teacher, allowed with warning | (none — allowed) | "Deleting also removes login access and attendance history for this staff member." | Stated-consequence delete, transactional cascade — **see "Critical — confirmed auth bypass" below: for the teaching-staff path, this stated consequence is currently false** |

## Shape 8 — External-service failure

| Case | Code | Message |
|---|---|---|
| Biometric device unreachable during card assign/resync | `DEVICE_UNREACHABLE` | "Couldn't reach one or more devices — card saved, it will sync automatically when the device is back online." |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two admins create the same Employee/Teacher-User Code at once | `EMP_CODE_DUPLICATE` | (same as shape 2) | All four legacy files guard uniqueness with a `findOne` pre-check only — every one needs a real unique index (partial/sparse for `empCode` since optional) + Mongo `11000` catch converted to `ConflictError`, pre-check kept only as a fast-path message |
| Cross-tenant count leak in Teacher pagination | `TEACHER_COUNT_SCOPE_BUG` (internal, not user-facing) | n/a | `GetTeacherPagination`'s `TeacherModel.count()` has **zero `adminId` filter**, unlike the already-filtered list query directly above it in the same function — returns the total teacher count across *all* schools into one school's pagination response. Must become `countDocuments({adminId})` |

---

## Critical — confirmed auth bypass, must appear in the backend build, not be silently dropped

**`teacher.js`'s `DeleteTeacher` does not actually revoke the deleted teacher's login.** It calls
`TeacherUserModel.findByIdAndDelete({_id: id})` — passing an object as the positional id
argument builds an effective filter of `{_id: {_id: id}}` (cast failure/no match), **and**
`id` here is `TeacherModel`'s own `_id`, not `TeacherUserModel`'s (which links back via a
separate `teacherId` field) — so even a correctly-shaped filter would target the wrong
document. Net effect: the `Teacher` record itself is removed correctly (the row disappears
from the list, the admin sees a clean success toast), but the login credential document
survives untouched and stays fully authenticatable — **a terminated teacher can still log
in after being "deleted."**

Fix is two-part and both parts are required: query `TeacherUserModel` by `{teacherId: id}`
(never by `_id`), and use an actual filter-based delete (`deleteOne`/`findOneAndDelete`),
not a filter object passed where a positional id is expected. This must not be folded into
the generic "cascade before delete" fix above — it needs an explicit `RevokeTeacherLogin`
step, both because it is presently broken and because a delete's cascade should never be
the *only* place a login gets revoked (see Beyond-legacy note below).

---

## Backend controller requirements

- **Tenant isolation on every single-record lookup, across all four files.** `findOne({_id, adminId})`, never bare `findById`/`findByIdAndUpdate(id)`/`findByIdAndRemove(id)`. Confirmed missing on: `staff.js`'s `GetSingleStaff`/`UpdateStaff`/`DeleteStaff`; `department.js`'s equivalents; `designation.js`'s equivalents; `teacher.js`'s `UpdateTeacher`/`ChangeStatus`/`DeleteTeacher` (its `GetTeacherById` already does this correctly and is the pattern to copy). Wrong-tenant reads identically to missing, never a 403.
- **Every uniqueness check becomes a real unique index + `11000` catch**, not a pre-check-then-write — `empCode`/`teacherUserId` (partial/sparse, optional), Department name, Designation title (all four currently pre-check only, and Department/Designation don't even pre-check on Update).
- **Referenced-ID validation before save**, not after: `departmentId`/`designationId` on Staff, `departmentId` on Designation — none of the four legacy files verify a foreign key resolves to a real, same-tenant row before writing it.
- **Cascade checks on every delete, none of which exist today**: Department→Designation/Staff, Designation→Staff, Staff→Payroll/SalaryStructure/BiometricMapping, Teacher→LeaveRequest/Payroll/SalaryStructure/BiometricMapping. Every one of these six checks is presently absent, not partially implemented — the only two legacy even *comments* on (Department→Designation, Staff→Biometric) still do nothing. Response payload must carry the blocking counts so the frontend can build a "reassign then delete" flow, matching Academic Setup's precedent.
- **Soft delete (`status:'terminated'` + `terminatedAt`/`terminatedBy`) for the Staff collection, not a hard delete** — a Staff/Teacher row is referenced by Payroll, SalaryStructure, LeaveRequest, and BiometricMapping, all needed for historical payslip/attendance reporting after someone leaves. Exclude terminated staff from active lists/dup checks but keep them resolvable by ID for historic views. This directly supersedes legacy's hard `findByIdAndRemove`/`findByIdAndDelete` on both `staff.js` and `teacher.js`.
- **Login-credential revocation is its own explicit, auditable operation** (`RevokeTeacherLogin`), never an implicit side effect of record delete — directly motivated by the confirmed bug above. It must invalidate the login document/session/token, log `{staffId, revokedBy, revokedAt, reason}`, and be called explicitly by the offboard/delete flow rather than inlined, so a future refactor of delete logic cannot silently reintroduce the same class of bug.
- **Audit log on empCode/department/designation/title change** — these ripple into payroll categorization and payslip label text; log `{recordId, field, oldValue, newValue, changedBy, changedAt}` on every relevant update, and separately on every `TeacherPermission` change (controls access to marks/admissions/fees/promotion — sensitive enough to need who-changed-what-when).
- **Sanitize search input before building a `RegExp`** — all four files interpolate raw `searchText` into a regex with no escaping (ReDoS/invalid-pattern 500 risk), same issue flagged across every legacy controller reviewed this session.
- **Response envelope and deprecated-API cleanup** — replace every catch block's literal `'Internal Server Error!'` string with the shared typed-error middleware; replace `Model.count()` with `countDocuments()` throughout; standardize `success`/`message` on GET responses that currently return raw arrays.
- **`UpdateTeacher` must drop `adminId` from its updatable field set** — legacy silently accepts and rewrites `adminId` from the request body, letting a client reassign a teacher to a different school.
- **Teacher-limit message must interpolate the actual limit, not the current count** — legacy's "exceeded the X teacher limit" message currently shows `countTeacher` in place of `teacherLimit`, displaying the wrong number to the admin.

## Frontend component requirements

- **No dropdown/lookup fetch has an error callback anywhere in the module.** `StaffComponent.getDepartmentList()`/`getDesignationList()` and `DesignationComponent.getDepartmentList()` all `.subscribe((res) => {...})` with no error handler — a failed fetch leaves the Department/Designation dropdown silently empty with no distinguishable error state, same gap found in Academic Setup. `TeacherComponent.getClass()` has the identical gap for its permission-class dropdown data.
- **Teacher's Add/Edit and Delete flows have no double-submit guard at all**, unlike Staff/Department/Designation, all three of which already carry an `isClick` flag on their add/update/delete calls. `teacherAddUpdate()` and `teacherDelete()` gate only on `teacherForm.valid`/an id being present — a slow network lets a double-click fire two creates or two deletes. This inconsistency (present on 3 of 4 pages, absent on the 4th) should be closed by adding the same guard to Teacher, not treated as acceptable because most of the module already has it.
- **`TeacherComponent.getTeacher()` unconditionally indexes `res.teacherList[0]`** to seed every permission-class checkbox array (`this.selectedMarksheetPermissionClass = [...res.teacherList[0].marksheetPermission.classes]`, repeated for all nine permission types). If a search or an empty page returns zero rows, `res.teacherList[0]` is `undefined` and this throws, crashing the whole page load — not a hypothetical, it's the direct result of the existing empty-state gap below combined with this indexing pattern. Seeding permission checkboxes from the first row of a paginated list is itself the wrong approach (a bulk "set permissions for N teachers" action, if wanted, needs its own explicit UI) — v2 must not port this pattern, empty-result or not.
- **No empty-state vs error-state distinction on any of the four tables** (Staff, Teacher, Department, Designation) — all four use `*ngIf="list && list.length > 0"` with no `else` branch, so a genuine fetch failure and "no records yet" render identically as a blank table body. Same gap as Academic Setup and Student.
- **Delete confirmation across all four pages is a single click with no dependent-count preview and no type-to-confirm** — matches the backend's complete absence of cascade checks above: since the backend never returns a blocking count today, the frontend has nothing to show even if it wanted to. Both must land together — planning spec requires typing `DELETE` and showing the real blocking count (staff/designations affected, payroll/biometric records, etc.) fetched with the list, not discovered only after the delete attempt fails.
- **Delete Teacher's re-fetch masks the confirmed auth-bypass bug entirely, with zero client-side signal.** `teacherDelete(id)` calls the delete endpoint, then `successDone()` → `closeModal()` → `getTeacher({page: this.page})`, which re-lists from `TeacherModel` — the collection legacy's `DeleteTeacher` *does* correctly remove from. So the row disappears, a plain success toast fires, and the admin sees a completely normal, successful delete. Nothing in the frontend re-checks login/credential state, calls any "is this person's login still active" endpoint, or shows any distinct confirmation for the login-revocation step — there is no code path, today, that could even notice the surviving `TeacherUserModel` document. v2 must not just fix the backend delete: the delete-confirmation UI should show login revocation as its own explicit, separately-confirmed line item (matching the new `RevokeTeacherLogin` operation above) rather than an invisible assumed side effect, so a future regression in that step is visibly different from "student is gone from the list."
- **No bulk selection/action on Department or Designation tables** — no checkbox column, no multi-row delete; Manage Staff has bulk-only for card assignment (CSV), not for staff records themselves. New build, no legacy precedent for record-level bulk actions on any of the three.
- **Manage Staff's Department→Designation dependent-dropdown filters client-side against an already-fetched full Designation list** (`filterDesignationsByDepartment`) rather than re-fetching per department — correct given the module's bounded per-school size (confirmed via `manage-staff.md`'s own scale note), but relies on `getDesignationList()` having succeeded first; the missing error callback above means a failed initial fetch leaves this filter silently operating on an empty array with no indication why the Designation dropdown looks empty after picking a Department.
- **Legacy Teacher and Staff forms have almost no field overlap** (`teacherForm`: name/teacherUserId/education; `staffForm`: name/departmentId/designationId/joiningDate/status/empCode) — the v2 unified Staff form must reconcile both sets as one schema with role-conditional fields, not silently drop Teacher's education/permission fields or Staff's department/designation fields when merging, and the two id-like fields (`teacherUserId` vs `empCode`) need one resolved identity, not two parallel unique fields on the same merged record.

---

**Structure and depth follow the Academic Setup / Student modules' format** (`academic-setup/errors.md`, `student/errors.md`).
