# Staff — Manage Staff

Status: **FINAL**
Reference: `manage-staff.html`

---

## Frontend

**Toolbar**: single row — search + Department `.dd` filter → Designation `.dd` (dependency-disabled until a Department is picked) + Status `.dd` (Any/Active/Inactive) + Create button.

**Table**: checkbox, Name (avatar+name), Emp Code, Department, Designation, Joining Date, Status (tag), Card (masked or "Not assigned"), Action (assign/change card, edit, delete).

**Add/Edit modal**: Name (required), Employee Code (optional — hint: "used to match this staff in bulk card-upload CSVs"), Department `.dd` → Designation `.dd` (disabled with "Select a department first" until Department chosen), Joining Date, Status `.dd`.

**Assign Card modal**: same pattern as Student's — single/bulk, Card Number + Verify Mode `.dd` (Card only / Card + PIN / Card + Fingerprint — note Staff has 3 modes, one more than Student's 2), submitting pushes straight to biometric devices.

**Delete**: warning notes it also removes login access and attendance history.

## Backend

Schema — `Staff`: `adminId`, `name`, `empCode` (optional, unique per school when present — used to match bulk CSV uploads), `departmentId`, `designationId`, `joiningDate`, `status: 'active'|'inactive'`, `cardNumber`, `verifyMode`. Delete cascades (login, attendance history) inside a transaction.

Per the R1 Staff+Teacher unification principle from earlier planning: this Staff collection is the SINGLE source for both administrative and teaching staff — no separate `Teacher` collection.

**Scale note**: compound index `(adminId, departmentId, designationId, status)` backs this page's own Department→Designation→Status filter chain. List query is `.lean()` + `.select()`'d to table columns only. A school's staff count stays in the hundreds even at large-school scale, so **offset pagination (page-number UI) is acceptable here** — unlike Manage Students, this is one of `performance-principles.md`'s named exceptions for a genuinely bounded list, not a case requiring keyset pagination.
