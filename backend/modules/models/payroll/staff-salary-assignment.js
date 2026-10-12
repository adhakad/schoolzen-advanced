'use strict';
const mongoose = require('mongoose');

// v2 StaffSalaryAssignment (assign-salary.md) — puts one staff member on a SalaryGroup.
// One row per person; Change rewrites it.
//
// `overrides` deviate from the group for THIS person only. Each field is null unless set:
// null = "use the group's value", 0 / [] = "this person gets none" — a different
// instruction. Generate Payroll MERGES group defaults with whichever fields are present
// (helpers/payroll/payroll-rules.js resolveEffectiveSalary), so editing the group's rates
// never overwrites someone's personal override.
const ComponentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const StaffSalaryAssignmentSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    staffId: { type: String, required: true, trim: true },
    salaryGroupId: { type: String, required: true, trim: true },
    // Calendar "YYYY-MM-DD" (helpers/date-only.js). A month ending before it has no payroll.
    effectiveFrom: { type: String, required: true },
    overrides: {
        basic: { type: Number, min: 0, default: null },
        hra: { type: Number, min: 0, default: null },
        allowances: { type: [ComponentSchema], default: null },
        deductions: { type: [ComponentSchema], default: null },
    },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

StaffSalaryAssignmentSchema.index({ adminId: 1, staffId: 1 }, { unique: true });
// Salary Group delete's in-use count.
StaffSalaryAssignmentSchema.index({ adminId: 1, salaryGroupId: 1 });

const StaffSalaryAssignmentV2Model = mongoose.model('v2-staff-salary-assignment', StaffSalaryAssignmentSchema);

module.exports = StaffSalaryAssignmentV2Model;
