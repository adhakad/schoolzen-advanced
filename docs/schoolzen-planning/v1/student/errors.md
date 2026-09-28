# Student — Errors & Validation (field-by-field, frontend + backend)

Status: **FINAL** — field-level table below plus the controller/component-level
requirements in "Backend controller requirements" and "Frontend component
requirements" (added from a line-by-line deep dive of the real legacy
`student.js`, `student.component.ts/.html`, `admission.component.ts/.html`
and `promote-fail.component.ts/.html`, cross-checked against the already-built
v2 controllers `admission.controller.js`/`class-promotion.controller.js`/
`manage-students.controller.js`). This is the format going forward for the
other 12 modules.
Depends on: `_core/error-catalog-conventions.md`, `settings/admission-form-fields.md` (FieldConfig)

## Why this version looks different from a generic catalog

The first pass at this file listed error *categories* with one illustrative
example each. That was reviewed and rejected as too generic to actually
build from — a real form has one validation rule PER FIELD, and a builder
needs the exact rule, not a category name. This version is built directly
from the two real legacy references provided (`student.js` — the backend
controller — and `student.component.ts`/`.html` — the actual Angular
reactive form with its `Validators` and `mat-error` blocks), field by
field, exact regex/bounds/messages carried over or explicitly improved,
not paraphrased into something vaguer.

**How this reconciles with FieldConfig**: FieldConfig (see
`admission-form-fields.md`) controls whether a field is *shown/required*
and lets a school add *custom* fields with their own rule. It does NOT
mean every field's format is arbitrary — Aadhar being 12 digits, IFSC
being 11 characters, a phone number starting 6-9 are facts about the
real world, not a school's preference. So: the ~25 fields below each have
a **fixed baseline format rule** (hardcoded here, same as the legacy
code — these are "locked" `FieldConfig` entries per that module's own
`locked` flag), while FieldConfig still governs each one's `required`
on/off and `visible` on/off, and is the ONLY place a school-added custom
field's rule lives. A builder implements the table below as the seeded/
default `FieldConfig` rows, not as a second, separate hardcoded
validator that could drift from it — this is the same "one shared
validator, read at runtime" principle `admission-form-fields.md`
already states, just now with concrete default content instead of
leaving every field's actual rule unspecified.

---

## Field-by-field validation table — Admission / Manage Students form

Every row = one `FieldConfig` seed. **Frontend** column is the Angular
`Validators` array (same mechanism as the legacy form — reactive forms,
not template-driven — only the markup around each control changes from
`mat-form-field`/`mat-error` to this app's own `.field`/`.field-error`
per `design-system.md`). **Backend** column is the Joi/validator-function
mirror — the frontend rule is UX, the backend rule is truth; every field
here is checked server-side regardless of what the client sent.

