# Student — Manage Students

Status: **FINAL**
Reference: `manage-students.html`

Shows ALL students by default (no mandatory class gate) — Class/Stream/Group/Section are optional narrowing filters, except Excel Import/Export which requires a chosen class(+stream) scope.

---

## Frontend

**Toolbar**: row1 (search + button group: Delete Selected / Assign Card to Selected / Excel Import-Export / Create) — Delete/Assign buttons disabled until rows are checked, Excel button disabled until a Class filter is picked. row2: Class → Stream (existence: only for 11/12) → Group (options depend on Class+Stream) → Section, all `.dd`, dependency-disabled until a Class is chosen.

**Table**: checkbox, Photo (gradient-avatar initials), Admission No., Student, Class (tag "8th · A"), Father, Mother, Roll No., Contact, Card (masked "•• 8821" or "Not assigned" muted), Action (view, assign/change card, resync, edit, delete icons).

**View Profile modal**: read-only, grouped sections (Academic Info / Personal Info / Parents Info) each a label+value grid — this is a profile display, not a form.

**Assign Card modal**: single-student or bulk (checkbox selection) — Card Number input (or a list for bulk) + Verify Mode `.dd` (Card only / Card + Fingerprint). Submitting pushes straight to biometric devices — no separate resync step needed after a fresh assign.

**Resync** (single icon button per row): re-pushes that person's existing card+fingerprint to every device — for when a device was offline or reset, not a first-time assignment.

**Excel Import/Export modal**: explicitly scoped to whichever Class(+Stream) is currently filtered — states the scope in the modal itself, Export downloads current scope, Import uploads a sheet to add/update within that same scope.

**Delete**: type-to-confirm, warning explicitly lists cascade impact (login access, fee records, admit cards, results).

## Backend

Schema — `Student`: full profile fields (admission no., name, DOB, gender, category, religion, nationality, aadhar, address, parents' info, income, contact, photo URL, card number, biometric verify mode) + a reference to current class/stream/section (via `StudentEnrollment`, session-scoped — a student's class placement changes across sessions via Class Promotion, so it does not live as a flat field on `Student` itself).

- Card assignment/resync endpoints push to the biometric device layer (async job — see `additional-technical-considerations.md`'s job-queue note — a device push should never block the HTTP request).
- Excel import/export endpoints require `classId` (+`streamId`) as mandatory query params — reject with a `ValidationError` if missing, since this is the one place in this page where a scope is truly required.
- Delete: cascades to related collections (fee records, admit cards, results, login) inside a transaction — never a partial delete leaving orphaned records if one step fails.

**Scale note — this is the single largest list in the app (~2M students target)**:
- Compound index `(adminId, classId, streamId, groupId, sectionId)` backs this page's own cascade filter combination directly — the list query is never a full collection scan then in-memory filter.
- List endpoint uses **keyset/cursor pagination** (`adminId, _id`, per `performance-principles.md`), never `.skip(N)` — this page is explicitly named there as needing it.
- List query is `.lean()` + `.select()` on only the columns the table renders (photo, admissionNo, name, class tag, father, mother, roll, contact, card status) — never the full profile document (20+ fields) just to paint 10 columns.
- **Excel Import is queued (BullMQ)**, per `additional-technical-considerations.md`'s job-queue list — validating + writing hundreds of rows synchronously inside the HTTP request is exactly the case that doc calls out; the endpoint enqueues and returns immediately, the modal polls/gets notified on completion. Import rows are validated and written via the FieldConfig-driven shared validator (see `settings/admission-form-fields.md`) in one batched `bulkWrite`, never row-by-row `.save()`.
