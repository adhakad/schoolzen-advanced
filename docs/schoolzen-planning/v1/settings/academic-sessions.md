# Settings — Academic Sessions

Status: **FINAL**
Reference: `academic-sessions.html`

The school year every new record (admission, attendance, fee, payroll) is saved against. Only one session is Active at a time.

---

## Frontend

**Table**: Session, Start Date, End Date, Status (Active/Closed/Upcoming chip), Action — action differs by status: Active shows only "Currently active" text (no action); Closed shows a read-only view icon; Upcoming shows "Set as Active" + delete.

**Create Session modal**: label + start/end date → creates as **Upcoming** (never immediately active) → an optional "copy forward" checklist (Fee Structure, Marksheet+Admit Card Structure, Salary Groups, Holiday Templates — configuration only, never student placements or financial records; Class Promotion remains a separate explicit step).

**Set as Active modal**: heavy warning — this changes where EVERY new record across the whole app saves, for every user, immediately; the previous session becomes Closed (still fully browsable read-only, nothing deleted). Gated by typing the session label itself (e.g. "2027-2028" — session labels are always the full start-end year format, see `backend/modules/helpers/academic-session-format.js`) to confirm — a session-specific type-to-confirm, not the generic "DELETE".

## Backend

Schema — `AcademicSession`: `adminId`, `label`, `startDate`, `endDate`, `status:'active'|'closed'|'upcoming'`, `isLocked` (bool), `createdBy`. Exactly one `active` per `adminId` — enforce with a transaction that flips the old active to closed and the new one to active atomically, never two separate writes. "Copy forward" duplicates the named configuration documents (Fee Structure, Marksheet/Admit Card Structure, Salary Groups, Holiday Templates) with the new session's ID, never referencing the old session's documents by pointer.

**`label` is server-computed, never free-typed.** It's derived as
`` `${startDate.getFullYear()}-${endDate.getFullYear()}` `` at Create
time (e.g. `"2026-2027"`) — the Create modal takes only start/end
dates as input; there is no free-text label field to type into, which
removes the entire class of typo/format bugs (`"2026-27"`, a
mismatched or out-of-range year) at the source instead of catching
them with a regex after the fact. `academic-session-format.js` becomes
this one derivation function, not a validator for a user-typed string.

**`isLocked` flips to `true` the first time any other collection
writes a record against this session** (first Attendance mark, first
FeesCollection entry, first Payroll run, etc. — a lightweight hook,
not a heavy scan). Once locked, `startDate`/`endDate` become
immutable — changing the date range after real records exist against
it would silently misdate historical data. `label`/`status` can still
change through the normal Set-Active/Close flow; only the date range
locks.

**Every OTHER module's `session` field is a reference
(`AcademicSession._id`), never a copy of the label string.** A record
that stores `"2026-2027"` as plain text instead of the session's id
has no referential integrity — renaming a session, or the (now
practically impossible, but historically real) label-typo case, would
silently orphan every record that copied the string instead of
pointing at it. Any module found storing the raw label string on its
own documents (Student's `admissionSession`/`session` included — see
`v1/student/errors.md`) needs a migration to the real reference, not
a one-off string fix.
