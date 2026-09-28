# Academic Setup — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
legacy `class.js`/`class-subject.js`/`subject.js` controllers and the
already-built v2 controllers (`classes-sections`/`subject-groups`/
`subjects.controller.js`), cross-checked against the legacy Angular
components (`class`/`class-subject`/`subject`). Academic Setup has no
field-heavy form like Student's admission form — its real complexity is
cascade guards, uniqueness scoping, and stream/section shape rules — so
this file stays organized by the 9 shapes rather than a field table,
with one short case-table per shape actually used.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Class name blank/not a recognized value | `CLASS_NAME_REQUIRED` | "Class name is required." | `.dd` selection, not free text |
| `UpdateClass`'s `sections[]`/`streams[]` not arrays, a stream/section entry has no name, or a name repeats within the same class | `VALIDATION_FAILED` | "Streams must each have a name." / "Sections must be a list of names." / "Section names must be unique within a class." | Legacy `UpdateClass` writes these straight through with zero shape check — must be re-added in v2, not assumed from the create path |
| Subject name blank | `SUBJECT_NAME_REQUIRED` | "Subject name is required." | |
| Subject `type`/`status` not a recognized enum value | `VALIDATION_FAILED` | "Type must be Core or Elective." / "Status must be Active or Inactive." | Must be an app-level check, not left to a raw Mongoose enum error falling into a generic 500 |
| Subject Group name blank | `SUBJECT_GROUP_NAME_REQUIRED` | "Group name is required." | |
| Subject Group has zero subjects selected | `SUBJECT_GROUP_EMPTY` | "Select at least one subject for this group." | v2 controller currently short-circuits and allows an empty `subjectIds:[]` to save silently — must become a hard block |
| Same subject selected twice in a group's payload | `VALIDATION_FAILED` | "The same subject was selected twice." | No dedupe today on `subjectIds` |

## Shape 2 — Uniqueness

| Case | Code | Message | Notes |
|---|---|---|---|
| Class already exists for this school | `CLASS_DUPLICATE` | "This class already exists." | Unique `(adminId, class)` |
| Subject name already exists | `SUBJECT_DUPLICATE` | "A subject with this name already exists." | Unique `(adminId, name)`, case/accent-insensitive collation, **and** trim whitespace before the check — collation alone doesn't catch `"Hindi "` vs `"Hindi"` |
| Subject Group name duplicate within same Class+Stream | `SUBJECT_GROUP_DUPLICATE` | "A group with this name already exists for this class/stream." | Unique `(adminId, classId, streamId, name)`, `streamId: null` treated as one valid index value for non-streamed classes |

## Shape 3 — Cross-field / business bound

| Case | Code | Message | Notes |
|---|---|---|---|
| `hasStreams:true` submitted with a flat `sections[]` (not `streams[]`) or vice versa | `CLASS_STRUCTURE_MISMATCH` | "Choose either streams or plain sections, not both." | Schema forbids both being present at once |
| `streamId` required but missing, or supplied for a class with `hasStreams:false`, or doesn't belong to the given class | `STREAM_REQUIRED` / `STREAM_NOT_ALLOWED` / `VALIDATION_FAILED` | "Select a stream for this class." / "This class doesn't have streams — leave this blank." / "That stream doesn't belong to the selected class." | v2's `resolveClassAndStream` already does this correctly; legacy has **no such concept at all** (see Frontend section) |
| Editing a Class from streamed→non-streamed while Subject Groups reference its streams | `CLASS_STREAM_REMOVAL_BLOCKED` | "N subject group(s) use this class's streams — remove or reassign them first." | See shape 6 |
| Removing one specific stream/section from `UpdateClass` while students are placed in it | `STREAM_IN_USE` / `SECTION_IN_USE` | "N student(s) are placed in the {name} stream/section — move them before removing it." | `UpdateClass` replaces `streams`/`sections` wholesale; only whole-class delete is guarded today, not a partial removal via edit |
| Selected subject resolves but is `status:'inactive'` | `SUBJECT_INACTIVE` (non-blocking) | "N of the selected subjects are inactive." | Informational `warnings[]`, not a save-blocker — an inactive subject already picked stays valid |

