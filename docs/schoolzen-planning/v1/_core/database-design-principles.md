# Database Design Principles (locked)

## §0 — Nothing is permanently locked in

A schema choice made for an early module can be redesigned later if a subsequent module's real needs show it should change — as long as it's in the new, not-yet-cut-over system. Never touch LIVE legacy schema in place.

## Multi-tenancy

Every collection: `adminId` (the school), first field in every compound index. Session-scoped collections (fees, attendance, payroll, leave limits, role assignments) also key on `sessionId`/`session`.

## High-volume collections

`AttendanceRecord`: **one document per person per day** (`punches:[{time,type}]` array inside), never one document per punch event — this collection gets huge in production. Unique index `(adminId, personType, personId, date)` so a duplicate device-sync retry merges into `punches` rather than duplicating the document.

## Uniqueness

Anything the UI implies is unique gets a REAL unique compound MongoDB index, never just an app-level check:
- `Class`: `(adminId, class)`
- `Subject`: `(adminId, name)`
- `Shift`: `(adminId, name)`
- `RoleAssignment`: `(adminId, roleId, classId, sectionId)` — this is what actually enforces "same class+role can't go to two people"
- `AcademicSession`: only one `status:'active'` per `adminId` (enforced by the activate-flow's transaction, not a unique index, since "active" is a mutable state not an identity)

## Transactions

Any multi-step write that must stay consistent uses a MongoDB transaction, never sequential unguarded `.save()` calls:
- Class Promotion: create new `StudentEnrollment` + carry forward fee arrears + clear roll number + reset leave balances — one transaction per student.
- Leave approval: mark request approved + increment `LeaveLimit.usedDays` — one transaction (a race between two approvals must not double-count).
- Academic Session activation: flip old session to closed + new session to active — one transaction (never two separate writes that could leave two sessions active, or zero, if the second write fails).
- Student/Staff delete: cascade to fee records, admit cards, results, login, attendance history — one transaction.

## Embed vs. reference

Embed small, bounded, owned-together data (a Class's own `sections[]`/`streams[]`; a Shift's own settings). Reference large or independently-managed data (`SubjectGroup.subjectIds` references `Subject`, never copies the name in — so renaming a subject updates everywhere it's used without a migration).

## No client-side joins

Data from two collections that must appear together (e.g. Attendance Overview merging punch data with person names) is ONE backend aggregation — never two separate API calls stitched together in the frontend. This was a confirmed real anti-pattern in the legacy codebase (student fee collection merged `studentFeesCollection` + `studentInfo` client-side via a JS `Map`) and must not be repeated.

## No N+1 queries

Any list showing a count-per-row (Manage Shifts' "Assigned" column, Subject Groups' subject tags) is ONE aggregation for the whole page, never one query per row.

## Soft-delete vs. hard-delete — decided by data type, not per module from scratch

Financial/historical records (Fees, Payroll, Attendance, PayrollRun/PayrollPayment, ActivityLog) get a `deletedAt` flag — soft delete, since they're records, never truly disposable. Pure configuration (Class/Section/Stream, Subject, Shift, Role definitions) gets hard delete, gated by the existing type-to-confirm UI rule when dependents exist (the Classes & Sections precedent, generalized).

## Idempotency keys for queued/bulk operations

Every BullMQ job (Excel import, device sync, WhatsApp bulk send, bulk PDF generation, payroll generate-for-selected) carries a dedup/idempotency key on its natural inputs — see `additional-technical-considerations.md`'s job-queue section — so a worker crash-and-retry mid-batch can never double-process or double-send.
