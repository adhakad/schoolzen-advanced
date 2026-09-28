# Examination — Admit Card Structure — Errors & Validation (DRAFT, for review only — not added to the package yet)

Status: **REVIEW ONLY** — a second worked example, deliberately picked
because this page's real error surface is almost nothing like
Student's. Student is a big single form (field-format-heavy). This
page is small (one name field + a schedule table) but its risk is
almost entirely in TIMING, SCOPE, and CASCADING SIDE-EFFECTS on
background-generated documents — a different shape of "what can go
wrong" that a generic template would have missed entirely.

## Shape 1 — Field-level (small surface here, unlike Student)

| Case | Code | Message |
|---|---|---|
| Exam Name blank | `EXAM_NAME_REQUIRED` | "Exam name is required." |
| Exam Name over 60 characters (it prints on the admit card header) | `EXAM_NAME_TOO_LONG` | "Exam name can't be more than 60 characters." |
| A subject row has no date | `SUBJECT_DATE_REQUIRED` | "Set a date for every subject." |
| A subject row has no time | `SUBJECT_TIME_REQUIRED` | "Set a time for every subject." |

## Shape 3 — Cross-field / business bound (this is where the REAL complexity lives)

| Case | Code | Message | Notes |
|---|---|---|---|
| Same subject listed twice in one exam's schedule | `SUBJECT_SCHEDULED_TWICE` | "This subject is scheduled twice — remove the duplicate row." | Simple data-entry catch, easy to miss |
| Two subjects of the SAME exam scheduled at the same date+time | `SUBJECT_TIME_CLASH` | "Two subjects can't be scheduled at the same time within one exam." | A student can't sit two papers at once — hard block, not a warning |
| Exam date falls before the active `AcademicSession.startDate` or after `endDate` | `EXAM_DATE_OUTSIDE_SESSION` | "This date falls outside the current academic session." | Cross-module read against `AcademicSession` |
| Exam date falls on an existing `Holiday` for this school | `EXAM_ON_HOLIDAY` | "This date is marked as a holiday — students may not be able to attend." | **Warning, not a block** — some schools intentionally hold supplementary exams on a declared holiday; the admin can proceed after acknowledging |
| Exam date is already in the past (creating a NEW structure, not editing a historical one) | `EXAM_DATE_IN_PAST` | "This date has already passed." | Warning, not a block — a genuinely late/corrective entry is a real use case |
| Scope (Class+Stream+Group+Section) resolves to zero currently-enrolled students | `EXAM_SCOPE_EMPTY` | "No students currently match this scope — check your selection." | Prevents silently creating a structure that generates nothing, which otherwise looks like a successful save with no visible outcome |
| A different, already-existing Admit Card Structure has overlapping scope AND an overlapping subject+date+time (i.e., the SAME student would need two different admit cards for the same slot) | `CROSS_STRUCTURE_TIME_CLASH` | "N student(s) already have another exam scheduled at this time (see '<other exam name>')." | The harder version of `SUBJECT_TIME_CLASH` — across structures, not just within one; requires checking the union of affected students, not just the scope definition, since two different scopes can still overlap in actual enrolled students |

## Shape 4 — Dependency / not found

| Case | Code | Message |
|---|---|---|
| A subject in the schedule was removed from the Class's Subject Group after this structure was created | `SUBJECT_NO_LONGER_IN_GROUP` | "N subject(s) in this schedule are no longer part of this class's subject group." | **Open design question, not silently decided**: does the structure keep the stale subject (historically accurate — matches what was actually printed) or auto-drop it (matches current curriculum)? Recommend: keep it, surface this as a visible warning banner on the structure's edit view, let the admin decide — never silently mutate a structure nobody touched. |

## Shape 5/6 — State-transition + cascade (the page's real hazard: edits/deletes trigger a BACKGROUND JOB against live generated documents)

