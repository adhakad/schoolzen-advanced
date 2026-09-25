# Staff — Designations

Status: **FINAL**
Reference: `designations.html`

---

## Frontend

**Toolbar**: search + Create (row1), Department `.dd` filter (its own row).

**Table**: Title, Department (or "Not set" muted — Department is genuinely optional here), Status (tag), Action.

**Add/Edit modal**: Title (required) + Department `.dd` (includes a "-- None --" option — a designation can stand alone) + Status `.dd`.

**Delete**: type-to-confirm when the designation is currently assigned to staff (`data-linked` flag on the row signals this).

## Backend
Schema — `Designation`: `adminId`, `title`, `departmentId` (nullable), `status`. Delete checks `Staff` for any reference before allowing without confirmation.
