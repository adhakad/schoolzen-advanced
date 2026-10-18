# Student + Academic Setup — final consolidated work order

This is the ONLY fix file to run for these two modules — it supersedes
every earlier `student-fix*.md`. Read `v1/student/errors.md`,
`v1/student/manage-students.md`, `v1/student/admission.md`,
`v1/student/optimization.md`, `v1/_core/module-optimization-guide.md`,
`v1/_core/database-design-principles.md`, `v1/_core/design-system.md`,
`v1/academic-setup/classes-sections.md`,
`v1/academic-setup/subject-groups.md`, and `v1/academic-setup/subjects.md`
before starting.

**Ground rules:**
1. Verify current behavior against the running code first. Do not
   assume an earlier fix attempt worked — several items below were
   reported fixed before and are confirmed still broken on retest.
2. Fix, then run the acceptance test given, before moving on.
3. Report pass/fail per item at the end — not a blanket "done."
4. Don't break anything already working. Confirm build/lint clean at
   the end.

**Resolved, not in scope for this run** (kept here only as a record —
do not spend time on these): Aadhaar Verhoeff checksum rejection was
bad test data, not an app bug (confirmed passing with valid checksums).
Card number masking, IFSC lowercase/mixed-case rejection, Class dropdown
pedagogical ordering, and Admission/Edit modal open-speed are deferred
to a later round — leave as-is for now.

---

## P0 — blocking

### P0-0. Model isolation: every Student-module query must point at `v2-Student` only, never the legacy `Student` collection
Per `_core/database-design-principles.md` §0: no read, write, count,
filter, or export for a school-management-domain module may touch a
legacy collection, immediately — not just for new code going forward.

**Confirmed live, concrete proof**: Classes & Sections' per-class
Student count (Nursery/LKG/UKG columns) was reading from the legacy
`Student` collection, not `v2-Student` — dropping the legacy collection
made that count go to `0` instantly. Meanwhile Manage Students and the
rest of the Student module read `v2-Student`, which is why newly
imported/admitted students never showed up there even though they
exist somewhere. Two different collections are in play for the same
logical data — this is the actual root cause tying together the
"students don't appear in the list" and "wrong class counts" symptoms.

**Fix**: audit every single endpoint touching Student data — list,
count/aggregation (Classes & Sections' per-class counts included),
filter (Class/Stream/Group/Section), export, Admission write, Bulk
Import write — and point every one of them at `v2-Student` only.
**Test for done**: once fixed, the legacy `Student` collection must be
safely droppable with zero visible effect anywhere in the app. If
dropping it changes any number or list, something is still reading it.

**Acceptance test**: (1) drop/rename the legacy `Student` collection —
confirm nothing in the app changes; (2) create a Class in Academic
Setup, confirm it immediately appears in Manage Students' and
Admission's Class filter; (3) import a file, confirm the new students
appear in the unfiltered Manage Students list and Classes & Sections'
count updates correctly, in a fresh session.

### P0-1. Import/bulk-write success response must reflect the actual write result, not the input row count
Confirmed: a bulk import that completed in well under a second (too
fast to have validated+written 100+ rows) still reported "102 added."
The "added/updated/skipped" counts are being derived from the
uploaded file's row count, not from what `insertMany`/`bulkWrite`
actually reported back. Fix: build the response counts only from the
real write-driver result (inserted count, matched/modified count,
actual per-row validation failures) — a job may never report success
without having checked this.
**Acceptance test**: delete all students, re-run the same import file
twice in a row without changing it — the second run's reported counts
must match what's actually queryable in `v2-Student` afterward (e.g.
if the first run's rows are correctly detected as duplicates, the
second run reports 0 added, not the same "102 added" again).

### P0-2. Masked field values are being persisted to the database instead of the real value
Confirmed: some sensitive fields (Aadhar/PEN/Bank-type) are ending up
stored in `v2-Student` as masked placeholder text (e.g.
`XXXX-XXXX-6241`) rather than the real value — most likely from
re-importing a previously "Masked" export, or from a save path that
doesn't distinguish a masked display value from actual input.
**Masking must be display-only, never persisted.** The database must
always hold the real, full value; masking is applied only when
rendering a response/view, per `manage-students.md`'s reveal-icon
pattern — it must never be what gets written on create/update/import.
**Acceptance test**: export a student as "Masked," re-import that same
exported file — the resulting `v2-Student` document must still hold
the ORIGINAL real values (or be correctly rejected/flagged as
placeholder data), never overwritten with the masked string.

---

## P1 — real defects

