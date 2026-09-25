# Staff — Departments

Status: **FINAL**
Reference: `departments.html`

Simple CRUD list — Name, Status (tag), Action. Toolbar: search + Create, no filters. Add/Edit modal: Name + Status `.dd`. Same delete pattern as everywhere (type-to-confirm when in use by staff, per the shared confirm-overlay pattern).

## Backend
Schema — `Department`: `adminId`, `name`, `status:'active'|'inactive'`. Referenced by `Staff.departmentId` and `Designation.departmentId`.
