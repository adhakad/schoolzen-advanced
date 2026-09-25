# Settings — Academic Sessions

Status: **FINAL**
Reference: `academic-sessions.html`

The school year every new record (admission, attendance, fee, payroll) is saved against. Only one session is Active at a time.

---

## Frontend

**Table**: Session, Start Date, End Date, Status (Active/Closed/Upcoming chip), Action — action differs by status: Active shows only "Currently active" text (no action); Closed shows a read-only view icon; Upcoming shows "Set as Active" + delete.

**Create Session modal**: label + start/end date → creates as **Upcoming** (never immediately active) → an optional "copy forward" checklist (Fee Structure, Marksheet+Admit Card Structure, Salary Groups, Holiday Templates — configuration only, never student placements or financial records; Class Promotion remains a separate explicit step).

**Set as Active modal**: heavy warning — this changes where EVERY new record across the whole app saves, for every user, immediately; the previous session becomes Closed (still fully browsable read-only, nothing deleted). Gated by typing the session label itself (e.g. "2027-28") to confirm — a session-specific type-to-confirm, not the generic "DELETE".

## Backend

Schema — `AcademicSession`: `adminId`, `label`, `startDate`, `endDate`, `status:'active'|'closed'|'upcoming'`. Exactly one `active` per `adminId` — enforce with a transaction that flips the old active to closed and the new one to active atomically, never two separate writes. "Copy forward" duplicates the named configuration documents (Fee Structure, Marksheet/Admit Card Structure, Salary Groups, Holiday Templates) with the new session's ID, never referencing the old session's documents by pointer.