| Field | Control | Frontend validators | Backend mirror | Error messages (by key) |
|---|---|---|---|---|
| `session` | `.dd` | `required` | `required`, must be an existing `AcademicSession` id | required→"Session is required." |
| `medium` | `.dd` | `required` | `required`, enum from seeded mediums | required→"Medium is required." |
| `admissionNo` | number input | `required`, `pattern(^\d+$)` | `required`, integer, **uniqueness** `(adminId, admissionNo)` | required→"Admission no. is required." · pattern→"Admission no. must contain numbers only." · (server) duplicate→`ADMISSION_NO_DUPLICATE` "This admission number is already in use." |
| `admissionClass`/`class` | `.dd` | `required`, `pattern(^\d+$)` | `required`, must resolve to an existing `Class` (see `academic-setup/errors.md`) | required→"First enrolled class is required." · pattern→"Choose a valid class." |
| `rollNumber` | number input | `required`, `maxLength(8)`, `pattern(^[0-9]+$)` | `required`, integer ≤ 8 digits, **uniqueness** `(adminId, classId, sessionId)` — scoped per class+session, NOT global | required→"Roll number is required." · maxlength→"Roll number can't be more than 8 digits." · pattern→"Roll number must contain numbers only." · (server) duplicate→`ROLL_NUMBER_DUPLICATE` "This roll number is already taken in this class." |
| `name` | text input | `required`, `pattern(^[a-zA-Z\s]+$)` | `required`, same pattern, trim+collapse whitespace, HTML-escape before storing (XSS hardening the legacy form didn't have) | required→"Name is required." · pattern→"Name can only contain letters and spaces." |
| `dob` | date picker | `required` | `required`, valid date, **not in the future**, and **not less than 2 years before today** (a sanity bound the legacy form never had — catches a fat-fingered year) | required→"Date of birth is required." · (server-only) `DOB_INVALID` "Enter a valid date of birth." · `DOB_IN_FUTURE` "Date of birth can't be in the future." |
| `doa` | date picker | `required` | `required`, valid date, **not before `dob`** (server-only cross-field check — legacy form had no such guard) | required→"Date of admission is required." · (server-only) `DOA_BEFORE_DOB` "Admission date can't be before date of birth." |
| `aadharNumber` | number input | optional, `pattern(^\d{12}$)` | optional, same pattern, **uniqueness** `(adminId, aadharNumber)` when present | pattern→"Aadhar number must be a 12-digit number." · (server) duplicate→`AADHAR_DUPLICATE` "This Aadhar number is already registered." |
| `samagraId` | number input | optional, `pattern(^\d{9}$)` | optional, same pattern, **uniqueness** `(adminId, samagraId)` when present | pattern→"Samagra ID must be a 9-digit number." · (server) duplicate→`SAMAGRA_ID_DUPLICATE` "This Samagra ID is already registered." |
| `udiseNumber` | number input | optional, `pattern(^\d{11}$)` | optional, same pattern, **uniqueness** `(adminId, udiseNumber)` when present | pattern→"UDISE number must be an 11-digit number." · (server) duplicate→`UDISE_DUPLICATE` "This UDISE number is already registered." |
| `bankAccountNo` | number input | optional, `minLength(9)`, `maxLength(18)`, `pattern(^[0-9]+$)` | optional, same bounds | minlength→"Bank account number must be at least 9 digits." · maxlength→"Bank account number can't be more than 18 digits." · pattern→"Bank account number must contain numbers only." |
| `bankIfscCode` | text input | optional, `minLength(11)`, `maxLength(11)` | optional, exact length 11, **format** `pattern(^[A-Z]{4}0[A-Z0-9]{6}$)` (a real IFSC format check — the legacy form only checked length, which lets through 11 garbage characters; this is a genuine improvement, not a copy) | length→"IFSC code must be exactly 11 characters." · (server-only) `IFSC_FORMAT_INVALID` "Enter a valid IFSC code (e.g. SBIN0001234)." |
| `gender` | `.dd` | `required` | `required`, enum `male\|female\|other` | required→"Gender is required." |
| `category` | `.dd` | `required` | `required`, enum `general\|obc\|sc\|st\|ews\|other` | required→"Category is required." |
| `religion` | `.dd` | `required` | `required`, enum from seeded religions | required→"Religion is required." |
| `nationality` | `.dd` | `required` | `required`, enum `indian\|other` | required→"Nationality is required." |
| `address` | textarea | `required`, `maxLength(50)` | `required`, same bound — **note**: 50 chars is very tight for a real address; flagged here as a legacy limitation worth raising with the school, not silently carried into v2 as-is (see "Deviations from legacy" below) | required→"Address is required." · maxlength→"Address can't be more than 50 characters." |
| `lastSchool` | text input | optional, `maxLength(50)` | optional, same bound | maxlength→"Last school name can't be more than 50 characters." |
| `fatherName` | text input | `required`, `pattern(^[a-zA-Z\s]+$)` | `required`, same pattern + escape | required→"Father's name is required." · pattern→"Father's name can only contain letters and spaces." |
| `fatherQualification` | `.dd` | `required` | `required`, enum from seeded qualifications | required→"Father's qualification is required." |
| `fatherOccupation` | `.dd` | `required` | `required`, enum from seeded occupations | required→"Father's occupation is required." |
| `motherName` | text input | `required`, `pattern(^[a-zA-Z\s]+$)` | `required`, same pattern + escape | required→"Mother's name is required." · pattern→"Mother's name can only contain letters and spaces." |
| `motherQualification` | `.dd` | `required` | `required`, enum | required→"Mother's qualification is required." |
| `motherOccupation` | `.dd` | `required` | `required`, enum | required→"Mother's occupation is required." |
| `parentsContact` | number input | optional, `pattern(^[6-9]\d{9}$)` | optional, same pattern | pattern→"Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9." |
| `familyAnnualIncome` | number input | `required`, `pattern(^\d+$)` | `required`, integer ≥ 0 | required→"Family annual income is required." · pattern→"Enter a valid amount (numbers only)." |
| `feesConcession` | number input | `required`, `pattern(^\d+$)` | `required`, integer ≥ 0, **cross-field**: ≤ that class/stream/session's `FeeStructure.totalFees` — see Business Rules below | required→"Fees concession is required." · pattern→"Enter a valid amount (numbers only)." · (server) `CONCESSION_EXCEEDS_FEE` "Concession can't be greater than the total fee (₹X)." |
| `studentImage` | file input | optional, image mime-type + ≤2MB client-side check | optional, re-validated server-side (mime sniff, not just extension) before the Cloudinary upload call | client `FILE_TOO_LARGE`→"Image must be under 2MB." · client `FILE_TYPE_INVALID`→"Only JPG/PNG images are allowed." |

## Assign Card form

| Field | Control | Frontend validators | Backend mirror | Messages |
|---|---|---|---|---|
| `cardNo` | text input | `required` | `required`, **uniqueness** `(adminId, cardNumber)` — a card can't be assigned to two people at once | required→"Card number is required." · (server) duplicate→`CARD_ALREADY_ASSIGNED` "This card is already assigned to someone else." |
| `verifyMode` | `.dd` | `required`, default `4` (Card Only) | `required`, enum matching the WDMS verify-mode codes (`0,1,3,4,15`) | required→"Choose a verify mode." |

---

## Frontend implementation — exact touch/error mechanics (not a generic pattern)

This reuses Angular's own reactive-forms state machine, which the
legacy form already relies on (`FormGroup` + `Validators`, `.touched`,
`.hasError(key)`) — v2 changes the MARKUP (`.field`/`.field-error`
instead of `mat-form-field`/`mat-error`, since the design system doesn't
use Angular Material) but not the underlying mechanism, so this is a
direct, faithful port, not a redesign:

```html
<div class="field">
  <label>Admission No.</label>
  <input class="field-input" [class.is-invalid]="admissionNo.invalid && admissionNo.touched"
         formControlName="admissionNo" (blur)="admissionNo.markAsTouched()">
  <span class="field-error" *ngIf="admissionNo.hasError('required') && admissionNo.touched">
    <i class="bi bi-exclamation-circle"></i> Admission no. is required.
  </span>
  <span class="field-error" *ngIf="admissionNo.hasError('pattern') && admissionNo.touched">
    <i class="bi bi-exclamation-circle"></i> Admission no. must contain numbers only.
  </span>
</div>
```

Rules, restated precisely (this is what "generic" was missing — the
actual condition, not just "show an error"):
1. Every control's error span checks a SPECIFIC `hasError(key)`, never
   a bare `.invalid` — a field failing BOTH `required` and `pattern`
   must show the right one (`required` takes priority when the value is
   empty; `pattern`/`minlength`/`maxlength` only apply once something
   has been typed — this is exactly how Angular's own validators already
   behave, `required` and `pattern` don't both fire on an empty value).
2. `.dd` components are NOT native inputs, so they don't get a
   `blur` event for free — the `.dd`'s own close/select handler must
   call `markAsTouched()` on its bound control when the menu closes
   (whether or not a value was picked), otherwise a required `.dd` left
   untouched would never show its error until submit.
3. Submitting calls `this.studentForm.markAllAsTouched()` before
   checking `.invalid` — this is what surfaces every unfilled required
   field at once on submit attempt (rule 3 from `design-system.md`'s
   Form validation state section), including ones the user never
   focused.
4. A server-side field error (e.g. `ADMISSION_NO_DUPLICATE`, which no
   client-side rule can catch) is applied via
   `this.studentForm.get('admissionNo').setErrors({server: true})` with
   the message stored separately and rendered through the SAME
   `.field-error` span (a 4th `*ngIf` per field checking a stored
   `serverErrors.admissionNo` value) — never a toast for something that
   already has a field to point at, matching shape #1/#3's frontend
   treatment in `error-catalog-conventions.md`.

## Business rules (cross-field, shape #3)

- **Fee concession bound**: on submit, look up `FeeStructure` for
  `(adminId, sessionId, classId, streamId)`; if none exists, reject
  with `FEE_STRUCTURE_MISSING` before even checking the concession
  amount ("Please create the fee structure for session X before
  admitting to this class."); if it exists, reject `feesConcession >
  totalFees` with `CONCESSION_EXCEEDS_FEE`.
- **Subject Group existence**: if no `SubjectGroup` exists for this
  class+stream, `SUBJECT_GROUP_MISSING` ("Please group subjects for
  this class/stream before admission.") — same fail-fast-before-write
  pattern as the fee structure check.
- **DOA vs admission type**: `admissionType:'new'` sets `doa` to
  today server-side regardless of what the form sent (matches legacy
  behavior) — `admissionType:'old'` requires the form's `doa` and
  validates it as above.
- **Editing after payment**: changing `session` or `feesConcession` on
  an existing student who already has a recorded `FeePayment` is
  rejected with `FEES_LOCKED_AFTER_PAYMENT` — exact carryover of the
  legacy `UpdateStudent` logic (`hasPayments` check), a real business
  rule, not decoration.
- **Plan student limit**: creating a student when
  `count(Student) >= AdminPlan.studentLimit` is rejected with
  `STUDENT_LIMIT_EXCEEDED` before any other field validation runs
  (fail fast, matches legacy ordering).

## Bulk Import (Excel) — same field rules, applied per row

The bulk-import path does **not** get a separate, looser rule set — it
runs the exact table above per row (the shared FieldConfig-driven
validator `admission-form-fields.md` requires), plus these row-only
concerns:
- Missing-required-fields message names EVERY missing field in one
  line per row (legacy behavior, kept): `"Row 3 is missing: Father
  Name, Mother Occupation, DOB."`
- Uniqueness (admission no./roll no./aadhar/samagra) is checked against
  BOTH already-committed data AND the rest of the current file — a
  duplicate between row 5 and row 40 of the same sheet is still a
  duplicate, caught before either is inserted.
- Unmapped class-name text in the sheet (e.g. "Nursary" typo) →
  `CLASS_NAME_UNRECOGNIZED`, "Row N: '<text>' doesn't match any class."
- Whole-batch (never partial) rejections: empty file, more than the
  configured max rows (`performance-principles.md`), missing expected
  template columns, or the batch pushing the school over its plan's
  student limit (checked as `batch length + current count` up front,
  not discovered mid-insert).
- Response shape is the `rows[]` array from
  `error-catalog-conventions.md` shape #7 — every failing row reported
  in one response, rows that pass are still committed.

## Uniqueness summary (shape #2, consolidated)

| Field | Scope | Code |
|---|---|---|
| `admissionNo` | `(adminId)` | `ADMISSION_NO_DUPLICATE` |
| `rollNumber` | `(adminId, classId, sessionId)` | `ROLL_NUMBER_DUPLICATE` |
| `aadharNumber` | `(adminId)`, only when present | `AADHAR_DUPLICATE` |
| `samagraId` | `(adminId)`, only when present | `SAMAGRA_ID_DUPLICATE` |
| `udiseNumber` | `(adminId)`, only when present | `UDISE_DUPLICATE` |
| `cardNumber` | `(adminId)` | `CARD_ALREADY_ASSIGNED` |

## Dependency / not found (shape #4)

| Case | Code | Message |
|---|---|---|
| Class/Stream/Section/Group referenced on the form no longer exists | `NOT_FOUND` | "The selected class/section no longer exists — refresh and try again." |
| Fetching/editing a student by an ID that doesn't exist | `STUDENT_NOT_FOUND` | "Student not found." |

## State-transition guard (shape #5)

| Case | Code | Message |
|---|---|---|
| Promoting a student already promoted for the target session | `ALREADY_PROMOTED` | "This student already has a placement for that session." |
| Promoting past 12th class | `PROMOTION_LIMIT` | "Students can't be promoted past the 12th class." |

## Cascade / delete (shape #6)

| Case | Message | Notes |
|---|---|---|
| Delete Student | "Deleting also removes login access, fee records, admit cards, and results for this student." | Stated-consequence delete, not blocked — transactional cascade via the hook registry (`additional-technical-considerations.md`) |

## External-service failure (shape #8)

| Case | Code | Message |
|---|---|---|
| Cloudinary/image upload fails | `IMAGE_UPLOAD_FAILED` | "Couldn't upload the photo — the record was saved without it, try adding it again." |
| Biometric device unreachable during card assign/resync | `DEVICE_UNREACHABLE` | "Couldn't reach one or more devices — card saved, it will sync automatically when the device is back online." |

## Concurrency (shape #9)

| Case | Code | Message | Notes |
|---|---|---|---|
| Two staff create a student with the same admission no./aadhar/samagra/udise/roll no. at once | (matching duplicate code above) | (matching message above) | Caught by the unique index at write time — never a pre-check-then-write; the losing request gets the duplicate error cleanly instead of a corrupted double-write |
| A plan's student-limit is hit exactly mid-bulk-import | `STUDENT_LIMIT_EXCEEDED` | "This import would exceed your plan's student limit (X). Only the first N rows were within it." | Checked against `batch length + current count` up front |

## Deviations from legacy — called out explicitly, not silently changed

- `bankIfscCode` gets a real format check (not just length) — genuine
  improvement, listed so it isn't mistaken for scope creep during
  review.
- `dob`/`doa` gained sanity bounds (no future DOB, DOA ≥ DOB) the
  legacy form never had.
- `name`/`fatherName`/`motherName` are HTML-escaped server-side before
  storage (XSS hardening) — the legacy pattern check alone doesn't
  prevent this since `<script>` contains no digits but could still
  contain letters+spaces in some encodings; escaping is a backend-only
  addition, invisible to the user.
- `address`'s 50-character cap is flagged, not silently kept or
  silently changed — worth a real decision (raise the limit for v2, or
  keep it for consistency with existing printed documents that assume
  short addresses) rather than either copying a possibly-too-tight
  legacy limit or quietly loosening a rule nobody asked to change.

---

## Beyond the legacy reference — real gaps found while porting, not silently copied

- **`name`/`fatherName`/`motherName` regex was wrong to carry over
  as-is.** `^[a-zA-Z\s]+$` rejects any regional-script name, and even
  in English rejects `D'Souza`, `Mary-Jane`, `A. Kumar`. Fixed pattern:
  `/^[\p{L}\s.'-]+$/u` (Unicode letter class + space/dot/hyphen/
  apostrophe).
- **No public "does this Aadhar/admission-no already exist" check
  endpoint.** A live-typing availability check is tempting for UX, but
  an authenticated-only, rate-limited endpoint that confirms/denies a
  specific Aadhar/Samagra/UDISE number's existence is an **enumeration
  attack surface** (iterate numbers, learn which real people are
  enrolled where). Uniqueness is checked only at submit time, server-
  side, never exposed as a standalone lookup.
- **Accessibility was entirely absent from the legacy form.** Every
  invalid control needs `aria-invalid="true"` + `aria-describedby`
  pointing at its `.field-error` span's `id`; the form needs a
  submit-time summary banner ("3 fields need your attention," focus
  moved to the first one) — a sighted user sees red borders, a
  screen-reader user needs the equivalent.
- **Phone/bank-number fields should normalize before validating**
  (strip spaces/dashes: `"98765 43210"` → `9876543210`) — otherwise a
  correctly-formatted-but-spaced number fails `pattern` for no real
  reason.
- **File upload needs more than a mime-type check**: max resolution
  cap (a 40MP photo shouldn't reach Cloudinary untouched) and EXIF
  metadata stripped server-side before storage (a phone photo can
  embed GPS coordinates — a real privacy leak for a student photo).
- **Double-submit needs a backend guard, not just the frontend
  `isClick` flag.** An `Idempotency-Key` header (client-generated UUID
  per form-open), checked server-side with a short TTL (30s, Redis),
  makes a network-retry-triggered double machine-submit a no-op instead
  of a duplicate student.
- **Debounce, not per-keystroke validation**, on any pattern check —
  150–300ms, otherwise a fast typist sees the error flash on and off
  distractingly on every character.

## Dynamic (school-created custom) fields — same `FieldConfig`, no hardcoded field names

The static table above is 25 SEEDED `FieldConfig` rows (`locked:true`
or `isCustom:false`). A school can also add its OWN fields via
`admission-form-fields.md`'s "Add Custom Field" — these must validate
and error exactly as rigorously as the fixed ones, but neither
frontend nor backend can hardcode a name/type for something that
doesn't exist yet at build time. The fix: a generic RULE
INTERPRETER, keyed off `validationRule.type`, not field name.

**Example — a school adds "Blood Group" (required dropdown):**
```json
{
  "adminId": "admin_123",
  "fieldKey": "bloodGroup",
  "label": "Blood Group",
  "group": "Student Info",
  "required": true,
  "visible": true,
  "locked": false,
  "isCustom": true,
  "validationRule": { "type": "dropdown", "options": ["A+","A-","B+","B-","O+","O-","AB+","AB-"] }
}
```

**Backend — `buildJoiSchema(rule)`, one function, every custom field
routes through it:**
```js
function buildJoiSchema(rule) {
  let schema;
  switch (rule.type) {
    case 'text':     schema = Joi.string().pattern(rule.pattern ? new RegExp(rule.pattern, 'u') : /.*/); break;
    case 'number':   schema = Joi.number().min(rule.min ?? -Infinity).max(rule.max ?? Infinity); break;
    case 'date':     schema = Joi.date().max(rule.notFuture ? 'now' : undefined); break;
    case 'dropdown': schema = Joi.string().valid(...rule.options); break;
    case 'email':    schema = Joi.string().email(); break;
    case 'phone':    schema = Joi.string().pattern(/^[6-9]\d{9}$/); break;
    case 'boolean':  schema = Joi.boolean(); break;
    case 'file':     schema = Joi.object({ mime: Joi.string().valid(...rule.allowedMimeTypes), size: Joi.number().max(rule.maxSizeMB * 1024 * 1024) }); break;
  }
  return rule.required ? schema.required() : schema.optional();
}
```
A field type this switch doesn't recognize is a **build-time config
error**, not a runtime one — `FieldConfig` creation itself validates
`type` against the known set, so a broken custom field can never be
saved into the schema in the first place.

**Frontend — dynamic `FormControl` + dynamic template, same idea:**
```ts
buildValidators(rule): ValidatorFn[] {
  const v = [];
  if (rule.required) v.push(Validators.required);
  if (rule.type === 'text' && rule.pattern) v.push(Validators.pattern(rule.pattern));
  if (rule.type === 'number') {
    if (rule.min != null) v.push(Validators.min(rule.min));
    if (rule.max != null) v.push(Validators.max(rule.max));
  }
  if (rule.type === 'email') v.push(Validators.email);
  return v;
}
// building the form:
fieldConfigs.forEach(fc =>
  form.addControl(fc.fieldKey, this.fb.control('', this.buildValidators(fc.validationRule)))
);
```
```html
<div class="field" *ngFor="let fc of fieldConfigs">
  <label [attr.for]="fc.fieldKey">{{ fc.label }}</label>
  <ng-container [ngSwitch]="fc.validationRule.type">
    <input *ngSwitchCase="'text'" [id]="fc.fieldKey" [formControlName]="fc.fieldKey"
           [attr.aria-invalid]="form.get(fc.fieldKey)?.invalid && form.get(fc.fieldKey)?.touched"
           [attr.aria-describedby]="fc.fieldKey + '-error'">
    <div class="dd" *ngSwitchCase="'dropdown'" [attr.id]="fc.fieldKey">
      <div class="dd-option" *ngFor="let opt of fc.validationRule.options" (click)="select(fc.fieldKey, opt)">{{opt}}</div>
    </div>
    <!-- date / number / email / phone / boolean / file follow the same ngSwitchCase pattern -->
  </ng-container>
  <span class="field-error" [id]="fc.fieldKey + '-error'"
        *ngIf="form.get(fc.fieldKey)?.invalid && form.get(fc.fieldKey)?.touched">
    <i class="bi bi-exclamation-circle"></i> {{ buildMessage(fc) }}
  </span>
</div>
```
`buildMessage(fc)` is template-by-type ("Enter a valid {{label}}.",
"{{label}} is required.") unless `fc.validationRule.errorMessages`
carries the school's own override for a specific key (`required`,
`pattern`, `min`, `max`) — same idea as the static table's per-field
messages, just sourced from data instead of hardcoded per field name.

**Uniqueness on a custom field**: scope is always flat `(adminId,
fieldKey, value)` — the static table's per-class/per-session scoping
(roll number) is NOT offered as a custom-field option; a school
needing that level of scoping is a sign the field should be a proper
platform field (a feature request), not something this generic system
tries to support to avoid over-engineering a rare case.

**Touch/error mechanics for dynamic fields are IDENTICAL to the static
table's** (same `.field`/`.field-error`, same touched-gating, same
`.dd` manual-touch rule) — the only thing that changes between a
static and a dynamic field is where its validator array comes from
(hardcoded vs. built from `validationRule`), never the display/error
mechanism itself.

---

## Backend controller requirements (from `student.js`/real v2 controller deep dive)

These are implementation requirements a builder must satisfy — not
duplicate error-code tables, since the codes above already cover the
user-facing cases. What's missing from a naive rebuild is *how* these get
enforced correctly:

- **Tenant isolation is mandatory on every single-record lookup.** Never
  `findById`/`findOne({_id})` alone — always `findOne({_id, adminId})`,
  with `adminId` resolved from the authenticated session, not trusted
  from body/query/param. A record belonging to another school must read
  as `STUDENT_NOT_FOUND`, identically to a genuinely missing id, never a
  403 (that would confirm the id exists). Two real cross-tenant leaks
  were found in the legacy reference and must not recur: a pagination
  endpoint with no `adminId` filter at all (returns other schools' full
  student records), and a "next serial number" counter with no `adminId`
  scope (leaks volume info and races between schools). Every list/count/
  single-record endpoint needs an explicit tenant-scope check, not an
  assumption that the query object already has one.
- **All 6 uniqueness checks in this file's tables (admissionNo, roll
  number, Aadhar, Samagra ID, UDISE, card number) must be enforced by a
  real unique index, caught as a Mongo duplicate-key error and converted
  to the matching `ConflictError` code — never a `findOne`-then-write
  pre-check alone.** The pre-check is fine to *keep* for a fast, specific
  message in the common case, but it is not the actual guard; two
  concurrent submissions must not be able to both pass it.
- **Create, Update, and Delete must each be one transaction**, not a
  sequence of independent writes across Student profile + Enrollment +
  FeesCollection (+ AdmitCard/ExamResult/login-credential on delete). A
  partial failure must never leave the student profile written but its
  fee record missing, or the profile deleted but its fee/exam records
  orphaned. Delete additionally requires a server-side `confirmed:true`
  flag — this cannot be a frontend-only gate.
- **Bulk import validates every row before writing any of them**,
  collecting all failures into one `rows:[]` response (per the Bulk
  Import section above) — never abort-on-first-bad-row. An unrecognized
  class name in a row is its own case (`CLASS_NAME_UNRECOGNIZED`), not a
  generic "missing required field."
- **Class Promotion is a roster operation, not a per-student one.**
  The old per-student promote/fail pattern (immediate write, no preview,
  no cohort view) does not carry forward. The rebuilt flow is: load the
  class roster → preview a plan (promote/detain decisions, resolved
  target placements) → confirm, which **re-validates server-side against
  current data** (never trusts a preview payload that may be minutes
  old) and enqueues a background job, chunked, so a class of any size
  processes in bounded transactions. The confirm step surfaces
  non-blocking warnings — a target class/stream missing a fee structure,
  a target stream not yet configured, a student already placed for that
  session — as a `warnings[]` array the UI must render distinctly per
  type, not collapse into one generic banner. A student's prior-year
  AdmitCard/ExamResult must never be deleted on promotion — those are
  session-scoped historical records, not something promotion overwrites.

## Frontend component requirements (Manage Students / Admission / Class Promotion)

- **Manage Students needs checkbox row-select with bulk Delete and bulk
  Assign Card actions** — this has no legacy precedent to port, it's a
  new build. A bulk action's result must be a per-row outcome (mirroring
  the bulk-import `rows[]` shape), never a single pass/fail toast for
  the whole selection.
