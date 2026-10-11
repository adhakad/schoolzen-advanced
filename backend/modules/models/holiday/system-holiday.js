'use strict';
const mongoose = require('mongoose');

// The official public-holiday dataset behind "Generate from Public Holidays"
// (holiday/holidays.md). NOT tenant data: no adminId, one document per state + year,
// inserted/updated by hand in Compass — never hardcoded, never fetched from an API.
// Distinct from the legacy 'system-holiday' collection, which v2 never reads.
const SystemHolidaySchema = new mongoose.Schema({
    state: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    holidays: [{
        _id: false,
        name: { type: String, required: true, trim: true },
        date: { type: String, required: true }, // "YYYY-MM-DD"
    }],
    updatedAt: { type: Date, default: Date.now },
});

SystemHolidaySchema.index({ state: 1, year: 1 }, { unique: true });

const SystemHolidayV2Model = mongoose.model('v2-system-holiday', SystemHolidaySchema);

module.exports = SystemHolidayV2Model;
