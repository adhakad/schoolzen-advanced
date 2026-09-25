# Academic Setup — Subjects

Status: **FINAL**
Reference: `subjects.html`

Flat Core/Elective master list — the pool Subject Groups picks from.

---

## Frontend

**Toolbar**: single row — search left, "+ Add Subject" primary + "Delete Selected" outline-danger right.

**Table**: checkbox, Name (Fraunces), Type (fixed-width tag: Core=brand color, Elective=warning color), Status (Active=success, Inactive=muted), Action.

**Add/Edit modal**: Name (required) + Type `.dd` (Core/Elective) + Status `.dd` (Active/Inactive).

**Delete**: same type-to-confirm pattern as Classes & Sections, warning text specifically notes "Any Subject Group that includes it will need to be updated."

## Backend

Schema — `Subject`: `adminId`, `name`, `type: 'core'|'elective'`, `status: 'active'|'inactive'`. Unique index `(adminId, name)`. Referenced by ID from Subject Groups — never embedded/copied there, so renaming here updates everywhere it's used.
