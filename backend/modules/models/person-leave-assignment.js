'use strict';
const mongoose = require('mongoose');

// WHO HAS BEEN GIVEN WHICH LEAVE TYPE, and how much of it they have spent.
//
// This is deliberately NOT the same thing as the balance strip on the apply form. That
// number is derived — it sums dayCount across a person's Approved requests for a year
// (controllers/leave-request.js getUsedDaysByType) and needs no row here to work. It stays
// the source of truth for whether an approval is allowed.
//
// What this collection adds is ENTITLEMENT: a school that gives 12 sick days to teaching
// staff and 6 to the office needs somewhere to record that per person, and an admin needs
// to see the whole school's allowances in one grid rather than opening people one at a
// time. `allocatedDays` is copied from LeaveType.maxDaysPerYear at assignment time on
// purpose — raising the school-wide cap next year must not silently re-write what everyone
// was already granted this year.
//
// `usedDays` is a running counter kept in step by the approve and delete handlers. It is a
// convenience for the grid, not an authority: if it ever disagrees with the aggregation,
// the aggregation is right. Nothing gates an approval on this field.
const PersonLeaveAssignmentModel = mongoose.model('person-leave-assignment', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    personType: {
        type: String,
        required: true,
        enum: ['staff', 'teacher', 'student'],
        trim: true,
    },
    personId: {
        // plain String FK -> Staff._id / Teacher._id / Student._id, per repo convention
        type: String,
        required: true,
        trim: true,
    },
    leaveTypeId: {
        // plain String FK -> LeaveType._id
        type: String,
        required: true,
        trim: true,
    },
    allocatedDays: {
        // Snapshotted from LeaveType.maxDaysPerYear when the assignment is made — see above.
        type: Number,
        default: 0,
    },
    usedDays: {
        type: Number,
        default: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// The idempotency guarantee behind bulk assign. Re-running the same selection must not
// reset anybody's usedDays back to zero, and the unique index is what makes the upsert's
// $setOnInsert the only branch a second run can take.
PersonLeaveAssignmentModel.schema.index(
    { adminId: 1, personType: 1, personId: 1, leaveTypeId: 1 },
    { unique: true },
);
// The grid read: every assignment for one school and one person type, in one scan.
PersonLeaveAssignmentModel.schema.index({ adminId: 1, personType: 1 });

module.exports = PersonLeaveAssignmentModel;
