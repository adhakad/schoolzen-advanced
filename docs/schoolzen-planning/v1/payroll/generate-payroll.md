# Payroll — Generate Payroll

Status: **FINAL**
Reference: `generate-payroll.html`

Run payroll for the month, then lock it once correct — locked rows feed Salary Payouts.

---

## Frontend

**Toolbar**: row1 (search + "Generate for Selected", disabled until rows checked) + row2 (Department→Designation cascade, Status `.dd` (All/Locked/Draft/Pending), month-nav).

**Table**: checkbox, Employee, Attendance (3 colored dot-counts: present/late/absent, feeding the calculation), Gross, Deductions, Net Salary, Status (tag), Action — **action set depends on status**:
- **Pending** (no run yet, e.g. no Salary Group assigned): Gross/Deductions/Net show "—"/"Not generated"; single Generate (play icon) action.
- **Draft** (generated, editable): Regenerate + Lock actions.
- **Locked** (final): "View slip" (opens in new context) + Unlock (danger — this is a real un-doing of a finalized state and should confirm before proceeding).

## Backend

Schema — `PayrollRun`: `adminId`, `staffId`, `month`, `year`, `attendanceSummary{present,late,absent}`, `gross`, `deductions`, `net`, `status:'pending'|'draft'|'locked'`. Generating reads that staff's `SalaryGroup` (Basic/HRA/etc.) and the month's `AttendanceRecord`s to compute gross/deductions — a staff member with no `SalaryGroup` assigned stays `pending` regardless of attendance. Locking is the gate that makes a run visible to Salary Payouts — a `draft` run must never appear there. Unlocking reverts to `draft` and should be logged (who unlocked, when) since it undoes a finalized state.

**"Generate for Selected" is a BullMQ background job** when the selection is large (`additional-technical-considerations.md` names this exact action) — computing gross/deductions against a month's attendance for many staff at once should never run inline inside the HTTP request. The job reads all selected staff's `SalaryGroup`+`AttendanceRecord` data with a batched query (not one query per staff member) and writes results via `bulkWrite`, never a loop of per-staff `.save()` calls.

**Mid-month generation correctness**: `totalWorkingDays` is always computed for the FULL month (1st to last date, minus weekly-offs and any Holiday dates for that person), never truncated to "days elapsed so far" — that truncation is a real calculation bug, not a style choice. For a month still in progress, remaining future dates are resolved against the existing approved-Leave map first (a future date already covered by an approved Leave counts toward `leaveDays` using that leave type's paid/unpaid flag); a future date with no leave and no holiday stays uncounted (neither present nor absent) since attendance for it hasn't happened yet. When generation runs mid-month, the response/UI carries an explicit warning: "This month is still in progress — N day(s) remain, of which M are already covered by approved leave. Attendance for the remaining days is not yet final." The run still saves as `Draft` (never blocked), with a recommendation to regenerate once the month ends and attendance is final.
