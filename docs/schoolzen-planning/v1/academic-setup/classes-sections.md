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
- **Off**: one Sections block — add/remove rows (`+`/`×`), a flat list.
- **On**: a Streams block (add/remove rows) PLUS one independent Sections sub-block per stream, each with its own add/remove — a stream can have zero sections.

**Delete**: selecting rows enables "Delete Selected"; confirming opens a modal stating the count and that it's irreversible, gated by typing `DELETE` before the button enables — this is the pattern for any destructive action in this app.

**Side column**: a stats card (Total Classes / Sections Created / Streams Configured / Students Enrolled) and a "Good to know" tips card (plain info rows, no interaction).

## Backend

Schema — `Class`: `adminId`, `class` (string/number, e.g. "9th"), `hasStreams` (boolean). If false: `sections: [{name}]`. If true: `streams: [{name, sections: [{name}]}]` — never populate both. Unique index `(adminId, class)`.

Delete: if any student is enrolled against this class, the confirm modal's "N class(es)" count and warning text should reflect real dependent data (fetched with the list, not a second request) before allowing the type-to-confirm delete.
