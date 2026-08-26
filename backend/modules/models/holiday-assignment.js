'use strict';
const mongoose = require('mongoose');

// WHICH TEMPLATE A STAFF MEMBER OR TEACHER FOLLOWS.
//
// Students are NOT here. Their holidays come from their class, exactly as their shift does —
// see models/class-holiday-assignment.js, which mirrors models/class-shift.js. That is the
// same Roster-vs-ClassShift split the attendance pipeline already draws: assigning 2000
// students individually is not a thing any school would do, and a class is the natural unit.
//
// ONE TEMPLATE PER PERSON. The unique index below is on the person, not on
// (person, template): the Assign grid shows a single template name per row and the Edit flow
// REPLACES it, so a second template on the same person would have no way to be displayed or
// chosen between. That is also what lets bulk assign and Edit be the same $set upsert.
//
// NO ASSIGNMENT MEANS NO HOLIDAYS. A person with no row here gets an empty holiday map and a
// non-punch day stays Absent — assignment is the switch that turns holidays on, matching how
// Roster and ClassShift already gate whether someone was expected at all.
const HolidayAssignmentModel = mongoose.model('holiday-assignment', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    personType: {
        type: String,
        required: true,
        enum: ['staff', 'teacher'],
        trim: true,
    },
    personId: {
        // plain String FK -> Staff._id / Teacher._id, per repo convention
        type: String,
        required: true,
        trim: true,
    },
    templateId: {
        // plain String FK -> HolidayTemplate._id
        type: String,
        required: true,
        trim: true,
    },
    assignedAt: {
        type: Date,
        default: Date.now,
    },
});

// One template per person — see the header. Exactly the filter bulk-assign upserts on, so
// each write is a direct index hit rather than a scan. personType is part of the key because
// personId is only unique WITHIN a type: a staff member and a teacher can carry the same _id
// string across their two collections.
HolidayAssignmentModel.schema.index(
    { adminId: 1, personType: 1, personId: 1 },
    { unique: true },
);
// "How many people is this template assigned to" on the Templates tab, and the guard that
// stops a template being deleted while it is still in use.
HolidayAssignmentModel.schema.index({ adminId: 1, templateId: 1 });

module.exports = HolidayAssignmentModel;