| Case | Code | Message | Notes |
|---|---|---|---|
| Save (create) with a non-empty scope | (not an error — explicit consequence) | "This will generate admit cards for N student(s)." | Confirm-first, per design system |
| Save (edit) on a structure that already has generated cards | (not an error — explicit consequence) | "Saving will regenerate admit cards for N student(s) — already-downloaded/printed copies won't reflect this change." | The "won't reflect already-printed copies" clause is the real content here — a school needs to know reprinting is on them, not automatic |
| Delete on a structure with generated cards | (not an error — explicit consequence) | "This will remove the generated admit cards for N student(s)." | |
| Delete attempted while that structure's OWN generation job is still running | `GENERATION_IN_PROGRESS` | "This exam's admit cards are still being generated — please wait before deleting." | Hard block, not a warning — deleting mid-job risks orphaned `AdmitCard` documents pointing at a structure that no longer exists |
| Edit attempted while that structure's OWN generation job is still running | `GENERATION_IN_PROGRESS` | "This exam's admit cards are still being generated — please wait before editing." | Same reasoning |

## Shape 7 — Bulk/background-job row-level (this page's generation IS a bulk job, even though the form itself isn't a bulk form)

| Case | Code | Message | Notes |
|---|---|---|---|
| Generation job completes with some students failing (corrupt/missing subject reference, print-template render error for that one student's data) | `GENERATION_PARTIAL_FAILURE` | "Admit cards generated for N of M students — N2 failed, see details." | The SAME `rows[]` shape as a bulk form-import failure, just reported against a background job's result instead of a synchronous response — one student's bad data must never fail the whole batch or silently produce a blank card |
| Generation job crashes/restarts partway (worker died, DB blip) | `GENERATION_INCOMPLETE` | "Generation was interrupted — N of M completed. Resume?" | Requires the job to be RESUMABLE/idempotent (track a `generatedFor: [studentId]` set on the structure or job record so a retry doesn't re-generate — and doesn't skip — anyone), not a blind restart-from-zero, and not silently left half-done with no visible status |
| Double-click Save fires two generation jobs for the same structure | (deduped, not surfaced as an error) | — | `jobId` derived from `(adminId, structureId, structure.updatedAt)` — BullMQ drops the second identical enqueue, per the same dedup pattern used elsewhere in the app |

## Shape 8 — External-service / infrastructure failure

| Case | Code | Message |
|---|---|---|
| Job queue itself unreachable when Save tries to enqueue generation (Redis down) | `QUEUE_UNAVAILABLE` | "Couldn't start generation right now — please try saving again in a moment." |
| Shared print/PDF template throws for a specific student (missing required data this template assumes exists) | `DOCUMENT_RENDER_FAILED` | "Couldn't generate the admit card for N student(s) — see details." | Same code Examination's other pages would use for the same underlying template failure — reused, not reinvented per page |

## Shape 9 — Concurrency

| Case | Code | Message | Notes |
|---|---|---|---|
| Two admins edit the same structure at once | `STRUCTURE_CHANGED` | "This structure was changed by someone else — please review before saving." | Optimistic lock (`updatedAt`/version check) — this MATTERS more here than on a typical form, because a stale save doesn't just overwrite a field, it can trigger a regeneration job against data the second admin never saw |
| Two admins create structures with overlapping scope+subject+time at once (the cross-structure clash above, but racing) | `CROSS_STRUCTURE_TIME_CLASH` | (same as shape 3) | Second writer's check re-reads at write time, not from a stale page-load |

---

## Why this looks nothing like Student's file, on purpose

Student's risk is almost entirely **input correctness** (many fields,
each needing a format/uniqueness rule) — Admit Card Structure has only
5 real input fields but its risk is **time/scope logic and background-
job lifecycle** (a small form that triggers an asynchronous, resumable,
partially-failable operation against potentially thousands of
generated documents). A generic "field/uniqueness/cascade" template
would have produced a nearly-empty, unhelpful file for this page —
finding ITS real error surface required thinking about what this
SPECIFIC page actually does (schedule + trigger generation), not
running the same checklist shape against every page.

This is the case for reviewing page-by-page rather than mass-producing
13 module files from one mental template — each page's real complexity
lives in a different place, and only reading that page's own `.md` +
`.html` closely (the way this file and Student's both did) surfaces it.
