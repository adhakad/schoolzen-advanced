'use strict';
const mongoose = require('mongoose');

// WHICH TEMPLATE A CLASS FOLLOWS — the STUDENT half of holiday assignment.
//
// A direct parallel of models/class-shift.js, for the same reason that file gives: assigning
// 2000 students individually is not a thing any school would do, and a class is the natural
// unit — everyone in class 5 gets the same Diwali break. One row here covers a whole cohort.
// models/holiday-assignment.js is the staff/teacher twin.
//
// Read once per reconcile job as a single find({ adminId }), which is why there is no date
// dimension: the mapping is stable and the DATES live in the template's holidays.
const ClassHolidayAssignmentModel = mongoose.model('class-holiday-assignment', {
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
        // Same note as models/class-shift.js.
        type: String,
        required: true,
        trim: true,
    },
    templateId: {
        // plain String FK -> HolidayTemplate._id. No Mongoose ref, per repo convention.
        type: String,
        required: true,
        trim: true,
    },
    assignedAt: {
        type: Date,
        default: Date.now,
    },
});

// One template per class per school. unique is what lets bulk-assign be a straight upsert
// instead of a delete-then-insert, and stops a double-submitted form producing two rows the
// lookup would then resolve non-deterministically.
ClassHolidayAssignmentModel.schema.index({ adminId: 1, class: 1 }, { unique: true });
// The template's assigned-count and its delete guard read both assignment collections.
ClassHolidayAssignmentModel.schema.index({ adminId: 1, templateId: 1 });

module.exports = ClassHolidayAssignmentModel;
