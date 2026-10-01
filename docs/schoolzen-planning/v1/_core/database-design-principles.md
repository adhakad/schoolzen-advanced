# Database Design Principles (locked)

## §0 — Nothing is permanently locked in

A schema choice made for an early module can be redesigned later if a subsequent module's real needs show it should change — as long as it's in the new, not-yet-cut-over system. Never touch LIVE legacy schema in place.

**Every school-management-domain model is a fresh v2 model — never the legacy one, never a patched/reused legacy schema.** This applies to every collection tied to actual school-management data: Admin/School profile, Staff, Student, StudentEnrollment, Class, SubjectGroup, AcademicSession, Attendance, Payroll, Fees, Leave, Examination, Certificates, Approvals, and any other module in this planning package. Each gets its own clean v2 model/collection, built to this package's own schema decisions — a builder must never read from, write to, or extend a legacy collection of the same or similar name for these, even as a shortcut, because that is exactly the "wrong type/wrong document copied from legacy without checking" bug class already confirmed twice in `student/errors.md` (`session`/`admissionSession`, `admissionClass`). If a legacy collection with an overlapping name exists, the v2 model is explicitly namespaced/isolated from it (distinct name, folder, or module boundary) so there is zero ambiguity for future work about which one is being read or written.

**This does NOT extend to genuinely generic/infrastructure concerns that aren't school-management domain data** — OTP/auth delivery, payment-gateway integration, file-upload plumbing, and similar cross-cutting infra pieces serve the app itself, not a specific school-management module, and are explicitly OUT of this rule: leave those legacy implementations as they are unless a specific fix elsewhere in this package says otherwise. Don't rebuild or touch them as a side effect of this rule.

**No data may flow to or from a legacy collection for any school-management-domain module, period — not "for new writes going forward," immediately.** For every module already built or in progress (Student is the confirmed case, via `Student` vs `v2-Student`), audit every read, write, count/aggregation, filter, and export query the module has, and point all of them at the v2 collection only. A page/endpoint that still queries the legacy collection — even just for a count or a dropdown — is a live violation of this rule, not a stylistic leftover, and must be fixed as a P0 item: it silently produces wrong numbers/lists (confirmed: Classes & Sections' student count came from the legacy `Student` collection and read 0 the moment that collection was dropped, proving the live app was still querying it). Once fixed, the legacy collection for that module should be droppable with zero effect anywhere in the app — if dropping it changes any number or list, something is still pointed at it.

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
