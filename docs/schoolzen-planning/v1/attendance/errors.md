# Attendance — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
`attendance.js`/`biometric-mapping.js`/`shift.js`/`class-shift.js`/`roster.js`
controllers (this module was built fresh, not ported from a legacy PHP/jQuery
predecessor, so there is no "legacy vs v2" split here — every gap below is a
gap in the current build), cross-checked against the Angular
`attendance`/`roster`/`shift` components (`live-attendance` is an empty,
unbuilt directory — nothing to review there). Attendance is dominated by
cascade/dependency and concurrency shapes rather than form fields, so this
stays organized by the 9 shapes, one case-table per shape actually used —
same precedent as Academic Setup and Staff.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

**Scope note**: `attendance.js`/roster/shift are already a relatively mature
build (typed queue handling, lazy requires, a real `GetQueueHealth` 503, a
correct `isOverridden` manual-override guard) — most gaps below are
concentrated in `biometric-mapping.js` and the two single-record CRUD files
(`shift.js`, `class-shift.js`), not in the sync pipeline itself.

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Shift name/start/end blank | `SHIFT_NAME_REQUIRED` | "Name, start time and end time are required." | Already checked in `CreateShift`/`UpdateShift` |
| Start time not before End time | `SHIFT_TIME_RANGE_INVALID` | "Start time must be before end time." | **Missing today** — `shift.js` never compares `startTime`/`endTime` at all; a shift with `end` before `start` saves silently and every reconciliation against it computes nonsense |
| A minutes-field (grace/early/late/half-day) negative or non-numeric | `SHIFT_MINUTES_INVALID` | "{Field} must be a number of minutes, 0 or more." | Already implemented correctly in `validateShiftNumbers` — required vs optional split is right and reused identically by Create/Update |
| `CreateManualAttendance`'s `status` not one of the six recognized values | `STATUS_INVALID` | "Status must be Present, Late, HalfDay, Absent, Leave, or Holiday." | **Missing today** — the enum is enforced only client-side (`statusOptions`); a direct API call writes any string into `DailyAttendance.status`, and every status-keyed count/aggregation downstream (day summary, live board stats) silently drops that row from every bucket |
| `CreateManualAttendance`'s `status:'HalfDay'` submitted for a student | `HALFDAY_NOT_APPLICABLE` | "Half Day does not apply to students." | Frontend already filters this out of `availableStatusOptions()` for the student tab, but the backend has no matching guard — a crafted request can still write it |
| `AssignCard`/`ResyncPerson`'s `verifyMode` not in the device's valid range | `VERIFY_MODE_INVALID` | "Select a valid verify mode." | Both handlers do `Number(verifyMode)` with no range check — an out-of-range value reaches WDMS as-is and fails opaquely on the terminal instead of here |

## Shape 2 — Uniqueness

| Case | Code | Message | Notes |
|---|---|---|---|
| Shift name already exists for this school | `SHIFT_DUPLICATE` | "A shift with this name already exists." | `(adminId, name)`; both Create and Update pre-check correctly today, but only as a `findOne` — no unique index backs it (see Shape 9) |
| Person already has a biometric mapping | `MAPPING_ALREADY_EXISTS` | "This person already has a biometric mapping." | `(adminId, personType, personId)` |
| WDMS employee code already mapped to another person | `EMP_CODE_DUPLICATE` | "This WDMS employee code is already mapped to another person." | Dead code path in practice — `AssignCard` always derives `wdmsEmpCode` from `personId`, which is already unique, but `CreateBiometricMapping` still accepts an arbitrary `wdmsEmpCode` from the body and re-checks it |
| Card number already mapped to another person | `CARD_DUPLICATE` | "This card number is already mapped to another person." | `(adminId, cardNo)` — three separate `findOne` pre-checks run sequentially in `CreateBiometricMapping`, none backed by a unique index (Shape 9) |

## Shape 3 — Cross-field / business bound

