'use strict';
const mongoose = require('mongoose');

// Monthly snapshot — one document per (adminId + personType + personId + year + month).
// days: Map<"YYYY-MM-DD", shiftId> — O(1) day lookup, zero per-day DB calls.
const RosterModel = mongoose.model('roster', {
    adminId:    { type: String, required: true, trim: true },
    personType: { type: String, required: true, enum: ['staff', 'teacher'], trim: true },
    personId:   { type: String, required: true, trim: true },   // FK -> staff._id / teacher._id
    year:       { type: Number, required: true },
    month:      { type: Number, required: true, min: 1, max: 12 }, // 1-12 (August = 8), NOT JS 0-11
    days:       { type: Map, of: String, default: {} },            // { "2026-08-01": shiftId }
    createdAt:  { type: Date, default: Date.now },
    updatedAt:  { type: Date, default: Date.now },
});

// Primary: one doc per person per month (uniqueness + main read path)
RosterModel.schema.index(
    { adminId: 1, personType: 1, personId: 1, year: 1, month: 1 },
    { unique: true }
);
// Secondary: fetch all persons for a school+month in one scan
RosterModel.schema.index({ adminId: 1, personType: 1, year: 1, month: 1 });

module.exports = RosterModel;