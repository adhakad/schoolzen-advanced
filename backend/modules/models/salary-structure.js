'use strict';
const mongoose = require('mongoose');

// WHICH SALARY GROUP ONE STAFF MEMBER IS ON, plus the exceptions.
//
// The common case is a bare pointer: staffId -> salaryGroupId, no overrides, and the group
// supplies every number. The override fields exist for the senior teacher on the same
// designation as everyone else but a higher basic — adjusting one person without cloning a
// whole group for them.
//
// null MEANS "NO OVERRIDE", AND ZERO DOES NOT. An overrideHra of 0 is a real decision (this
// person gets no HRA) and must survive; controllers/payroll.js therefore tests
// `=== null || === undefined`, never truthiness. Getting that wrong would silently pay
// somebody the group's HRA against the school's explicit instruction.
//
// THIS IS CURRENT ASSIGNMENT, NOT A HISTORY TABLE. One row per staff member, enforced by the
// unique index below; re-assigning overwrites in place and effectiveFrom records when the
// current arrangement started. A full effective-dated history (several rows per person, the
// right one picked by payroll month) is a bigger design and is not what this phase's UI
// describes — the Assign table shows one group per row, or "Not assigned".
const SalaryStructureModel = mongoose.model('salary-structure', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    staffId: {
        // plain String FK -> Staff._id, per repo convention (no Mongoose ref/ObjectId)
        type: String,
        required: true,
        trim: true,
    },
    salaryGroupId: {
        // plain String FK -> SalaryGroup._id
        type: String,
        required: true,
        trim: true,
    },
    effectiveFrom: {
        type: Date,
        required: true,
    },

    // ---- Per-person overrides. null everywhere is the normal case. ----------
    overrideBasic: {
        type: Number,
        default: null,
    },
    overrideHra: {
        type: Number,
        default: null,
    },
    overrideAllowances: {
        // REPLACES the group's whole allowance list when set, never merges with it. Merging
        // would make "remove the transport allowance for this one person" inexpressible.
        // null (not []) means "use the group's" — an empty array means "this person gets
        // none", which is a different instruction.
        type: [{
            name: { type: String, trim: true },
            amount: { type: Number, default: 0 },
            _id: false,
        }],
        default: null,
    },
    overrideDeductions: {
        // Same replace-not-merge rule as overrideAllowances above.
        type: [{
            name: { type: String, trim: true },
            amount: { type: Number, default: 0 },
            _id: false,
        }],
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// One current assignment per staff member. unique makes a double-assign (two clicks, two
// tabs, a bulk assign racing a single one) physically incapable of leaving two rows that
// payroll would then have to choose between.
SalaryStructureModel.schema.index({ adminId: 1, staffId: 1 }, { unique: true });
// controllers/salary-group.js's delete guard: "is anybody on this group?"
SalaryStructureModel.schema.index({ adminId: 1, salaryGroupId: 1 });

module.exports = SalaryStructureModel;