| Case | Code | Message | Notes |
|---|---|---|---|
| `CreateManualAttendance`'s `outTime` before `inTime` | `MANUAL_TIME_RANGE_INVALID` | "Out time cannot be before in time." | Already implemented correctly |
| Half Day After / Early Out / Late Out supplied for a shift with no staff-only fields shown (student-only context) | `SHIFT_FIELD_NOT_APPLICABLE` | "This field only applies to staff shifts." | UI already hides these correctly for a student-only shift; kept as a backend backstop since `shift.js` accepts them unconditionally today |
| Bulk roster assign/clear with `fromDate` after `toDate` | `DATE_RANGE_INVALID` | "The start date must be before the end date." | `eachDateInRange` is never shown validating order — an inverted range degrades to "no matching days," a confusing message for what is actually a swapped-fields mistake |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| `CreateRoster`/`DeleteRoster`/`BulkAssignRoster` given a `shiftId` that doesn't exist or belongs to another school | `SHIFT_NOT_FOUND` | "The selected shift no longer exists — refresh and try again." | **Real gap, not a legacy carryover** — none of the four roster-write handlers verify `shiftId` resolves to a real, same-tenant `Shift` before writing it into `days.{date}`. `class-shift.js`'s `BulkAssignClassShift` gets this right (`ShiftModel.findOne({_id, adminId})` before writing) two files over — roster needs the identical check, not a new pattern |
| Editing a Shift/BiometricMapping by an ID that doesn't exist, **or belonging to another school** | `NOT_FOUND` | "This record no longer exists." | See "Tenant isolation" below — currently indistinguishable from a 200-with-null or a generic 500, not a clean 404 |
| Assign Card / Resync for a `personId` that doesn't resolve in the given `personType`'s collection | `PERSON_NOT_FOUND` | "This person could not be found." | `resolvePersonName` silently returns `''` for a missing person instead of failing — a mapping gets created for a person that does not exist, and the WDMS payload ships an employee with a blank name |

Wrong-tenant is always reported identically to genuinely missing — never a 403 (that would confirm the record exists elsewhere).

## Shape 6 — Cascade / in-use delete block

| Case | Code | Message | Notes |
|---|---|---|---|
| Delete Shift currently assigned via Roster or ClassShift | `SHIFT_IN_USE` | "This shift is assigned to N people/classes — reassign them first." | Already implemented in `DeleteShift`, checking both `RosterModel` and `ClassShiftModel` — genuinely correct today, better than most other modules' delete guards reviewed this project. Gap: the response is a bare string, not a count, so the frontend cannot show "N people" as the message above promises — the count must be added to the response payload, not just the check |
| Delete a ClassShift mapping while students are still active in that class | (none — allowed with warning) | "Unassigning removes this class's shift baseline — attendance already recorded is unaffected, but nothing decides the expected shift until reassigned." | Matches `roster.md`'s stated Delete Selected warning; `DeleteClassShift` already re-enqueues today's reconcile so the consequence is real, not just described |
| Delete a BiometricMapping for a person with an active WDMS `wdmsId` | `MAPPING_HAS_DEVICE_LINK` (non-blocking warning) | "This removes the card from local records; the device keeps the old entry until the next resync." | `DeleteBiometricMapping` deletes the local row only — nothing tells WDMS to drop the employee, so a removed person's card can keep opening doors/punching in until an unrelated resync overwrites it. Should at minimum warn, ideally also push a delete/deactivate to WDMS |

## Shape 7 — Bulk-operation row-level

| Case | Code | Message | Notes |
|---|---|---|---|
| `BulkAssignCard` CSV — row's code doesn't resolve to a real person, or code/card number blank | `BULK_ROWS_FAILED` | "N of M rows could not be imported." | Already implemented correctly — every row's outcome is collected into `failed[]`, never a single fail-the-batch |
| `BulkAssignCard` — local mapping saved successfully but the WDMS push for that row failed | (none today — silently reported as success) | "N card(s) saved locally; M could not be pushed to the device yet — they'll sync automatically." | **Real gap.** WDMS writes in the bulk path are fired without `await` and their failures only reach `console.error` — `successCount`/`failed[]` reflect the LOCAL save only, so an admin sees "200 succeeded" on a CSV where WDMS registration silently failed for some rows, with no way to know which ones without checking server logs |
| `BulkAssignRoster`/`BulkClearRoster` given a `personId` not found in `personIds`, or belonging to another school | `BULK_ROWS_FAILED` | "N of M selected people could not be updated." | **Missing today** — both bulk handlers build `bulkWrite` ops from the raw `personIds` array with zero existence/tenant check; a stale or cross-tenant id just silently upserts a new Roster document for an id that resolves to nothing displayable, rather than failing that row |

## Shape 8 — External-service failure (WDMS/device integration — the largest surface in this module)

