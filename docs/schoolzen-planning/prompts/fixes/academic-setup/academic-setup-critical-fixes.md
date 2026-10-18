# Academic Setup — final consolidated work order

This is the ONLY fix file to run for Academic Setup (Classes & Sections,
Subject Groups, Subjects) — it supersedes `academic-setup-fix1.md`.
Read `v1/academic-setup/errors.md`, `v1/academic-setup/classes-sections.md`,
`v1/academic-setup/subject-groups.md`, `v1/academic-setup/subjects.md`,
and `v1/_core/database-design-principles.md` before starting.

**Ground rules:**
1. Verify current behavior against the running code first — don't assume
   anything here is already handled.
2. Fix, then run the acceptance test given, before moving on.
3. Report pass/fail per item at the end.
4. Don't break anything already working. Confirm build/lint clean at
   the end.
5. **P0-0 touches live data-access paths across both Academic Setup and
   every module that reads its data (Student's dropdowns/filters,
   Admission, Bulk Import) — treat every change here as high-risk.**
   Before changing which collection/model an endpoint reads or writes,
   confirm exactly what currently depends on it, make the smallest
   change that fixes the isolation gap, and re-verify every consumer
   still works afterward — don't restructure more than the isolation
   fix itself requires. No existing working behavior (current Class/
   Subject Group/Subject CRUD, current filters, current Student-side
   consumption) may change as a side effect of this cleanup.

---

## P0 — blocking

### P0-0. Confirm Class/SubjectGroup/Subject are genuinely isolated v2 collections, not just renamed
Per `database-design-principles.md` §0 and the same audit already done
for Student (`v2-Student`): check the actual Mongoose collection names
backing `Class`, `SubjectGroup`, and `Subject` in the running code
(e.g. collections observed as `academic-classes`, `subject-group`,
`subjects`). Confirm, for each: (1) it is a single, unambiguous
collection — no legacy collection of the same/similar name that any
endpoint could still be accidentally reading from or writing to; (2)
every endpoint across Academic Setup AND every other module that reads
this data (Student's Class/Stream/Group/Section dropdowns and filters,
Admission, Bulk Import) points at this same collection; (3) dropping
any same-named legacy collection changes nothing anywhere in the app.
Naming alone ("v2-" prefix or not) doesn't matter — isolation and
single-source-of-truth do. Fix any endpoint still found reading a
different/legacy source.
**Acceptance test**: create/edit/delete a Class, a Subject Group, and a
Subject — confirm the change is immediately visible everywhere that
type of data is consumed (Student module's dropdowns/filters included),
in a fresh session, and that no duplicate/stale copy of any of the
three exists anywhere.

### P0-1. Add/Edit Class modal: three corrections, per the now-updated `classes-sections.md`/`subject-groups.md`
1. **`hasStreams` must be automatic, never a manual toggle.** It reflects the chosen Class Name only — disabled/Off for every class except 11th/12th, and flips to On automatically the instant 11th or 12th is chosen. Remove any UI that lets an admin manually turn streams on for another class or off for 11th/12th.
2. **Sections must be scoped independently per stream**, each with its own working add (`+`) / remove (`×`) control — adding or removing a specific section in one stream must never affect any other stream's section list. If the current build only appends to one shared list regardless of stream, this is the bug to fix.
3. **Remove the Subject checklist from this modal entirely.** The inline Groups sub-block here only creates/names a group (`SubjectGroup{name, classId, streamId}`, `subjectIds: []`) to satisfy the minimum-1-group rule — it must not show or let anyone pick subjects. Subject selection/editing for a group happens ONLY on the Subject Groups page's own Add/Edit modal, never here, never by Class or by Stream from this page. A group with no subjects yet shows a "No subjects assigned" tag.

**Acceptance test**: (1) picking any class other than 11th/12th shows no Streams UI at all and it cannot be turned on; picking 11th or 12th shows it automatically, with no manual toggle visible. (2) Create 2 streams, add 3 sections to stream A and 1 to stream B, then remove 1 specific section from stream A — stream B's sections are unaffected. (3) The inline Groups sub-block has a Group Name field and no subject checklist; the created group appears on the Subject Groups page with zero subjects and a "No subjects assigned" tag until edited there.

---

## P1 — real defects (from academic-setup-fix1.md, none of these have been addressed yet)

### P1-1. Tenant isolation on every single-record lookup
Confirm Subject Groups' update path uses `findOne({_id, adminId})`,
matching Classes/Subjects which already do this correctly — fix if not.
**Acceptance test**: a record ID from one school can't be read or
updated by another school's admin.

### P1-2. Uniqueness backed by a real unique index, not just a pre-check
Every uniqueness rule (Class name, Subject name, Subject Group name)
must be backed by a real compound unique index with a Mongo `11000`
error catch — a `findOne` pre-check alone has a race-condition gap.

### P1-3. Bulk delete/update runs one grouped query, never per-row
Confirm Subject Groups' bulk delete matches Classes/Subjects' pattern
(`countDocuments`/`$in` across the full ID set, not a loop).

### P1-4. Subject Groups has no cascade/in-use check on delete — add one
This is the mirror gap of Subjects' own delete, which already cascades
correctly. Deleting a Subject Group currently assigned to any student
enrollment must be blocked (or cascade-handled per the module's own
delete rules) the same way, never a silent orphan.
**Acceptance test**: attempting to delete an in-use Subject Group is
blocked with the actual blocking count, matching Subjects'/Classes'
own delete-guard pattern.

### P1-5. Subject bulk-delete's `$pull`-from-groups + delete stays one transaction
Confirm this is still true — if not, make it one transaction.

### P1-6. Legacy `class.js` flag (no fix required this round)
Confirm legacy `class.js` is a global, non-tenant-scoped collection with
no remaining write path pointed at it from v2 code (ties to P0-0 above)
— flag only, retire fully covered by P0-0's audit.

### P1-7. Subject Group stream-picker must use the real per-class `hasStreams` flag
Never a hardcoded class-number ladder (`cls < 11` etc.) — read the
actual `Class.hasStreams` (or equivalent) field.

### P1-8. Editing a Subject Group must fully round-trip its subject checklist
Pre-populate the checklist from the group's existing subjects AND
confirm the Update submit path actually reassigns the subject list from
the checklist — verify both halves; a naive port often only fixes the
display half.

### P1-9. Every dropdown-feeding fetch (Class, Subject) has an error callback
Not just a happy path — a failed fetch must show a real error state,
never a silently empty or stuck-loading dropdown.

### P1-10. Double-submit guard on every Add/Edit form, all three pages
Client-side guard (disable submit while in-flight) + backend
`Idempotency-Key` — the legacy code had none of this.

### P1-11. Classes & Sections' Class dropdown must come from the real API
Never a hardcoded static list.

### P1-12. All three tables distinguish a genuine empty state from a fetch-error state
Classes & Sections, Subject Groups, and Subjects.

### P1-13. Bulk selection/action on all three pages
Checkbox column, multi-row delete with per-row outcome — new build, no
legacy precedent, don't skip it.

### P1-14. Delete confirmation requires typing `DELETE` and shows the real blocking/dependent count upfront
The count must be fetched with the list (shown before the delete
attempt), never discovered only after a failed delete call.

---

Report pass/fail per item. P0-0 should be fixed and verified first —
several of the P1 items may surface additional findings once it's done,
the same way Student's P0-0 fix surfaced 2 extra legacy-read locations.
