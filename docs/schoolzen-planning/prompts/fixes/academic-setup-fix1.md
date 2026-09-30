# Fix: Academic Setup module — patch already-built code against the now-FINAL errors.md

`docs/schoolzen-planning/v1/academic-setup/errors.md` has been
rewritten to FINAL with a full deep dive of the real legacy
`class.js`/`class-subject.js`/`subject.js` and the already-built v2
`classes-sections.controller.js`/`subject-groups.controller.js`/
`subjects.controller.js`, plus a fresh read of the legacy Angular
`class`/`class-subject`/`subject` components. Read the "Backend
controller requirements" and "Frontend component requirements"
sections in full before touching any code — this is a patch round,
not a rebuild: go file by file, confirm what's already correct, and
only change what's actually missing.

## Backend — check the already-built controllers for
- Tenant isolation on every single-record lookup (`findOne({_id,
  adminId})`, never bare `_id`) — confirm Subject Groups' update path
  matches Subjects/Classes, which already do this correctly.
- Every uniqueness check backed by a real unique index + Mongo `11000`
  catch, not only a `findOne` pre-check.
- Bulk delete/update runs one grouped query (`countDocuments`/`$in`)
  across the full ID set — confirm Subject Groups' bulk delete matches
  once its cascade check is added (see next point).
- **Subject Groups has no cascade/in-use check on delete at all** —
  add one; this is the mirror gap of Subjects' own delete, which
  already cascades correctly.
- Subject bulk-delete's `$pull`-from-groups + delete stays one
  transaction (confirm it still is).
- Flag (don't necessarily fix in this round) that legacy `class.js` is
  a global, non-tenant-scoped collection — any remaining write paths
  pointed at it need retiring in favor of the per-tenant model.

## Frontend — check the already-built components for
- **Subject Group create/edit must drive the stream picker off the
  real per-class `hasStreams` flag**, never a hardcoded class-number
  ladder (`cls < 11` etc.).
- **Editing a Subject Group must pre-populate its subject checklist**
  from the group's existing subjects, and the Update submit path must
  actually reassign the subject list from the checklist — verify both
  halves of this, since a naive port only fixes the first half.
- Every dropdown-feeding fetch (Class, Subject) has an error callback,
  not just a happy path.
- Every Add/Edit form has a double-submit guard (client-side `isClick`
  + backend `Idempotency-Key`), on all three pages — the legacy code
  had none.
- Classes & Sections' Class dropdown is fetched from the real API,
  never a hardcoded static list.
- All three tables distinguish a genuine empty state from a
  fetch-error state.
- Bulk selection/action (checkbox column, multi-row delete with
  per-row outcome) exists on all three pages, per their own `.md`
  specs — new build, no legacy precedent, don't skip it.
- Delete confirmation requires typing `DELETE` and shows the real
  blocking/dependent count fetched with the list, not discovered only
  after a failed delete attempt.

Read the current built code fully before patching — don't guess which
of these are already handled; confirm each one against the actual
file.
