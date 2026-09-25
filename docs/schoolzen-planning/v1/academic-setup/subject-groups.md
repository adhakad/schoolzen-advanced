# Academic Setup — Subject Groups

Status: **FINAL**
Reference: `subject-groups.html`

Bundles subjects into one named choice — a student picks one group, which decides their full subject set for the year.

---

## Frontend

**Toolbar**: row1 (search + Delete Selected outline-danger + Add Group primary) + row2 (Class `.dd` filter, Stream `.dd` filter — Stream disabled/reset until a Class is picked, and only meaningfully populated for streamed classes like 11th/12th).

**Table**: checkbox, Class, Stream (muted italic "— not applicable" for non-streamed classes), Group Name, Subjects (a row of small slate tags, one per subject), Action.

**Add/Edit modal**: Class `.dd` (required) → Stream `.dd` (disabled with hint "Select a class first" until Class chosen; if the chosen class has no streams, disabled with hint "This class has no streams — leave as-is") → Group Name (required) → a **live checklist of every Subject from the Subjects master list** (checkbox grid, pre-checked for existing members when editing) — this checklist must always reflect the current Subjects list, never a stale copy.

**Delete**: type-to-confirm, warning notes "Students currently on this group will need to be reassigned."

## Backend

Schema — `SubjectGroup`: `adminId`, `classId` (or class value matching Class doc), `streamId` (matches a specific entry in that class's `streams[]` when applicable, else null), `name`, `subjectIds` (array of refs to Subject — never copy subject names in). Index `(adminId, classId, streamId)` to support the toolbar's filter query.
