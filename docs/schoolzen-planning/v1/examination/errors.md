# Examination — Errors & Validation (page-wise, frontend + backend)

Status: **FINAL** — rewritten from a line-by-line deep dive of the real
legacy `exam-result.js`/`exam-result-structure.js`/`admit-card.js`/
`admit-card-structure.js`/`id-card.js` controllers, cross-checked against
the legacy Angular components (`admin-student-marksheet`/`-result-add`/
`-structure`/`-structure-edit`, `admin-student-admit-card`/`-structure`,
`admin-id-card`). Covers all 4 pages (Marksheet Structure, Generate
Marksheet, Admit Card Structure, Generate Admit Card). This module's real
risk, like the DRAFT review of Admit Card Structure already flagged, is
almost entirely in TIMING/SCOPE and CASCADING SIDE-EFFECTS on background-
generated documents, not input formatting — organized by the 9 shapes,
one case-table per shape actually used, same precedent as Payroll/Staff/
Leave. The DRAFT's Shape 3 schedule-clash cases (`SUBJECT_TIME_CLASH`,
`EXAM_DATE_OUTSIDE_SESSION`, `EXAM_ON_HOLIDAY`, `EXAM_SCOPE_EMPTY`,
`CROSS_STRUCTURE_TIME_CLASH`) are folded in below — genuinely useful and
not superseded by anything the controller deep-dive found.
Depends on: `_core/error-catalog-conventions.md` (shape numbers below refer to it)

## Shape 1 — Field-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Marksheet Structure: Theory/Practical Max blank, non-numeric, or 0 | `MARKS_MAX_INVALID` | "Enter a valid maximum for this subject." | Legacy's structure-edit form hardcodes `Validators.max(100)` on every max-marks input — blocks a school whose board scores a subject out of more than 100 (e.g. 150); v2 must not carry this hardcoded ceiling forward |
| Admit Card Structure: Exam Name blank | `EXAM_NAME_REQUIRED` | "Exam name is required." | Legacy checks this server-side (`CreateAdmitCardStructure`/`UpdateAdmitCardStructure`) — correct, keep |
| Admit Card Structure: a subject's date/start time/end time missing | `EXAM_SCHEDULE_INCOMPLETE` | "Set a date and time for every subject in this exam." | Legacy's `examDateInvalid`/`startTimeInvalid`/`endTimeInvalid` checks are real and correctly block on `null`/`''`/`'NaN/NaN/NaN'` — keep this shape of check |
| Admit Card Structure: a subject's start time equals or is after its end time | `EXAM_TIME_ORDER_INVALID` | "Start time must be before end time." | Frontend-only today (`admitcardAddUpdate`'s `toMins` comparison) — no equivalent backend check; must be re-added server-side, not trusted client-only |
| Enter Marks: a score entered without a matching subject in this class's structure | `MARKS_SUBJECT_MISMATCH` | "This subject isn't part of this class's marksheet structure." | |

## Shape 2 — Uniqueness

| Case | Code | Message | Notes |
|---|---|---|---|
| Admit Card Structure already exists for this Class+Stream | `EXAM_STRUCTURE_DUPLICATE` | "An admit card structure already exists for this class." | **Legacy allows only ONE structure per Class+Stream, full stop — not per Exam Name.** `CreateAdmitCardStructure` blocks a second create outright (`checkAdmitCardStrExist`); there is no concept of scheduling more than one exam (Quarterly, Half-Yearly, Final…) at once for the same class in this legacy code, unlike the page-1 planning doc's per-Exam-Name+Group+Section scope model. v2's Group/Section-scoped, per-Exam-Name design in `admit-card-structure.md` is the intentional fix for this legacy limitation — flagged here so it isn't mistaken for an untouched legacy behavior to preserve |
| Re-submitting Enter Marks for a term that already has a result saved | (silently overwrites — not blocked) | — | `CreateExamResult`'s duplicate-detection only blocks when a THIRD term is attempted (`examTypeExist.length > 2`) or the exact same 2-term set repeats; re-saving the only existing term update the record in place with no "this already has a result, overwrite?" confirmation and still returns "created successfully." v2 needs an explicit `MARKS_ALREADY_ENTERED` confirm-first flow (shape 5), not this silent overwrite path |

## Shape 3 — Cross-field / business bound

