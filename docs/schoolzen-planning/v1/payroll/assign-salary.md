# Payroll — Assign Salary

Status: **FINAL**
Reference: `assign-salary.html`

Puts staff on a pay scale — no scale means no payroll for them.

---

## Frontend

**Toolbar**: search + "Assign to Selected" (bulk) + Department→Designation cascade.

**Table**: checkbox, Name, Assigned Group (mode tag alongside; "Has a personal override" warning note if this person's rate deviates from their group's standard figures) or "Not assigned", Effective From, Action (Assign if unset / Change if set — label and icon differ accordingly).

**Assign/Change modal**: Salary Group `.dd` + Effective From date + optional per-field overrides (Basic/HRA/allowances/deductions) that deviate from the group default for this one person.

## Backend

Schema — `StaffSalaryAssignment`: `adminId`, `staffId`, `salaryGroupId`, `effectiveFrom`, `overrides:{basic?,hra?,allowances?,deductions?}` (only present fields override the group's values — Generate Payroll must merge group-defaults with any override fields, not replace wholesale). Bulk assign is one `bulkWrite`.