- **Any per-row action (resync, single delete) needs a loading state
  keyed by that row's id**, not one shared page-level boolean — a
  shared flag makes clicking one row's action silently block or ignore
  a click on a different row, with no visual feedback either way.
- **Bulk CSV card-assignment must reject an in-file duplicate card
  number before submit**, the same principle as the bulk-import
  duplicate check above, just scoped to one file instead of file+DB.
- **Every dropdown-feeding fetch (class, session, school info) needs an
  error state**, not just a happy path — a failed fetch today can leave
  a dropdown silently empty or, worse, let a later step (e.g. print)
  throw on an undefined value it assumed would be there.
- **Admission form must send the class the user actually selected and
  a real date for date-of-admission** — a hardcoded class value or a
  placeholder string in place of a real field is a data-correctness
  bug, not an error-handling gap, and must not be ported into v2.
- **List views need a distinct empty state** ("no students match these
  filters") separate from a genuine fetch-error state — both currently
  render as the same blank table body.
- **Every submit action needs a double-submit guard** — a client-side
  `isClick`-style flag is necessary but not sufficient (a true fix also
  needs the backend `Idempotency-Key` support already specified above);
  today one of Student's three pages has no client-side guard at all,
  which must not carry forward.

---

**This is the format going forward for the other 12 modules.**
