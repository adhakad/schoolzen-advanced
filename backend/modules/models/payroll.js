'use strict';
const mongoose = require('mongoose');

// ONE STAFF MEMBER'S PAY FOR ONE MONTH — generated, reviewed, then locked.
//
// EVERYTHING IS SNAPSHOTTED. salaryGroupId, calculationMode, basic, hra, allowances and
// deductions are all copies taken at generation time, not pointers resolved at read time.
// A school that gives its primary teachers a raise in April must not find that March's
// payslips silently changed to match. The salaryGroupId is kept only so a reader can trace
// which scale produced these numbers.
//
// DAY COUNTS COME FROM services/payroll-attendance.js, which reads them through the SAME
// services/attendance-calendar.js the admin's calendar page renders. Payroll never queries
// DailyAttendance directly: 'Absent' is not stored anywhere (see the header of
// models/daily-attendance.js), it is derived from the absence of a row on an expected day,
// and a second implementation of that derivation would drift from the screen the admin is
// checking these numbers against.
//
// DRAFT -> LOCKED is one way, and deliberately awkward to reverse. Regenerating a LOCKED
// record is refused outright; unlocking is a separate confirmed action that is itself
// refused once any SalaryPayment exists against the record, because the amount cannot move
// out from under money already recorded as paid.
//
// paymentStatus is NOT a field here. It is derived at read time in controllers/payroll.js by
// summing salary-payment rows against netSalary — storing it would mean two writes that can
// disagree, and the sum is the truth.
const PayrollModel = mongoose.model('payroll', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    staffId: {
        // plain String FK -> Staff._id
        type: String,
        required: true,
        trim: true,
    },
    month: {
        // 1-12 (August = 8), NEVER JS's 0-11 — same frame as helpers/date-only.js
        // parseDateKey and models/roster.js, so nothing can drift a month between them.
        type: Number,
        required: true,
    },
    year: {
        type: Number,
        required: true,
    },

    // ---- Snapshots of how this was calculated ------------------------------
    salaryGroupId: {
        type: String,
        required: true,
        trim: true,
    },
    calculationMode: {
        // Snapshotted, not read back off the group — see the file header.
        type: String,
        enum: ['perMonth', 'perDay'],
        required: true,
        trim: true,
    },

    // ---- Attendance, as counted for this month -----------------------------
    presentDays: {
        // Present + Late + (HalfDay x 0.5). A late arrival is still a day worked — the
        // shift's graceMinutes already decided it was late rather than absent.
        type: Number,
        required: true,
    },
    absentDays: {
        // Absent + (HalfDay x 0.5).
        type: Number,
        required: true,
    },
    halfDays: {
        // The raw HalfDay count behind the 0.5 split above. Stored so the breakdown adds up
        // on screen — presentDays of 23.5 is otherwise unexplainable to whoever is checking.
        type: Number,
        default: 0,
    },
    leaveDays: {
        // PAID leave only (LeaveType.isPaid true). Costs the school nothing extra in
        // perMonth mode and is fully payable in perDay mode.
        type: Number,
        required: true,
    },
    unpaidLeaveDays: {
        // Unpaid leave. Treated exactly like an absence for pay in both modes.
        type: Number,
        required: true,
    },
    holidayDays: {
        // Declared holidays this person's HolidayTemplate covers. Always paid, in both
        // modes — they are working days the school chose to close.
        type: Number,
        required: true,
    },
    totalWorkingDays: {
        // Days in the month MINUS the days this person was not expected at all ('Off' in
        // attendance-calendar.js terms — an unrostered day, which is how a weekly off is
        // expressed here). Not a fixed "minus Sundays": a Mon-Sat staffer and a Mon-Fri one
        // legitimately get different divisors, and the roster is what knows which is which.
        type: Number,
        required: true,
    },

    // ---- The money ---------------------------------------------------------
    basic: {
        type: Number,
        required: true,
    },
    hra: {
        type: Number,
        required: true,
    },
    allowances: {
        type: [{
            name: { type: String, trim: true },
            amount: { type: Number, default: 0 },
            _id: false,
        }],
        default: [],
    },
    grossSalary: {
        // perMonth: basic + hra + sum(allowances), the full month's rate.
        // perDay:   (basic + hra + sum(allowances)) x (presentDays + leaveDays).
        type: Number,
        required: true,
    },
    deductions: {
        type: [{
            name: { type: String, trim: true },
            amount: { type: Number, default: 0 },
            _id: false,
        }],
        default: [],
    },
    attendanceDeduction: {
        // perMonth ONLY: (grossSalary / totalWorkingDays) x (absentDays + unpaidLeaveDays).
        // Always 0 in perDay mode, where attendance is already inside grossSalary and
        // deducting again would charge for the same absence twice.
        type: Number,
        default: 0,
    },
    totalDeductions: {
        type: Number,
        required: true,
    },
    netSalary: {
        type: Number,
        required: true,
    },

    // ---- Lifecycle ---------------------------------------------------------
    status: {
        type: String,
        enum: ['DRAFT', 'LOCKED'],
        default: 'DRAFT',
        trim: true,
    },
    generatedAt: {
        type: Date,
        default: Date.now,
    },
    lockedAt: {
        type: Date,
        default: null,
    },
    lockedBy: {
        type: String,
        trim: true,
        default: null,
    },
    unlockedAt: {
        // Unlocking a finalised payroll is the one action here that undoes a decision, so it
        // is attributable the same way DailyAttendance.overriddenBy is. Kept after a
        // re-lock: "this was reopened once" is exactly what an audit wants to see.
        type: Date,
        default: null,
    },
    unlockedBy: {
        type: String,
        trim: true,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// ONE payroll per staff member per month. unique makes a double-generate (two clicks, a
// single generate racing a bulk one) physically incapable of producing two rows that a
// payment could then be recorded against the wrong one of.
PayrollModel.schema.index({ adminId: 1, staffId: 1, year: 1, month: 1 }, { unique: true });
// The Generate tab's list: one school's month, optionally filtered by status.
PayrollModel.schema.index({ adminId: 1, year: 1, month: 1, status: 1 });

module.exports = PayrollModel;
