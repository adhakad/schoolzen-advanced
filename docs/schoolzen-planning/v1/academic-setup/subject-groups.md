# Academic Setup — Subject Groups

Status: **FINAL**
Reference: `subject-groups.html`

Bundles subjects into one named choice — a student picks one group, which decides their full subject set for the year.

---

## Frontend

**Toolbar**: row1 (search + Delete Selected outline-danger + Add Group primary) + row2 (Class `.dd` filter, Stream `.dd` filter — Stream disabled/reset until a Class is picked, and only meaningfully populated for streamed classes like 11th/12th).

**Table**: checkbox, Class, Stream (muted italic "— not applicable" for non-streamed classes), Group Name, Subjects (a row of small slate tags, one per subject), Action.

**A non-streamed class's row is its auto-created "General" group — system-managed, not user-editable.** Its checkbox is disabled (can't be bulk-selected for delete), and its Action column shows no edit/delete icons at all (not just disabled-looking — genuinely no action available), since this group only exists because `classes-sections.md`'s Class create flow made it, and only goes away when that Class itself is deleted (cascade, handled there, never from this page). A streamed class's groups (Science/Commerce/etc.) are fully editable here as normal — this restriction is specific to the auto "General" rows.

**Add/Edit modal**: Class `.dd` (required) → Stream `.dd` (disabled with hint "Select a class first" until Class chosen; if the chosen class has no streams, this whole modal isn't reachable for it — see above) → Group Name (required) → a **live checklist of every Subject from the Subjects master list** (checkbox grid, pre-checked for existing members when editing) — this checklist must always reflect the current Subjects list, never a stale copy. This is the same modal/fields `classes-sections.md`'s Add/Edit Class now embeds inline per-stream — a group created either place is the same `SubjectGroup` document, editable from either page afterward.

**A stream with zero groups shows a warning badge on its row** ("No group — Admission blocked") — per `classes-sections.md`'s backfill note, this can happen for data that predates the mandatory-group rule.

**Delete**: type-to-confirm, warning notes "Students currently on this group will need to be reassigned." Not available at all on an auto "General" row (see above).

## Backend

Schema — `SubjectGroup`: `adminId`, `classId` (or class value matching Class doc), `streamId` (matches a specific entry in that class's `streams[]` when applicable, else null), `name`, `subjectIds` (array of refs to Subject — never copy subject names in), **`isSystemGroup` (Boolean, default false)** — true only for an auto-created "General" group (`streamId: null`); this is what the frontend checks to disable that row's actions, and what the backend checks to reject any direct edit/delete request on it (never trust the frontend alone to hide the buttons). Index `(adminId, classId, streamId)` to support the toolbar's filter query.

**Cascade**: deleting a `Class` (in `classes-sections.md`) deletes all of its `SubjectGroup`s (streamed or the auto "General" one) in the same transaction — this is the only path that ever removes an `isSystemGroup:true` document.