## Shape 4 — Dependency / not found

| Case | Code | Message |
|---|---|---|
| Subject Group references a subject ID that doesn't exist / was deleted | `SUBJECT_NOT_FOUND` | "One of the selected subjects no longer exists — refresh and try again." |
| Editing a Class/Subject/Group by an ID that doesn't exist, **or belonging to another school** | `NOT_FOUND` | "This record no longer exists." |
| Bulk edit/delete where some requested IDs don't resolve | `NOT_FOUND` | "N of M {classes/subjects/groups} could not be found." | Name the count, not a generic singular message |

Wrong-tenant is always reported identically to genuinely missing — never a 403 (that would confirm the record exists elsewhere).

## Shape 6 — Cascade / in-use delete block

| Case | Code | Message | Notes |
|---|---|---|---|
| Delete Class while students/enrollments reference it | `CLASS_HAS_STUDENTS` | "N student(s) are enrolled in this class — cannot delete." | Checks `StudentEnrollment`, gated behind `confirmed:true` |
| Delete Class/Stream while Subject Groups, Fee Structure, Marksheet Structure, or Admit Card Structure reference it | `CLASS_IN_USE` | "This class is used by N other setup(s) (fee structure, subject groups, ...) — remove those first." | Named-consequence warning, not a bare block. **v2's own `DeleteClass`/`BulkDeleteClasses` currently only counts `StudentModel` — Subject Groups referencing the class are never counted, a real gap to close, not just a legacy one.** |
| Delete Subject while a Subject Group or Marksheet Structure references it | `SUBJECT_IN_USE` | "This subject is used in N subject group(s)/marksheet structure(s)." | v2 already implements this correctly and `$pull`s the subject out of affected groups on delete |
| Delete Subject Group while it's the selected group for any active `StudentEnrollment` | `SUBJECT_GROUP_IN_USE` | "N student(s) are placed in this group." | **v2's `BulkDeleteSubjectGroups` has no cascade check at all today** — the mirror gap of Subject's own (correctly guarded) delete; this must be added, not assumed already covered because Subject's delete looks similar |
| A subject's deletion `$pull`s it out of every group, leaving one with `subjectIds:[]` | (non-blocking) | "This group now has no subjects." | Surface as `warnings[]` on the bulk-delete response — the delete already happened, a hard error here is pointless |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two admins create the same Class/Subject/Group name simultaneously | `CLASS_DUPLICATE` / `SUBJECT_DUPLICATE` / `SUBJECT_GROUP_DUPLICATE` | (same as shape 2) | **All three of v2's real controllers still guard uniqueness with a `findOne` pre-check only** — every one needs a real unique index + Mongo `11000` catch converted to `ConflictError`, the pre-check kept only as a fast-path message, never as the actual guard |

---

## Backend controller requirements

- **Tenant isolation on every single-record lookup** — `findOne({_id, adminId})`, never bare `findById`. Legacy `class-subject.js`/`subject.js` update/delete take only `req.params.id` with no `adminId` check at all today — a guessed `_id` lets School A edit/delete School B's row; this must not carry into v2 (v2's controllers already do this correctly for Subjects/Classes/Groups — confirm Subject Groups' update path matches).
- **Legacy `class.js` is a GLOBAL, non-tenant-scoped collection** shared across every school — its cascade guard (when added) must count usage across all schools, not one; flag its write endpoints (`Create/Update/DeleteClass`) for retirement once v2's per-tenant `AcademicClassModel` and `STANDARD_CLASSES` dropdown fallback are confirmed to cover every existing tenant.
- **Every uniqueness check becomes a real unique index + `11000` catch**, not a pre-check-then-write (listed per-case above, not repeated).
- **Bulk delete/update always runs one grouped query** (`countDocuments`/`$in`) across the full ID set, never a per-row loop — v2 already does this for Classes and Subjects; Subject Groups' bulk delete must match once its cascade check is added.
- **Class-number reuse**: deleting and recreating a class value (e.g. "10") gets a new `_id`, but any collection keyed by the class *number* rather than the ObjectId (legacy attendance/exam-result rows) silently reattaches to the new class. Recommend `CLASS_NUMBER_REUSE_BLOCKED` — refuse or explicitly warn on recreating a previously-deleted class number until confirmed safe.
- **No transaction requirement beyond single-document writes** for this module — unlike Student, nothing here spans multiple collections in one user action except the cascade-guard reads (which are read-only counts, not writes), so no multi-collection transaction is needed; the one exception is a Subject bulk-delete's `$pull`-from-groups + delete, which must be one transaction (already true in v2, confirm it stays that way).