| Case | Code | Message | Notes |
|---|---|---|---|
| WDMS employee create/update fails (device offline, bad payload, network) | `DEVICE_UNREACHABLE` | "Card saved — it will sync automatically when the device is back online." | Already correctly isolated in `syncPersonToWdms`: the local `BiometricMapping` write always succeeds first and independently; only `wdmsSyncFailed` flips for the frontend's toast, matching this catalog's Shape-8 rule of never rolling back a local write for a best-effort integration failure |
| `createWdmsEmployee` succeeds but the immediately-following `findByIdAndUpdate` (caching `wdmsId`) throws | (silent today — no error, no retry) | — | **A genuinely easy-to-miss gap**: `syncPersonToWdms`'s `try` wraps the WDMS calls, but a failure persisting `wdmsId` back onto the mapping is swallowed by the same catch and reported as `wdmsSyncFailed: true` even though WDMS actually now HAS the employee. The next assign/resync for that person calls `createWdmsEmployee` again (since `mapping.wdmsId` is still unset) — creating a **second, duplicate employee record in WDMS for the same person**, not just retrying the first. This is the most surprising sync-integrity gap in the module: the bug is not "sync failed," it's "sync succeeded, bookkeeping failed, and the fix for that makes it worse." |
| Sync Now while a sync job for this school/day is already active | `SYNC_ALREADY_RUNNING` | "A sync is already running for this day!" | Already implemented correctly in `SyncSchoolNow`, checked via the real BullMQ job state, not a Mongo flag |
| Duplicate/re-delivered punch from a device retry | (silently deduped, not an error) | — | Unique `punchHash` index absorbs it at the `PunchLog` insert — confirmed in `attendance-overview.md`'s own description, never surfaced as a user-facing failure |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two admins create the same Shift name, or the same BiometricMapping (personMapping/empCode/cardNo), at once | `SHIFT_DUPLICATE` / `MAPPING_ALREADY_EXISTS` / `EMP_CODE_DUPLICATE` / `CARD_DUPLICATE` | (same as Shapes 1–2) | All four uniqueness checks across `shift.js` and `biometric-mapping.js` are `findOne` pre-checks only, none backed by a real unique index + `11000` catch — every one races exactly like the same class of bug already flagged in Staff/Academic Setup |
| Two sales users run **Assign Device to School** on the same terminal at once | `DEVICE_ALREADY_ASSIGNED` | "This device was just assigned to another school." | **New finding, not a repeat of the tenant-isolation theme above.** `devices/device.js`'s `AssignDeviceToSchool` reads `findOne({_id, assignedSchoolId:null})` and mutates+`.save()`s the same in-memory document — this LOOKS like an atomic guard (it mirrors the file's own comment: "assignedSchoolId:null guard makes this atomic") but a plain read-then-save is not atomic against a second concurrent request reading the same null state before the first one's save commits. The fix is a single `findOneAndUpdate({_id, assignedSchoolId:null}, {$set:{...}})` — atomic at the database level — not two `findOne`+`.save()` calls that only look equivalent. `ActivateDevice`/`BlockDevice` share the identical pattern for their status transitions, lower stakes but the same fix |
| Two reconcile jobs for the same school/date, from a roster edit and a class-shift edit landing in the same window | (deduped, not an error) | — | Both `roster.js` and `class-shift.js` enqueue through the same `addReconcileJob`, whose `jobId` is `reconcile-<adminId>-<dateKey>` — BullMQ drops the second enqueue, so this is already correct by construction, not something to add |

---

## Schema-level data-modeling notes (added by data-modeling review, cross-checked against `_core/database-design-principles.md`)

- **`roster.md` says "No new model — reads/writes `shiftId` on `Staff` or on `StudentEnrollment`," but this file's own case tables assume a dedicated `Roster` collection** (a per-person `days.{date}` map written by `CreateRoster`/`BulkAssignRoster`, checked by `DeleteShift`'s `RosterModel` cascade guard) **and a separate `ClassShift` collection** (`ClassShiftModel`, `DeleteClassShift`, `BulkAssignClassShift`). These two descriptions of the same data cannot both be right — `roster.md`'s schema note needs correcting to describe the real `Roster`/`ClassShift` collections (each presumably keyed `(adminId, personType, personId)` / `(adminId, classId, ...)` with a per-date map), not a flat `shiftId` field on `Staff`/`StudentEnrollment`.
- **`AttendanceRecord` has no documented `deletedAt`** despite `database-design-principles.md` naming Attendance explicitly in the soft-delete list (financial/historical records). `attendance-overview.md`'s schema line should carry this field even though no delete flow for `AttendanceRecord` is described yet in this module — the principle is decided at the collection-design stage, not deferred until a delete endpoint is built.
- **`PunchLog`'s only documented index is the dedup hash (`punchHash`), a single-field index with no `adminId`-first compound index for tenant-scoped reads** (e.g. `GetPunchLog`/`getDayPunches`, referenced in the Frontend requirements below). Per the multi-tenancy rule, a query-serving index here should be `(adminId, personId, date)` (or similar) alongside the unique `punchHash` index used purely for write-dedup — the two indexes serve different purposes and neither substitutes for the other.

---

## Backend controller requirements

