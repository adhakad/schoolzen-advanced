'use strict';
const mongoose = require('mongoose');

// Which Shift a class follows. This is the STUDENT half of the shift resolution that
// Roster already provides for staff and teachers: models/roster.js enums personType to
// staff|teacher only, because rostering 2000 students individually per day is not a thing
// any school would do. A class is the natural unit instead — everyone in class 5 arrives at
// the same time — so one row here covers a whole cohort for every date at once.
//
// Read exactly once per reconcile job as a single find({ adminId }), which is why there is
// no date dimension: a school has a handful of classes and the mapping is stable.
const ClassShiftModel = mongoose.model('class-shift', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    class: {
        // Stored as a String even though student.class is a Number (with 200/201/202
        // standing in for NURSERY/LKG/UKG — see controllers/class.js). Every lookup
        // normalises through String() on both sides, so the two never have to agree on a
        // type. Kept as String because it arrives that way from a <mat-select> value.
        type: String,
        required: true,
        trim: true,
    },
    shiftId: {
        // plain String FK -> shift._id. No Mongoose ref, per repo convention.
        type: String,
        required: true,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// One shift per class per school. unique is what lets bulk-assign be a straight upsert
// instead of a delete-then-insert, and stops a double-submitted form producing two rows
// that the reconcile would then resolve non-deterministically.
ClassShiftModel.schema.index({ adminId: 1, class: 1 }, { unique: true });

module.exports = ClassShiftModel;
