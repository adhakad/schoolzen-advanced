'use strict';
const mongoose = require('mongoose');

// v2 Shift (manage-shifts.md) — the punch window, grace and half-day/late rules Overview and
// Roster both read from. Mongoose name 'v2-shift': the legacy 'shift' collection is never
// read or written by v2 code.
//
// Times are wall-clock "HH:mm" (24h) strings, compared through helpers/attendance-time.js.
// The three staff-only minutes are null for a class-only shift — a student's day is decided
// by the arrival punch alone.
const ShiftSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    earlyInMinutes: { type: Number, min: 0, default: 0 },
    graceMinutes: { type: Number, min: 0, default: 0 },
    halfDayAfterMinutes: { type: Number, min: 0, default: null },
    earlyOutMinutes: { type: Number, min: 0, default: null },
    lateOutMinutes: { type: Number, min: 0, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// SHIFT_DUPLICATE — a real index (errors.md shape 9), case-insensitive.
ShiftSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const ShiftV2Model = mongoose.model('v2-shift', ShiftSchema);

module.exports = ShiftV2Model;
