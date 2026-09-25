# Build: Student module (all 3 pages)

Depends on Academic Setup (Class/Stream/Section/Subject Group data) — build that module first if not already done.

## Read
1. `docs/schoolzen-planning/v1/_core/design-system.md`
2. `docs/schoolzen-planning/v1/student/manage-students.{html,md}`
3. `docs/schoolzen-planning/v1/student/admission.{html,md}`
4. `docs/schoolzen-planning/v1/student/class-promotion.{html,md}`

Read Academic Setup's built code (models/services) if you need to confirm how Class/Stream/Section data is actually shaped — don't guess it.

## Build

**Backend**: `models/student/student.js`, `student-enrollment.js`; `controllers/student/manage-students.controller.js`, `admission.controller.js`, `class-promotion.controller.js`; matching routes.

**Frontend**: `student/manage-students/`, `student/admission/`, `student/class-promotion/` (components); `shared/services/student/*.service.ts`; `shared/models/student/*.model.ts`.

## Critical rules
- Manage Students and Admission show ALL records by default — filters narrow, never gate — except Excel Import/Export on Manage Students which requires a Class selected first.
- `Student` holds identity/profile fields; class/section/stream placement lives on a separate, session-scoped `StudentEnrollment` — never a flat field on `Student` (this is what makes Class Promotion's "create new placement without touching old records" behavior possible).
- The Admission Letter (Admission page) and every other printable document in this app (Fee Receipt, Admit Card, Marksheet, Transfer Certificate) share ONE letterhead template/service — do not build a one-off print template per document type.
- Class Promotion's cascade (fee arrears, roll-number-clear, leave-reset) runs in a transaction per student — see the `.md` for the full sequence and the two non-blocking warnings (Stream+Subject Group missing, Fee Structure missing) that must still surface even though they don't block confirmation.
- Delete on Manage Students cascades (login, fees, admit cards, results) inside a transaction, gated by type-to-confirm.
- Card assignment/resync (Manage Students) pushes to biometric devices asynchronously (background job) — never blocks the request.

## Design rules
Zero native `<select>` — `.dd` everywhere. Bootstrap Icons only. Match each page's own toolbar structure from its own `.html` (don't force one page's shape onto another). `.dd-label` never wraps.

## When done
Show all 3 pages running next to their references. Confirm: Manage Students' Excel button is disabled until a Class is picked; Class Promotion's Detain toggle correctly disables that row's Promote-To dropdown; the Admission Letter renders from the shared print template.