- **Tenant isolation on every single-record lookup in `shift.js` and `biometric-mapping.js`.** `GetSingleShift`, `UpdateShift`, `DeleteShift`, `GetSingleBiometricMapping`, `UpdateBiometricMapping`, `DeleteBiometricMapping` all resolve by bare `_id` with no `adminId` filter at all — every one of these six handlers lets any authenticated admin read, edit, or delete another school's shift or biometric mapping by guessing/enumerating an id. `class-shift.js`'s `BulkAssignClassShift` (`ShiftModel.findOne({_id, adminId})`) is the correct pattern already present in this same module — copy it, don't re-derive it.
- **Every uniqueness check becomes a real unique index + `11000` catch, not a pre-check-then-write** — Shift name `(adminId, name)`, BiometricMapping's three separate checks `(adminId, personType, personId)` / `(adminId, wdmsEmpCode)` / `(adminId, cardNo)`, each currently a bare `findOne`.
- **Validate `shiftId` before writing it into a Roster row** — `CreateRoster`, `DeleteRoster` (for the person-scope check), `BulkAssignRoster`, `BulkClearRoster` — the same same-tenant existence check `class-shift.js` already does correctly for `BulkAssignClassShift`, not a new concept for this module.
- **WDMS employee creation and its `wdmsId` cache-back must be one atomic unit, with a repair path if the cache-back fails** — today a `wdmsId`-persist failure after a successful WDMS create silently guarantees the next sync creates a duplicate employee (see Shape 8's critical finding). At minimum, log this distinctly from an ordinary sync failure so it can be reconciled, and consider a lookup-by-`wdmsEmpCode` fallback before ever calling create.
- **`AssignDeviceToSchool`/`ActivateDevice`/`BlockDevice` must use a single atomic `findOneAndUpdate` with the guard condition in the filter**, not `findOne` followed by a separate `.save()` — the current shape is a race despite the code's own comment asserting it is atomic.
- **`BulkAssignCard`'s WDMS writes need their failures surfaced in the response**, not just `console.error`'d — either await them with a bounded concurrency and fold failures into the existing `failed[]` array (reusing the row-level shape already used for missing-person rows), or add a separate `wdmsFailedCount` so a CSV import's toast can say "200 saved, 6 not yet pushed to devices" instead of a flat success count.
- **`CreateManualAttendance`'s `status` needs a server-side enum check** (and the HalfDay/student combination blocked) — currently enforced only by the frontend `<select>`, matching the same class of gap (client-only enum enforcement) flagged in Academic Setup's Subject `type`/`status` fields.
- **Shift's `startTime`/`endTime` need an actual before/after check**, not just a presence check — an inverted shift silently corrupts every reconciliation computed against it.
- **Response envelope cleanup** — replace literal `'Internal Server Error!'` strings across all five files with the shared typed-error middleware; `shift.js`'s `countShift`/`GetShiftPagination` still call the deprecated `Model.count()` (already flagged as a repeated pattern in Staff/Academic Setup, restating only because this module has two more instances of it, not because it's a new class of issue).
- **Sanitize `searchText` before building a `RegExp`** in `GetShiftPagination` — same unescaped-interpolation ReDoS/500 risk flagged in every other module's pagination search reviewed this project.

## Frontend component requirements

- **`AttendanceComponent`, `RosterComponent`, and `ShiftComponent` are already solidly built** — every lookup (`getClassOptions`, `getShiftList`, `getPersonList`, `getClassShiftList`) has an error callback, every write path (manual save/remove, sync now, cell assign/clear, bulk assign/clear, shift add/update/delete) is gated by an `isClick`-style guard, and empty vs. error states are distinguished on the roster/shift lists. This module should be the template other pages are brought up to, not the other way around.
- **Roster's bulk "Delete Selected" (`bulkClear`) has no type-to-confirm and no dependent-count preview**, even though `roster.md`'s own spec calls for typing `DELETE` and warning that attendance history is unaffected but the expected shift is unset going forward — the component clears immediately once the form validates. This must land before ship since the backend already supports it structurally (the warning text exists in the spec, just not wired to a confirm step).
- **`RosterComponent.selectAllPersons()` selects every person in `personInfo` with no active/status filter** — if `getStaffList`/`getTeacherList` return inactive or terminated people (their own modules' spec should exclude them, but nothing here re-checks), "Select All" then "Assign to Selected" would roster a shift for someone no longer employed.
- **No visible loading/error state per row during a bulk assign/clear** — `bulkAssign()`/`bulkClear()` show one guard flag (`bulkIsClick`) for the whole modal, which is correct for the current all-or-nothing `bulkWrite` semantics, but once the backend gains row-level `BULK_ROWS_FAILED` reporting (see above), the modal needs a results view per the bulk row-level pattern (a list, not a single toast), not just a pass/fail count in the toast text.
- **Assign Card / Resync's `verifyMode` select has no client-side range validation either** — matches the backend gap above; both should be fixed together so an out-of-range value never leaves the browser.
- **`GetPunchLog`'s consumer (`getDayPunches`) swallows its error into an empty list with no distinguishable "couldn't load" state** — a genuine fetch failure and "no punches that day" render identically in the day modal, the one place in this otherwise well-guarded module with that gap.

---

**Structure and depth follow the Academic Setup / Staff modules' format** (`academic-setup/errors.md`, `staff/errors.md`).
