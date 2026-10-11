'use strict';
const mongoose = require('mongoose');

// A school's holiday — one dated range (holiday/holidays.md). Templates reference these by
// id; a person's calendar is always computed from the CURRENT rows, never a copy.
//
// NOT models/holiday.js: that is the legacy collection, which no v2 code reads or writes.
// Dates are "YYYY-MM-DD" keys, the same date-only convention as Leave and Attendance.
const HolidaySchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    startDateKey: { type: String, required: true },
    endDateKey: { type: String, required: true },
    // 'auto' = cloned by "Generate from Public Holidays"; editable like any manual row.
    source: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// The duplicate rule (errors.md shape 2/9): same name, case-insensitively, on the same start.
HolidaySchema.index({ adminId: 1, name: 1, startDateKey: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
HolidaySchema.index({ adminId: 1, startDateKey: 1, endDateKey: 1 });

const HolidayV2Model = mongoose.model('v2-holiday', HolidaySchema);

module.exports = HolidayV2Model;
