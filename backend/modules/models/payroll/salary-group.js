'use strict';
const mongoose = require('mongoose');

// v2 SalaryGroup (salary-groups.md) — a pay scale, set up once and applied to staff through
// StaffSalaryAssignment. Mongoose name 'v2-salary-group': the legacy 'salary-group'
// collection is never read or written by v2 code.
//
// Editing a group only changes the NEXT generation: every PayrollRun snapshots its own
// figures, and a person's overrides live on their assignment, never here.
const MODES = Object.freeze(['monthly', 'daily']);

const ComponentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const SalaryGroupSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    mode: { type: String, enum: MODES, default: 'monthly' },
    basic: { type: Number, required: true, min: 0 },
    hra: { type: Number, default: 0, min: 0 },
    allowances: { type: [ComponentSchema], default: [] },
    deductions: { type: [ComponentSchema], default: [] },
    // Inactive keeps the history but is not offered when assigning.
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// SALARY_GROUP_DUPLICATE — a real index (errors.md shape 9), case-insensitive.
SalaryGroupSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const SalaryGroupV2Model = mongoose.model('v2-salary-group', SalaryGroupSchema);

module.exports = SalaryGroupV2Model;
module.exports.MODES = MODES;