### P1-1. Stream → Group → Section flow, and General group's subject editing
- Add/Edit Class, streams ON: each stream gets an inline, mandatory
  (minimum 1) Groups sub-block (Group Name + Subject checklist),
  independent of the Sections sub-block. Submit blocked (frontend AND
  backend) if any stream has zero groups.
- Add/Edit Class, streams OFF: no group UI; backend auto-creates one
  `SubjectGroup` named "General" (`streamId: null`, `isSystemGroup:
  true`).
- Subject Groups page, an `isSystemGroup:true` row: Edit is enabled and
  opens the normal modal, but its Name field is read-only/locked —
  **the Subject checklist itself is fully editable** (this is the only
  way a non-streamed class's subjects ever get assigned, since
  `subjects.md`'s Subject list has no other per-class link). Delete
  icon is shown (not hidden, for row consistency) but disabled — only
  ever removed via its Class's delete cascade. Checkbox also disabled.
  A streamed class's own groups stay fully editable/deletable as
  normal — this is specific to auto "General" rows only.
- Add `isSystemGroup` (Boolean, default false) to `SubjectGroup`;
  backend rejects a direct rename/delete on it even if attempted
  directly (name-lock and delete-lock are enforced server-side, not
  just hidden in the UI).
- Any existing stream with zero groups shows a warning badge on its row
  in both pages until fixed.

### P1-2. `admissionType` field missing; universal-module fee handling
Add `admissionType` (`.dd`, required, default `'new'`, enum
`new|old`) to Admission. `'new'`: `doa` = today server-side, standard
fee flow from zero paid. `'old'`: `doa` becomes a real required field
(`≥ dob`), plus optional "Amount already paid till date" (default 0)
seeding the first `FeesCollection` ledger's starting balance. Fix
`admission.md`'s stale "UDISE Number" label to "PEN".

### P1-3. Every dropdown-style overlay — `.dd`, date picker/calendar, and any other popover menu — must render above a modal's sticky header/footer, not just its body
Not limited to `.dd`. Any overlay component that opens from a trigger
inside a modal — the `.dd` dropdown, the `.dp` date picker/calendar,
or any other popover/menu — must use the same portal/top-layer +
collision-detection (auto-flip) behavior from `design-system.md`, and
that behavior must beat the modal's sticky header AND sticky footer,
not just its scrollable body (a sticky header/footer creates its own
stacking context, so a naive fix for the body alone still leaves the
menu clipped or hidden near the top/bottom edge). Check every form
modal in this module (Admission, Assign Card, Excel Import/Export) for
every such overlay near the top or bottom edge specifically.
**Acceptance test**: open the date picker and any `.dd` positioned in
the first or last visible row of each modal above — menu is fully
visible, not clipped or hidden behind the header/footer, and stays open
until resolved.

### P1-4. `group` missing from Admission's field table; Bulk Import's Group column must validate dynamically
Add `group` to the field table: required only when the chosen Class has
streams, must resolve to a `SubjectGroup._id` valid for that exact
`(classId, streamId)`. Bulk Import's Group column validates per-row
against that row's own class+stream's actual groups — never a global
list; unrecognized → `GROUP_NAME_UNRECOGNIZED`. Non-streamed row:
ignore the column, no error.

Implementation approach is left to whoever builds this — pick whatever
fits the existing FieldConfig/validation pipeline cleanest — but it
must not break the current Admission form or existing Bulk Import
validation for any other column; confirm both still pass their
existing tests after this is added.

### P1-5. Audit: is Redis caching actually implemented correctly, not just present
Don't assume caching "exists" because the code has Redis calls. Verify,
for the Student module's list/count endpoints specifically: (1) is it
real cache-aside (read cache first, populate on miss); (2) does every
create/update/delete/import correctly invalidate the relevant cached
keys (a stale cached count/list after a write is the same class of bug
as P0-0/P0-1 above — right-looking response, wrong data); (3) is the
TTL sane for this data (not so long that a fixed P0-1/P0-2 write is
masked by a stale cache read on retest). Report pass/fail per point,
fix whatever fails.
**Acceptance test**: add/delete a student, immediately re-fetch the
list/count (no manual refresh delay) — result reflects the write, not
a stale cached value.

---

## P2 — polish

### P2-1. Idempotency-Key TTL: 30s → 24h
Update the actual Redis TTL to 24 hours (both docs already say 24h).

### P2-2. 4 small result/warning lists have no `trackBy`
Add one keyed on a stable identifier per row (main tables already have
this correctly).

### P2-3. No HTTP compression middleware
Add `compression`/`shrink-ray-current` at the top level — Brotli
primary, gzip fallback, one middleware line.
