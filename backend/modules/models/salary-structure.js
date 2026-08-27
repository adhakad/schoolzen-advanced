'use strict';
const mongoose = require('mongoose');

// WHICH SALARY GROUP ONE PERSON IS ON, plus the exceptions.
//
// STAFF AND TEACHERS BOTH. They live in separate collections (models/staff.js and
// models/teacher.js) and always will — models/teacher.js is one of the two files CLAUDE.md
// forbids touching — so the link is the same personType + personId pair DailyAttendance,
// LeaveRequest, Roster and HolidayAssignment all already use. Students are absent from the
// enum on purpose: a school does not pay its pupils.
//
// The common case is a bare pointer: personId -> salaryGroupId, no overrides, and the group
// supplies every number. The override fields exist for the senior teacher on the same
// designation as everyone else but a higher basic — adjusting one person without cloning a
// whole group for them.
//
// null MEANS "NO OVERRIDE", AND ZERO DOES NOT. An overrideHra of 0 is a real decision (this
// person gets no HRA) and must survive; controllers/payroll.js therefore tests
// `=== null || === undefined`, never truthiness. Getting that wrong would silently pay
// somebody the group's HRA against the school's explicit instruction.
//
// THIS IS CURRENT ASSIGNMENT, NOT A HISTORY TABLE. One row per person, enforced by the
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
    personType: {
        type: String,
        required: true,
        enum: ['staff', 'teacher'],
        default: 'staff',
        trim: true,
    },
    personId: {
        // plain String FK -> Staff._id or Teacher._id, per repo convention (no ref/ObjectId)
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

// One current assignment per person. personType is part of the key because a staff _id and a
// teacher _id are drawn from different collections and could theoretically collide.
SalaryStructureModel.schema.index({ adminId: 1, personType: 1, personId: 1 }, { unique: true });
// controllers/salary-group.js's delete guard: "is anybody on this group?"
SalaryStructureModel.schema.index({ adminId: 1, salaryGroupId: 1 });

module.exports = SalaryStructureModel;
