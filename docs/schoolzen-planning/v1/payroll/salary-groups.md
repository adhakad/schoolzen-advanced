# Payroll — Salary Groups

Status: **FINAL**
Reference: `salary-groups.html`

Pay scales set up once, then applied to staff via Assign Salary.

---

## Frontend

**Toolbar**: single row — search + Add Salary Group.

**Table**: Name (+ sub-line "N allowances · N deductions"), Mode (Per Month / Per Day), Basic, HRA, Status, Action.

**Add/Edit modal**: Name, Mode `.dd`, Basic, HRA, then dynamic add/remove lists for Allowances (name+amount pairs) and Deductions (name+amount pairs) — variable count, not fixed fields.

## Backend

Schema — `SalaryGroup`: `adminId`, `name`, `mode:'monthly'|'daily'`, `basic`, `hra`, `allowances:[{name,amount}]`, `deductions:[{name,amount}]`, `status`. Generate Payroll reads this per staff member (via their `StaffSalaryAssignment`) to compute gross (basic+hra+allowances) and net (gross−deductions, further adjusted by attendance/leave per Generate Payroll's own logic).