| Case | Code | Message | Notes |
|---|---|---|---|
| Entered Theory/Practical score exceeds that subject's configured max | `MARKS_EXCEED_MAX` | "Score can't exceed the maximum (X) for this subject." | Frontend's `createMarksGroup` already derives `Validators.max()` per-subject from the live structure (`getMaxMarksFromList`) — correct, dynamic-follows-structure pattern, not hardcoded; server-side re-validation is still required since this is client-only today |
| Entered score is negative or non-numeric | `MARKS_NEGATIVE` | "Score can't be negative." | Frontend blocks via `Validators.pattern('^[0-9]+$')` (digits only) — no equivalent exists on the backend (`CreateExamResult` writes `resultDetail` straight from the body) |
| Generate Marksheet/Admit Card attempted for a class with no structure configured | `STRUCTURE_NOT_CONFIGURED` | "Set up the marksheet/admit card structure for this class first." | |
| Same subject scheduled twice in one Admit Card Structure | `SUBJECT_SCHEDULED_TWICE` | "This subject is scheduled twice — remove the duplicate row." | Not checked anywhere in legacy `admit-card-structure.js` today |
| Two subjects of the SAME exam scheduled at the same date+time | `SUBJECT_TIME_CLASH` | "Two subjects can't be scheduled at the same time within one exam." | A student can't sit two papers at once — hard block |
| Exam date falls outside the active `AcademicSession` | `EXAM_DATE_OUTSIDE_SESSION` | "This date falls outside the current academic session." | Cross-module read; not checked in legacy at all |
| Exam date falls on a declared `Holiday` | `EXAM_ON_HOLIDAY` | "This date is marked as a holiday — students may not be able to attend." | Warning, not a block — supplementary exams intentionally use holidays sometimes |
| Scope resolves to zero currently-enrolled students | `EXAM_SCOPE_EMPTY` | "No students currently match this scope — check your selection." | Legacy's `CreateAdmitCardStructure` does correctly check `checkStudent` and blocks with "No student was found" — keep this, just rename to the shared code |

## Shape 4 — Dependency / not found

| Case | Code | Message | Notes |
|---|---|---|---|
| Marksheet Structure references a Subject that was deleted | `SUBJECT_NOT_FOUND` | "One of this structure's subjects no longer exists." | |
| Preview/print requested for a student with no `AdmitCard`/marksheet record generated | `RECORD_NOT_GENERATED` | "This hasn't been generated yet for this student." | |
| Marksheet Template ID assigned that no longer exists | `TEMPLATE_NOT_FOUND` | "The selected template no longer exists." | |
| View/Edit/Delete an Admit Card Structure or Marksheet Template by an ID that doesn't exist, or belongs to another school | `NOT_FOUND` | "This record no longer exists." | Wrong-tenant reported identically to genuinely missing — see Critical tenant-isolation note below, which this module fails today |

## Shape 5/6 — State-transition + cascade (this module's largest surface — edits/deletes trigger changes against LIVE generated documents)

| Case | Code | Message | Notes |
|---|---|---|---|
| Editing an Admit Card Structure that already has generated cards | (not blocked — explicit consequence) | "Saving will regenerate admit cards for N student(s) — already-downloaded/printed copies won't reflect this change." | Confirm-first, per design system. **Legacy does NOT actually regenerate per-student data on edit** — see the Critical retroactive-change note below; this is the gap the confirm-first copy must not paper over |
| Deleting an Admit Card Structure that has generated cards | (not blocked — explicit consequence) | "This will remove the generated admit cards for every matching student." | `DeleteAdmitCardStructure` correctly cascades the delete (`AdmitCardModel.deleteMany` before removing the structure) — keep this ordering, but see the tenant-isolation gap in the same function below |
| Deleting a Marksheet Template/Structure that has generated results | (not blocked — explicit consequence) | "This will remove the generated marksheets for every matching student." | `DeleteResultStructure` matches this pattern correctly (`ExamResultModel.deleteMany` alongside the template delete) |
| Reassigning a Marksheet Template already used by other classes | `TEMPLATE_REASSIGN_WARNING` | "This template is used by N other class(es) — they'll be affected too." | Warning, not a block |
| Re-submitting Enter Marks for a term with an existing saved result | `MARKS_ALREADY_ENTERED` (confirm, not silent) | "This term's result already exists — save anyway to overwrite it?" | See Shape 2 — today's silent overwrite must become an explicit confirm |

## Shape 7 — Bulk-operation row-level

