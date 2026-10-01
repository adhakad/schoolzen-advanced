# Student — Manage Students

Status: **FINAL**
Reference: `manage-students.html`

Shows ALL students by default (no mandatory class gate) — Class/Stream/Group/Section are optional narrowing filters, except Excel Import/Export which requires a chosen class(+stream) scope.

---

## Frontend

**Toolbar**: row1 (search + button group: Delete Selected / Assign Card to Selected / Excel Import-Export / Create) — Delete/Assign buttons disabled until rows are checked, Excel button disabled until a Class filter is picked. row2: Class → Stream (existence: only for 11/12) → Group (options depend on Class+Stream) → Section, all `.dd`, dependency-disabled until a Class is chosen.

**Table**: checkbox, Photo (gradient-avatar initials, or the uploaded photo once set — see below), Admission No., Student, Class (tag "8th · A"), Father, Mother, Roll No., Contact, Card (masked "•• 8821" by default, toggled from the column header — see below — or "Not assigned" muted), Action (view, assign/change card, resync, edit, delete icons).

**Student photo is uploadable directly from the Photo cell, not only from a form**: clicking the avatar circle in any table row opens the file picker and uploads/replaces that student's photo immediately (no separate save step) — same click-the-circle-to-upload interaction is also available on the avatar shown inside the Admission/Edit form. Both paths hit the same upload endpoint and update the same `photoUrl` field, so either one is always in sync with the other.

**Card number masking is a single header-level toggle, not a per-row reveal icon.** A small icon in the Card column's header (not the eye icon — that's already used for Aadhar/Bank/PEN reveal in View Profile, and a per-row eye here would be redundant since a card number isn't the same class of regulated sensitive data) switches the **entire column** between masked ("•• 8821") and full, for all rows at once — the same "toggle every row together from one header control" interaction as the "Aa" text-case control below, just with its own distinct icon. Default state on page load is masked. No `ActivityLog` entry for this toggle — purely a display-consistency choice, not a masking-law one.

**Per-column text-case + sort (header-integrated, no extra column)**: **sort applies to Admission No., Roll No., and Student** — each keeps its existing sort-direction arrow, click the column label to toggle Ascending ↔ Descending. **Father and Mother have no sort and no header "Aa" trigger of their own** — plain header text only. The **"Aa" text-case toggle lives only on the Student column header** (Admission No./Roll No. are numeric and have no "case"; Class is a tag, not free text).
- On Student, the sort arrow and the "Aa" trigger sit side by side in the same header cell; on Admission No./Roll No., only the sort arrow.
- Clicking "Aa" opens a tiny dropdown: **Title Case** (default) / **UPPERCASE** / **lowercase**, plus an **"Apply to all fields" row** at the bottom — picking a case option alone re-cases only the Student column; picking "Apply to all fields" re-cases **every text field in the row** (Student, Father, Mother) to the chosen case in one action, even though Father/Mother have no toggle of their own.
- This is a **display-only transform on the frontend** — it never touches the stored value, never triggers a save/API call, and is not part of any export/import format. Default state on page load is Title Case.
- No extra table column is added for this control — it lives inside the Student header cell, the same way the sort arrow already does.

**View Profile modal**: read-only, grouped sections (Academic Info / Personal Info / Parents Info) each a label+value grid — this is a profile display, not a form. Personal Info's Aadhar/Bank A/C/Bank IFSC/PEN rows show masked by default, each with its own small reveal-toggle icon (`bi-eye`/`bi-eye-slash`) next to the value — see `errors.md`'s masking section for the exact behavior and audit-logging rule.

**Assign Card modal**: single-student or bulk (checkbox selection) — Card Number input (or a list for bulk) + Verify Mode `.dd` (Card only / Card + Fingerprint). Submitting pushes straight to biometric devices — no separate resync step needed after a fresh assign.

**Resync** (single icon button per row): re-pushes that person's existing card+fingerprint to every device — for when a device was offline or reset, not a first-time assignment.

**Excel Import/Export modal**: explicitly scoped to whichever Class(+Stream) is currently filtered — states the scope in the modal itself, Export downloads current scope, Import uploads a sheet to add/update within that same scope. Import's file picker never auto-uploads on selection: choosing a file only shows the file's name in the modal (with a way to pick a different file again before submitting, which replaces the shown name); an explicit "Import" button is what actually starts the upload+processing. This avoids a wrong-file mistake going through silently before the user notices.

**Export offers a "Masked" / "Full (sensitive data)" choice** (radio or toggle in the Export panel, "Masked" selected by default) — Masked truncates Aadhar/Bank A/C/IFSC/PEN (last-4 only, per `errors.md`'s masking note); Full exports the real values, for the occasional bulk-correction round trip (edit in Excel, re-Import). No password/extra gate on Full for now — any user with Export access on this page can pick either option, but choosing "Full" is logged to `ActivityLog` (who, when, which class/stream scope) per `additional-technical-considerations.md`'s Audit Log section — Masked exports are routine and aren't logged, only Full is.

**Delete**: type-to-confirm, warning explicitly lists cascade impact (login access, fee records, admit cards, results).

## Backend

Schema — `Student`: full profile fields (admission no., name, DOB, gender, category, religion, nationality, aadhar, address, parents' info, income, contact, photo URL, card number, biometric verify mode) + a reference to current class/stream/section (via `StudentEnrollment`, session-scoped — a student's class placement changes across sessions via Class Promotion, so it does not live as a flat field on `Student` itself).

- Card assignment/resync endpoints push to the biometric device layer (async job — see `additional-technical-considerations.md`'s job-queue note — a device push should never block the HTTP request).
- Excel import/export endpoints require `classId` (+`streamId`) as mandatory query params — reject with a `ValidationError` if missing, since this is the one place in this page where a scope is truly required.
- Delete: cascades to related collections (fee records, admit cards, results, login) inside a transaction — never a partial delete leaving orphaned records if one step fails.

**Confirmed real bug — Class/Stream/Group/Section filters don't actually filter.** With no filter selected, the full list shows correctly (per this page's own "shows ALL by default" rule). But choosing a Class (e.g. "1st") returns an empty list instead of that class's students — and Group/Section filters have the same problem. Root cause is almost certainly the query builder not actually adding the selected filter's condition to the backend query (e.g. sending `classId` but the controller reading from the wrong param name, or building the Mongo filter object but never merging the class/stream/group/section conditions into it). Fix: for every combination of these four filters (any one alone, or several together), the returned list must be non-empty whenever matching students exist, and empty only when none genuinely match that combination — test each filter individually and in combination, not just "the endpoint accepts the param."

**Scale note — this is the single largest list in the app (~2M students target)**:
- Compound index `(adminId, classId, streamId, groupId, sectionId)` backs this page's own cascade filter combination directly — the list query is never a full collection scan then in-memory filter.
- List endpoint uses **keyset/cursor pagination** (`adminId, _id`, per `performance-principles.md`), never `.skip(N)` — this page is explicitly named there as needing it.
- List query is `.lean()` + `.select()` on only the columns the table renders (photo, admissionNo, name, class tag, father, mother, roll, contact, card status) — never the full profile document (20+ fields) just to paint 10 columns.
- **Excel Import is queued (BullMQ)**, per `additional-technical-considerations.md`'s job-queue list — validating + writing hundreds of rows synchronously inside the HTTP request is exactly the case that doc calls out; the endpoint enqueues and returns immediately, the modal polls/gets notified on completion. Import rows are validated and written via the FieldConfig-driven shared validator (see `settings/admission-form-fields.md`) in one batched `bulkWrite`, never row-by-row `.save()`.
