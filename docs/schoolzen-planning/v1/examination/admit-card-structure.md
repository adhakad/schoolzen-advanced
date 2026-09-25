# Examination — Admit Card Structure

Status: **FINAL**
Reference: `admit-card-structure.html`

Every configured exam across all classes — an exam plus each subject's date & time. Unlike Marksheet Structure, this is a list of CREATED structures (search/filter over what exists), not an always-shown-per-class grid.

---

## Frontend

**Toolbar**: search + Create (row1), Class → Stream → Group → Section cascade filters (row2).

**Table**: Exam Name (+ "N subjects scheduled" sub-line), Class, Stream ("N/A" if not applicable), Section ("All sections" if scoped to the whole class), Action (view, edit, delete).

**Create/Edit modal**: Class → Stream (disabled/"N/A" unless streamed) → Stream Group → Section (both disabled until Class chosen; both optional, scoping the structure narrower) → Exam Name → a subject-wise schedule table (one row per subject in that class, each with a date+timing field) that only populates once a Class is chosen ("Choose a Class above to load its subjects" placeholder beforehand).

**Delete/Edit consequence** (stated directly in the side panel, not hidden): creating a structure auto-generates admit cards for every matching student immediately; editing regenerates them; deleting removes them. To reconfigure an exam, delete the existing structure first rather than expecting an in-place partial edit to reconcile already-generated cards.

## Backend

Schema — `AdmitCardStructure`: `adminId`, `classId`, `streamId` (nullable), `groupId` (nullable), `sectionId` (nullable), `examName`, `subjects:[{subjectId, examDate, timing}]`. On create/update, **generation is a BullMQ background job, never synchronous inside the request** — matching a scoped class/section can mean hundreds of students, and generating one `AdmitCard` per student is a batched `insertMany`/`bulkWrite` inside that job, never a per-student loop of `.save()` calls. The API responds "generating," the UI polls or is notified on completion (per `additional-technical-considerations.md`'s job-queue pattern). On delete, removal of generated cards is likewise one `deleteMany`, not a per-document loop. This structure feeds Generate Admit Card directly — that page has no configuration of its own, only this one does.
