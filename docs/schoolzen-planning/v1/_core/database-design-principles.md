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

Any list showing a count-per-row (Manage Shifts' "Assigned" column, Subject Groups' subject tags) is ONE aggregation for the whole page, never one query per row. The same rule governs bulk writes, not just reads: Excel Import validates and writes hundreds of rows in a few round-trips, never one query per row.

```js
// WRONG — one DB round-trip per row (this is why a 500-row import can take minutes)
for (const row of rows) {
  const cls = await Class.findOne({ adminId, class: row.class });      // N+1 read
  const dup = await Student.findOne({ adminId, admissionNo: row.admissionNo }); // N+1 read
  await Student.create({ ...row, classId: cls._id });                  // N+1 write
}

// RIGHT — preload lookups once, validate in memory, write once
const classes = await Class.find({ adminId }).lean();
const classByName = new Map(classes.map(c => [c.class, c._id]));       // one query, then O(1) lookups

const admissionNos = rows.map(r => r.admissionNo);
const existing = await Student.find({ adminId, admissionNo: { $in: admissionNos } }).select('admissionNo').lean();
const existingSet = new Set(existing.map(s => s.admissionNo));         // one query, not N

const validRows = [];
const rowErrors = [];
for (const [i, row] of rows.entries()) {
  const classId = classByName.get(row.class);
  if (!classId) { rowErrors.push({ row: i + 1, code: 'CLASS_NAME_UNRECOGNIZED' }); continue; }
  if (existingSet.has(row.admissionNo)) { rowErrors.push({ row: i + 1, code: 'ADMISSION_NO_DUPLICATE' }); continue; }
  validRows.push({ ...row, adminId, classId });
}

if (validRows.length) {
  await Student.insertMany(validRows, { ordered: false }); // one write for all valid rows
}
// return rowErrors alongside the success count — per error-catalog-conventions.md's
// bulk row-level shape, never abort the whole batch for a partial content error
```

This is the concrete version of `additional-technical-considerations.md`'s
job-queue note that Excel Import runs as a background job — the job
itself must still follow this preload-once/write-once shape internally,
not just be "in a queue" while still looping row-by-row inside it.

## Soft-delete vs. hard-delete — decided by data type, not per module from scratch

Financial/historical records (Fees, Payroll, Attendance, PayrollRun/PayrollPayment, ActivityLog) get a `deletedAt` flag — soft delete, since they're records, never truly disposable. Pure configuration (Class/Section/Stream, Subject, Shift, Role definitions) gets hard delete, gated by the existing type-to-confirm UI rule when dependents exist (the Classes & Sections precedent, generalized).

## Idempotency keys for queued/bulk operations

Every BullMQ job (Excel import, device sync, WhatsApp bulk send, bulk PDF generation, payroll generate-for-selected) carries a dedup/idempotency key on its natural inputs — see `additional-technical-considerations.md`'s job-queue section — so a worker crash-and-retry mid-batch can never double-process or double-send. Synchronous critical writes (fee collection, admission, payment webhook) carry the same protection at the HTTP layer via an `Idempotency-Key` header — see `module-optimization-guide.md` §3, not just for queued jobs.

## Schema-level conventions (applies to every collection, not called out per-module)

- **`schemaVersion` (Number, default 1)** on every collection — a
  document doesn't know how to describe its own shape otherwise, and a
  future migration needs a way to tell "old shape" documents from "new
  shape" ones without inferring it from which fields happen to be
  present/absent.
- **Actor tracking, not just timestamps**: any collection with
  `createdAt`/`updatedAt` also carries `createdBy`/`updatedBy`
  (a reference to the acting `Staff`/`Admin`, not a free-text name) —
  this is what the Audit Log (`additional-technical-considerations.md`'s
  "Audit / activity log" section) and the accountability side of the
  Security checklist depend on. A timestamp without an actor answers
  "when" but not "who," which is the half that actually matters for an
  accountability trail.
- **State as an explicit enum, not a scattered boolean.** A field like
  `isLocked`/`isPaid`/`isActive` only works while there are exactly two
  states and no in-between is ever needed. Prefer `status: {type:
  String, enum: [...]}` (e.g. `'DRAFT'|'LOCKED'|'CANCELLED'` for a
  PayrollRun) wherever a third state is even remotely plausible later —
  cheap to do now, expensive to retrofit once code has scattered
  `if (isLocked)` checks everywhere. Where a field is genuinely and
  permanently binary forever (e.g. `hasStreams` on `Class`), a boolean
  stays a boolean — this isn't "never use booleans," it's "don't use a
  boolean where a state machine is actually growing."
- **Every compound index is written out explicitly in the module's own
  schema doc**, not left implicit in prose — this file's own
  "Uniqueness" section above is the pattern to match: name the exact
  field order (`adminId` first) so it's directly transcribable to code,
  not something the builder has to infer.
