# Fix: Student module — comprehensive round 4 (post student-fix1/2/3)

This is a consolidated fix — read `student-fix1.md`, `student-fix2.md`,
`student-fix3.md`, and the current `v1/student/errors.md` in full before
touching code. **First confirm fix1/fix2/fix3 are actually fully applied**
(session format, toolbar layout, `.dp` date picker, button width rule,
checkbox styling, tenant isolation, uniqueness+transactions, Class
Promotion roster→preview→confirm→job flow, session→AcademicSession
migration, photo upload memoryStorage) — if anything in those three files
was missed or only partially done, finish it here too, don't skip it
because it's "old."

Then implement everything below that is NOT yet in the code (check the
current code first, don't guess):

## A. Data model / field fixes
- `admissionClass` stored as a `Class._id` reference (not a raw digit
  string) — fixes the "Class" vs "First Enrolled Class" mismatch.
  Migrate existing raw-digit records.
- `udiseNumber` removed from `Student` entirely, replaced with
  `penNumber` (per-student, unique per school when present).
- `name`/`fatherName`/`motherName` validator pattern updated to
  `/^[\p{L}\s.'-]+$/u` (Unicode letters + space/dot/hyphen/apostrophe) —
  the old `^[a-zA-Z\s]+$` wrongly rejects regional names and `D'Souza`.
- Phone/bank-number fields normalize (strip spaces/dashes) before
  pattern validation.

## B. Bulk Import
- File picker requires an explicit Submit/Import button — no
  auto-upload on file selection; shows the chosen file's name; allows
  re-picking a different file before submit.
- Shared `QUALIFICATION_OPTIONS`/`OCCUPATION_OPTIONS` constants module
  (e.g. `backend/modules/helpers/student/student.constants.js`)
  imported by BOTH the import validator AND the export/demo-data
  generator — no separate hardcoded lists. Also fix the demo/seed data
  to only reference Sections that actually exist for that class (the
  "Section B not set up" failure).
- Excel column mapping is header-text-driven (match against current
  `FieldConfig.label`), never column-position-driven — an unrecognized
  header is flagged once, not per row; a missing required-field column
  rejects the whole file upfront with a clear message.

## C. Masking / sensitive data
- Manage Students' Export offers "Masked" (default) vs "Full (sensitive
  data)" — no password gate, but selecting "Full" is logged to
  `ActivityLog` (actor, timestamp, class/stream scope). Masked exports
  are not logged.
- View Profile modal's Aadhar/Bank A/C/Bank IFSC/PEN rows are masked by
  default, each with its own small reveal-toggle icon
  (`bi-eye`/`bi-eye-slash`) that reveals just that field for as long as
  the modal stays open (resets to masked on close). Revealing a field
  is logged to `ActivityLog`; hiding it again is not.
- Card column in the Manage Students table shows the FULL card number
  (not masked like "•• 8821") — it's an operational identifier, not
  regulated PII, admin needs to read it in full for device
  troubleshooting.
- Aadhaar Verhoeff checksum validated at Admission-form submit time, in
  addition to the existing 12-digit pattern check.

## D. Dynamic (custom) fields
- Backend: generic `buildJoiSchema(rule)` keyed off
  `validationRule.type` (text/number/date/dropdown/email/phone/
  boolean/file) — never a hardcoded per-field-name validator, so a
  school-added custom field (e.g. "Blood Group") validates with the
  same rigor as a seeded field.
- Frontend: dynamic `FormControl`s built from `fieldConfigs`, same
  `.field`/`.field-error` touch/error mechanics as static fields,
  `buildMessage(fc)` templated by type unless the FieldConfig carries
  its own `errorMessages` override.
- `samagraId` actually seeded with `stateSpecific` set (not shown to
  every school regardless of state).
- `category`'s dropdown supports a per-state `optionsByState` map on
  its `validationRule` (same field everywhere, different option list
  per state) — this is a schema extension `stateSpecific` alone
  doesn't cover.

## E. Admission-time fee & concession
- On Admission submit: resolve `FeeStructure` for
  `(adminId, classId, streamId, sessionId)` and return `totalFees` to
  the frontend — never a freehand-typed fee amount.
- `feesConcession` validated cross-field against that `totalFees`
  (`CONCESSION_EXCEEDS_FEE`); a concession above the admin-configured
  threshold requires a reason/note, stored on the `FeesCollection`
  record.
- The single transaction on submit writes the Student profile AND the
  first `FeesCollection` ledger record together — `feesConcession`
  becomes Fees-module truth after this point, not something edited
  directly on the Student document later (see `errors.md`'s "Editing
  after payment" rule).

## F. Frontend behavior gaps
- Every dropdown-feeding fetch (class, session, school info) has an
  error state, not just a happy path.
- Per-row actions (resync, single delete) use a loading state keyed by
  that row's own id, never one shared page-level boolean.
- Bulk CSV card-assignment rejects an in-file duplicate card number
  before submit.
- List views show a distinct empty state ("no students match these
  filters") vs. a genuine fetch-error state — currently both render as
  the same blank table body.
- Every submit action has a client-side double-submit guard, backed by
  a real `Idempotency-Key` header checked server-side (short TTL,
  Redis) — not just a frontend `isClick` flag.
- Debounce (150–300ms) on any pattern-check validation, not
  per-keystroke.
- Accessibility: every invalid control gets `aria-invalid="true"` +
  `aria-describedby` pointing at its error span's `id`; submit shows a
  summary banner ("N fields need your attention") and moves focus to
  the first invalid field.
- File upload: max resolution cap enforced (not just mime-type check)
  and EXIF metadata stripped server-side before Cloudinary upload.

## G. `.dd` dropdown component fix (applies to every dropdown in this module)
Per `_core/design-system.md`'s updated "Menu positioning and open/close
behavior" rule: render the menu in a portal/top-layer (not clipped by
any modal/container overflow), auto-flip upward when it doesn't fit
below the trigger, and keep it open until an option is selected, an
outside click happens, or focus moves to another field.

## H. Table header sort/case-toggle — final spec
Manage Students table: sort arrow on Admission No., Roll No., Student
only. "Aa" text-case trigger (Title Case default / UPPERCASE /
lowercase) on Student only, next to its sort arrow. Father and Mother
get neither control — plain header text.

---

Do not break anything already working. Confirm build/lint clean after,
and list what you actually changed vs. what was already correct.