| Case | Code | Message | Notes |
|---|---|---|---|
| Bulk Enter Marks — one or more cells in the grid exceed their subject's max or are non-numeric | `MARKS_ROW_INVALID` | "N student row(s) have invalid marks — see highlighted cells." | Rendered inline in the grid itself, not a separate results panel |
| Creating an Admit Card Structure for a large class — per-student `AdmitCard` insert fails partway | `GENERATION_PARTIAL_FAILURE` | "Admit cards generated for N of M students — N2 failed, see details." | **Confirmed gap, not hypothetical**: `CreateAdmitCardStructure` builds `studentAdmitCardData` and calls `AdmitCardModel.create(array)` in one shot with no batching/session/try-per-item — Mongoose's array `create()` is `ordered:true` by default, so a single bad row (e.g. a duplicate-key or validation failure on one student) aborts the rest of the batch, the whole call throws into the generic catch, returns a bare 500, and the `AdmitCardStructure` document has ALREADY been created and saved by that point — leaving a structure that exists with an incomplete or zero set of generated cards and no visible error surfaced to the admin beyond "Internal Server Error!" |
| "Print Selected" scoped to a large class/section — some students have no generated card/marksheet yet | `PRINT_SELECTION_INCOMPLETE` | "N of the selected students don't have a generated document yet — they were skipped." | |

## Shape 8 — External-service failure

| Case | Code | Message |
|---|---|---|
| Bulk PDF generation job fails partway (large class/section print) | `DOCUMENT_GENERATION_FAILED` | "Couldn't generate documents for N student(s) — try again for just those." |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two staff edit the same Admit Card Structure/Marksheet Structure at once | `STRUCTURE_CHANGED` | "This structure was changed by someone else — please review before saving." | Optimistic check (`updatedAt`/version) before allowing a save that triggers regeneration on stale data — legacy has no such check at all (`UpdateAdmitCardStructure` is a plain `findOneAndUpdate` with `upsert:true` and no version condition) |
| Two admins create structures with overlapping scope+subject+time at once | `CROSS_STRUCTURE_TIME_CLASH` | (same as Shape 3) | Second writer's check must re-read at write time, not from a stale page load |

---

## Critical — confirmed backend bug, must be fixed, not silently ported

**`exam-result.js` references an undefined `examResultStructure` variable — a guaranteed `ReferenceError` on every call.** In both `GetSingleStudentExamResult` (the schoolId/admissionNo/rollNumber lookup path) and `GetSingleStudentExamResultById`, once a matching `student` and `examResult` are found, the code reads `let resultPublishStatus = examResultStructure.resultPublishStatus;` — but `examResultStructure` is never declared, fetched, or imported anywhere in this file. This throws immediately, is caught by the surrounding `try/catch`, and always returns a bare `500 Internal Server Error!` instead of the actual result. **Both of this module's student/parent-facing "view my result" endpoints are completely broken** whenever a result actually exists to view — the happy path never completes. `admit-card.js`'s equivalent function (`GetSingleStudentAdmitCard`) does this correctly by comparison — it properly queries `AdmitCardStructureModel` into a real `admitCardStructure` variable before reading `.admitCardPublishStatus` off it — confirming this is a copy-paste error specific to `exam-result.js`, not a shared pattern to preserve. Fix: query `MarksheetTemplateModel`/whatever holds the v2 publish-status flag into a real variable before reading it, mirroring `admit-card.js`'s already-correct implementation.

## Critical — confirmed retroactive-change gap, must appear in the backend build

**Editing an Admit Card Structure's schedule changes what already-generated, already-printed admit cards display, because the schedule is never snapshotted onto the per-student `AdmitCard` document.** `AdmitCardModel` stores only `adminId, studentId, class, stream, examType` — no `examDate`/`examStartTime`/`examEndTime` of its own. Every read path (`GetSingleStudentAdmitCard`, the Generate Admit Card page) fetches the schedule live from `AdmitCardStructureModel` at render time. `UpdateAdmitCardStructure` writes the new schedule onto that same structure document with no version/cascade step. The result: a school that corrects a subject's exam time AFTER cards have been printed will find every already-printed card silently shows the new time the next time it's re-rendered — exactly the outcome the task's own grounding note and the DRAFT's Shape 5/6 section both call out as something structure changes must NOT do. v2 must snapshot the resolved schedule onto each generated document at generation time (the same principle Payroll's `errors.md` establishes for salary snapshots) so an edit only affects the next generation, never a document already handed to a family.

## Critical — confirmed tenant-isolation gaps, must appear in the backend build

- **`GetSingleStudentExamResultById` and `GetSingleStudentAdmitCardById` both resolve the student via `StudentModel.findOne({_id: studentId})` with no `adminId` filter at all** — a guessed/enumerated student `_id` from School A returns that student's exam result or admit card (name, marks, schedule) to a caller at School B.
- **`DeleteAdmitCardStructure` reads the structure via bare `findOne({_id: id})`** before cascading the delete — a guessed structure id from another school can have its admit cards and structure deleted outright, with no ownership check anywhere in the function.
- **`GetSingleClassAdmitCardStructure` finds by `{adminId}` alone with no additional scope**, which is correct in isolation, but its sibling `GetSingleClassAdmitCardStructureByStream` and every single-record read above must all move to the same `{_id, adminId}` pattern Payroll/Academic Setup's catalogs already established as the fix — wrong-tenant always reported identically to genuinely missing, never a distinct 403.

