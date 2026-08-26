'use strict';
const mongoose = require('mongoose');

// A NAMED BUNDLE OF HOLIDAYS — "Green Valley School Holidays 2026".
//
// Templates exist because holidays are not assigned one at a time: a school declares its
// year once and then hands the whole list to people. Assignment (models/holiday-assignment.js
// and models/class-holiday-assignment.js) always points at a template, never at a Holiday, so
// adding a holiday to the year is one edit here rather than a re-assign for every person.
//
// holidayIds are plain String FKs -> Holiday._id, per repo convention. controllers/holiday.js
// DeleteHoliday $pulls a deleted id out of every template that carries it, so a template can
// never point at a holiday that no longer exists.
const HolidayTemplateModel = mongoose.model('holiday-template', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    holidayIds: {
        type: [String],
        default: [],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Two templates called "School Holidays 2026" in one school would make the assign dropdown
// unusable. Unique per school, not globally — every school names its own.
HolidayTemplateModel.schema.index({ adminId: 1, name: 1 }, { unique: true });

module.exports = HolidayTemplateModel;