## Frontend component requirements

- **The legacy Subject Group form has no concept of stream-required/not-allowed at all.** `chooseClass()` hardcodes `cls < 11` / `cls == 11 || 12` to decide whether to show a stream picker or force `"n/a"` — it never reads a class's actual `hasStreams` flag. v2's rebuild must drive this off the real per-class data (`STREAM_REQUIRED`/`STREAM_NOT_ALLOWED` above), not a hardcoded class-number ladder that breaks the moment a school configures streams on an unexpected class.
- **Editing a Subject Group never pre-populates its subject checklist.** `updateClassSubjectModel()` patches the form's `class`/`stream`/`name` fields but never seeds `selectedSubjectGroup` from the group's existing `subject[]` — the checklist opens fully unchecked. Worse, the **Update** submit path never reassigns `subject` from the checklist at all (only the **Create** branch does `form.value.subject = this.selectedSubjectGroup`), so even if a user re-checks subjects, an edit would silently save the group's original subject list unchanged. This is currently masked because the edit (pencil) icon is commented out of the legacy HTML — Subject Groups only support delete today — but the bug must be fixed as part of the v2 rebuild, not silently ported as "edit isn't reachable so it doesn't matter."
- **No dropdown/lookup fetch has an error callback anywhere in the module.** `getClass()`, `getSubject()` (both class-subject and subject-group contexts) call `.subscribe((res) => {...})` with no error handler — a failed fetch leaves the Class/Subject dropdown silently empty with no distinguishable error state, and Subject Groups' own spec requires its subject checklist to always reflect the live Subjects list, which a swallowed error silently breaks.
- **No double-submit guard on any of the three pages' Add/Edit forms** — submit is gated only by `formGroup.valid`, never an in-flight `isClick`/loading flag, so a slow network lets a double-click fire two creates. Needs both the client-side guard and the backend `Idempotency-Key` pattern already specified for Student, applied here too since none of Academic Setup's three pages have it (Student had it on at least some pages; Academic Setup has it on none).
- **Classes & Sections' Class dropdown is a hardcoded static array** (`allClasses()` returns a literal `[{class:200}...{class:12}]`), never fetched from the backend — matches the legacy global-model gap above; v2 must source this from the real API, not port the hardcoded list.
- **No empty-state vs error-state distinction on any of the three tables** — all three use `*ngIf="list && list.length > 0"` with no `else` branch, so a genuine fetch failure and "no records yet" render identically (a blank table body), same gap Student had.
- **No bulk selection/action anywhere in the legacy module** — no checkbox column, no multi-row delete, matching this module's own planning spec (`classes-sections.md`/`subjects.md` both call for checkbox + "Delete Selected"). This is a new build with no legacy precedent, not a port; bulk delete's per-row outcome should mirror the `rows[]`/per-item shape used elsewhere, never one pass/fail toast for the whole selection.
- **Delete confirmation across all three pages is a single "Ok" click with no dependent-count preview and no type-to-confirm** — the planning spec requires typing `DELETE` and showing the real blocking count (students enrolled, subject groups referencing a class, etc.) fetched with the list, not discovered only after the delete attempt fails.

---

**Structure and depth follow the Student module's format** (`student/errors.md`).
