# Academic Setup — Classes & Sections

Status: **FINAL**
Reference: `classes-sections.html`

Source data behind every Class/Stream/Section reference used across the app.

---

## Frontend

**Toolbar**: single `toolbar-row1` (search left, "+ Add Class" primary button + "Delete Selected" outline-danger button right, `justify-content:space-between`) — no filter row, this page has no filters.

**Table**: checkbox, Class (Fraunces numeral + suffix, e.g. "11"+"th"), Streams, Sections, Students (right-aligned), Action.
- Streams/Sections render as a **clickable tag** ("2 streams", "6 sections") that opens a read-only Details modal listing every stream's name and its section chips (or the flat section chips if no streams) — never inline-list the names in the table itself.
- No streams/sections configured → muted italic tag ("Set per stream" / plain dash), not blank.
- Row actions: edit (pencil) opens the Add/Edit modal pre-filled; delete opens the confirm flow.

**Add/Edit Class modal**: Class Name (required, gates Submit) + a "This class has streams" toggle that swaps the whole body:
- **Off**: one Sections block — add/remove rows (`+`/`×`), a flat list. On first save, the backend auto-creates exactly one `SubjectGroup` named "General" for this class (`streamId: null`) — no group UI is shown for a non-streamed class at all, since there's no subject-choice to configure here (every student in this class takes the same fixed subject set).
- **On**: a Streams block (add/remove rows), and for EACH stream, two independent sub-blocks: (1) a **Groups sub-block — mandatory, minimum 1** (Group Name + a live Subject checklist, same fields as `subject-groups.md`'s own Add/Edit modal — this is the SAME `SubjectGroup` data, created inline here instead of requiring a separate trip to the Subject Groups page) and (2) the existing Sections sub-block (add/remove, a stream can have zero sections — Sections are a seating/classroom division, unrelated to which Group a student is in, so they stay independent of the Groups sub-block). **Submit is blocked (frontend AND backend) if any stream has zero groups** — this is what prevents the exact gap found in review: a Stream + Sections created with no Group, which used to only surface later as `SUBJECT_GROUP_MISSING` at Admission time.

**Existing data backfill**: any already-created stream with zero groups (from before this rule existed) shows a visible warning badge on its row in this page's table ("No group — Admission is blocked until one is added") until an admin adds at least one group, either inline (editing the Class) or via the Subject Groups page.

**Delete**: selecting rows enables "Delete Selected"; confirming opens a modal stating the count and that it's irreversible, gated by typing `DELETE` before the button enables — this is the pattern for any destructive action in this app.

**Side column**: a stats card (Total Classes / Sections Created / Streams Configured / Students Enrolled) and a "Good to know" tips card (plain info rows, no interaction).

## Backend

Schema — `Class`: `adminId`, `class` (string/number, e.g. "9th"), `hasStreams` (boolean), **`order` (Number, required)** — a fixed pedagogical rank (Nursery=0, LKG=1, UKG=2, 1st=3, 2nd=4, ... 12th=14, or similar seeded scheme), not derived from creation time or alphabetical sort. If false: `sections: [{name}]`. If true: `streams: [{name, sections: [{name}]}]` — never populate both. Unique index `(adminId, class)`.

**Class ordering — a global rule, not just this page's own table.** Every Class-driven `.dd`/list/filter anywhere in the app (this page's own table, Manage Students' Class filter, Admission's Class field, Subject Groups' Class filter, any report grouped by class, etc.) sorts by `Class.order` ascending, always — never by insertion order, never alphabetically (alphabetical breaks immediately: "10th" sorts before "2nd"). This page seeds the full Nursery→12th ladder with its `order` values up front; a school that doesn't use Nursery/LKG/UKG simply never creates those `Class` documents, so they never appear — "always show Nursery to 12" means "always in that relative order when they exist," not that unused levels are force-displayed.

Delete: if any student is enrolled against this class, the confirm modal's "N class(es)" count and warning text should reflect real dependent data (fetched with the list, not a second request). **This is a hard block, not just a warning** — a Class with any dependent `StudentEnrollment` (current session) or `Student.admissionClass` (first-enrolled-class reference, historical) cannot be deleted at all; the confirm modal shows the dependent count and tells the admin to reassign/promote those students to a different class first. This mirrors `database-design-principles.md`'s hard-delete rule for configuration data ("gated by the existing type-to-confirm UI rule when dependents exist") — for Class specifically, "gated" means blocked, not merely warned, because `admissionClass`/`StudentEnrollment.classId` are real `Class._id` references (see `student/errors.md`'s `admissionClass` fix): deleting a referenced Class would otherwise leave those documents pointing at a `_id` that no longer resolves, which the app has no "unknown class" fallback UI for. A Class with zero dependents deletes normally.
