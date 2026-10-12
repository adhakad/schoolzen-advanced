'use strict';
const mongoose = require('mongoose');

// v2 PayrollRun (generate-payroll.md) — one staff member's payroll for one month.
//
// Status: draft (generated, editable) → locked (final). "Pending" is never stored: it is a
// staff member with NO run for the month. Only a `locked` run is visible on Salary Payouts.
// Every transition is a conditional write on the current status (errors.md shape 9).
//
// The run SNAPSHOTS its full salary composition at generation time, so editing a Salary
// Group or an assignment afterwards never changes a payslip already generated.
const STATUSES = Object.freeze(['draft', 'locked']);

const ComponentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
}, { _id: false });

const PayrollRunSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    staffId: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    // 1-12, never JS's 0-11.
    month: { type: Number, required: true, min: 1, max: 12 },
    status: { type: String, enum: STATUSES, default: 'draft' },
    // Snapshot
    salaryGroupId: { type: String, required: true },
    salaryGroupName: { type: String, default: null },
    mode: { type: String, enum: ['monthly', 'daily'], required: true },
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    allowances: { type: [ComponentSchema], default: [] },
    deductions: { type: [ComponentSchema], default: [] },
    attendanceSummary: {
        present: { type: Number, default: 0 },
        late: { type: Number, default: 0 },
        halfDay: { type: Number, default: 0 },
        absent: { type: Number, default: 0 },
        paidLeave: { type: Number, default: 0 },
        unpaidLeave: { type: Number, default: 0 },
        holiday: { type: Number, default: 0 },
        weeklyOff: { type: Number, default: 0 },
        workingDays: { type: Number, default: 0 },
        remainingDays: { type: Number, default: 0 },
        remainingCoveredByLeave: { type: Number, default: 0 },
    },
    gross: { type: Number, default: 0 },
    attendanceDeduction: { type: Number, default: 0 },
    deductionTotal: { type: Number, default: 0 },
    net: { type: Number, default: 0 },
    generatedAt: { type: Date, default: null },
    generatedBy: { type: String, default: null },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    unlockedAt: { type: Date, default: null },
    unlockedBy: { type: String, default: null },
    // Soft delete only — a payroll record is history (database-design-principles.md).
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Regenerate always upserts onto this key — never a second run for the same person-month.
PayrollRunSchema.index({ adminId: 1, staffId: 1, year: 1, month: 1 }, { unique: true });
// The month's table and the Payouts list (locked only).
PayrollRunSchema.index({ adminId: 1, year: 1, month: 1, status: 1 });
// Salary Group delete's history count.
PayrollRunSchema.index({ adminId: 1, salaryGroupId: 1 });

const PayrollRunV2Model = mongoose.model('v2-payroll-run', PayrollRunSchema);

module.exports = PayrollRunV2Model;
module.exports.STATUSES = STATUSES;