---

## Backend controller requirements

- **Fix the `examResultStructure` `ReferenceError`** in both `GetSingleStudentExamResult` and `GetSingleStudentExamResultById` — see Critical section above. This is the single highest-priority fix in this module; the feature is not merely buggy, it does not work at all today.
- **Snapshot the resolved exam schedule onto each generated `AdmitCard`/marksheet document at generation time**, not read live from the structure — see the Critical retroactive-change note. Apply the same snapshot principle to marksheet generation (`ExamResultModel` already snapshots `resultDetail` correctly at save time — keep that; extend the same discipline to admit cards, which currently do not).
- **Tenant isolation on every single-record lookup by bare `_id`** — `GetSingleStudentExamResultById`, `GetSingleStudentAdmitCardById`, `DeleteAdmitCardStructure`, `DeleteResultStructure` (also reads by bare `_id` before its correct-otherwise cascade). Move all to `findOne({_id, adminId})`.
- **Bulk per-student document creation must not be one unbatched `Model.create(array)` call** — `CreateAdmitCardStructure`'s `studentAdmitCardData` insert needs `ordered:false` at minimum (so one bad row doesn't block the rest) and ideally a resumable/idempotent job matching the DRAFT's `GENERATION_PARTIAL_FAILURE`/`GENERATION_INCOMPLETE` shapes, ahead of the structure document itself being considered "successfully created."
- **Field-level validation server-side for marks entry, currently client-only**: negative/non-numeric scores and per-subject max are enforced only by Angular `Validators` in `admin-student-marksheet-result-add`; `CreateExamResult` accepts `resultDetail` from the body with no numeric/range check at all.
- **`CreateExamResult`'s create-vs-update duplicate logic needs a real `MARKS_ALREADY_ENTERED` guard** instead of silently overwriting a term's result when only that one term already exists — see Shape 2/5.
- **`UpdateAdmitCardStructure` needs a real optimistic-concurrency check** (`updatedAt`/version filter on the write) before it triggers a schedule change that (once the snapshot fix above lands) would otherwise regenerate documents against stale data — currently a plain `findOneAndUpdate` with `upsert:true` and no condition.
- **Response envelope cleanup**: every catch block across all five files returns a raw string or `{errorMsg}` shape inconsistently (`'Internal Server Error!'`, `'Internal Server Error !'` with an extra space, bare string vs object) — standardize on the shared typed-error middleware, matching every other module's cleanup note.

## Frontend component requirements

- **`admin-student-marksheet-structure-edit` has no double-submit guard on its Save action** (`subjectPermissionAdd()`), unlike this module's other three mutating pages (Admit Card Structure, Marksheet Structure list, Enter Marks all correctly carry an `isClick` flag with reset-on-error/success). This is the one page in the module that needs the guard added, not a module-wide gap.
- **Enter Marks' max-marks validation correctly follows the live Marksheet Structure dynamically** (`getMaxMarksFromList` reads the real per-subject max, not a hardcoded 100) — reference implementation for "entry form follows structure," must not regress to a hardcoded bound in v2.
- **Marksheet Structure's own max-marks input is hardcoded to `Validators.max(100)`**, unlike Enter Marks' dynamic bound — blocks configuring a subject scored out of more than 100; see Shape 1.
- **No empty-state vs error-state distinction** on the Admit Card Structure list, Marksheet Structure list, or Generate Admit Card/Marksheet tables — same class of gap as every other module reviewed this session.
- **Admit Card Structure's edit flow silently assumes the class's subject list hasn't changed since the structure was created** — `editAdmitCardStructureModel` patches the form directly from the stored `examDate`/`examStartTime`/`examEndTime` arrays without reconciling against the class's current Subject Group, so a subject removed from the group after the structure was made still shows (and re-submits) here with no warning, mirroring the DRAFT's `SUBJECT_NO_LONGER_IN_GROUP` open question.
- **Bulk print's "One/Two Students per Page" choice pattern (illustrated option cards) is already correctly shared** between Generate Admit Card and Generate Marksheet's print flows — reference implementation, do not diverge per page.

---

**Structure and depth follow the Payroll / Academic Setup modules' format** (`payroll/errors.md`, `academic-setup/errors.md`); the schedule/cascade-risk framing follows the reviewed `admit-card-structure-errors-DRAFT.md`, whose genuinely new content (Shape 3 clash/scope cases) is folded in above rather than left to go unused.
