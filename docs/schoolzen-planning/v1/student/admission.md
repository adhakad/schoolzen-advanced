# Student — Admission

Status: **FINAL**
Reference: `admission.html`

The intake form for bringing a student into the system — distinct from Manage Students' ongoing-record view. This is a **universal module, not new-admissions-only**: `errors.md`'s `admissionType` field ('new'/'old') covers both a student freshly admitted this session AND a student already studying at the school before it adopted this ERP (a real mid-session-onboarding case) — both go through this same form, `admissionType` just changes which follow-up fields appear (see `errors.md`'s dedicated section on this).

---

## Frontend

**Toolbar**: same shape as Manage Students (row1: search+Create; row2: Class→Stream→Group→Section dependency-filtered `.dd`s). **Shares the exact same real filter bug confirmed on Manage Students** (`manage-students.md`'s "Class/Stream/Group/Section filters don't actually filter" note) — this page's filters read from the same underlying `Student` collection query path, so the fix applies to both pages, not just one.

**Table**: Photo, Admission No. (or "Not yet issued" muted, before a number is assigned), Student, Father Name, Class, Stream, Roll No., Session, Status (tag: Admitted / Pending), View (eye icon → read-only profile), Letter (printer icon → formal Admission Letter).

**Admission form modal**: a long, grouped form — beyond core identity fields it includes Admission Type ('new'/'old' — 'old' reveals the real Date of Admission and an "Amount already paid till date" field per `errors.md`), Aadhar/Samagra ID (optional), Category, Religion, Nationality, Address, PEN (optional), Last School (optional), Bank A/C+IFSC (optional), and a "Parents Info" group (name/qualification/occupation/income/contact for both). Every categorical field (Category, Religion, Nationality, Qualification, Occupation) is a `.dd`, never a native select.

**View modal**: Admission Info / Student Info / Parents Info sections, read-only — same visual pattern as Manage Students' View Profile but with admission-specific fields (Admission Fee, Fees Concession, Class Applied For).

**Admission Letter modal**: a formal printable letterhead (`.letter-frame`) — school logo/name/affiliation in a header band, "CERTIFICATE OF ADMISSION" title band with session, then a details grid. This is the first of several printable-document patterns in the app (Fee Receipt, Admit Card, Marksheet, Transfer Certificate all reuse this same letterhead language) — build it as a reusable print template, not a one-off.

## Backend

An admission record IS a `Student` document (see `manage-students.md`) at an early lifecycle stage — `status: 'pending'|'admitted'` distinguishes it from a fully processed enrollment. Admission No. is assigned (not pre-existing) — the "Not yet issued" state means the field is genuinely null until an admin issues one, not a display quirk.

The Admission Letter is generated server-side from the same shared PDF/print template service used by other printable documents (`services/pdf/` per `frontend-backend-folder-structure.md`) — never a one-off HTML-string-concatenation per document type.
