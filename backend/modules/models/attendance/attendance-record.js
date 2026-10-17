'use strict';
const mongoose = require('mongoose');

// v2 AttendanceRecord (attendance-overview.md) — ONE document per person per day, with that
// day's punches in `punches[]`. Never one document per punch event. Written only by the
// reconcile worker (slow path) and by a manual correction; the fast path writes PunchLog.
//
// Mongoose name 'v2-attendance-record' — the legacy 'daily-attendance' is never touched.
// Holiday / Leave / WeeklyOff are the non-working days of services/calendar/working-day.js.
const STATUSES = Object.freeze(['Present', 'Late', 'HalfDay', 'Absent', 'Leave', 'Holiday', 'WeeklyOff']);
const PERSON_TYPES = Object.freeze(['staff', 'student']);

const AttendanceRecordSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    personType: { type: String, enum: PERSON_TYPES, required: true },
    personId: { type: String, required: true, trim: true },
    // The calendar day at UTC midnight (helpers/date-only.js), plus its "YYYY-MM-DD" key.
    date: { type: Date, required: true },
    dateKey: { type: String, required: true },
    punches: [{
        _id: false,
        // School wall clock expressed as UTC (helpers/attendance-time.js).
        time: { type: Date, required: true },
        type: { type: String, enum: ['in', 'out'], required: true },
    }],
    status: { type: String, enum: STATUSES, required: true },
    inTime: { type: Date, default: null },
    outTime: { type: Date, default: null },
    shiftId: { type: String, default: null },
    // Where today's status came from. 'device' = reconciled from punches; 'manual' = marked
    // by hand (Present / Late / Absent, never a punch); 'system' = decided without either
    // (an end-of-day Absent, a holiday, a leave, a weekly off).
    source: { type: String, enum: ['device', 'manual', 'system'], default: 'system' },
    // A manual mark's SERVER time (never the browser's) and who made it.
    markedAt: { type: Date, default: null },
    markedBy: { type: String, default: null },
    // A correction that wins over every later reconcile of the same day (a leave's own marks).
    // A manual mark does NOT set this: a device punch for the day always wins over it.
    isOverridden: { type: Boolean, default: false },
    remark: { type: String, trim: true, default: null },
    // Soft delete — attendance is a historical record (database-design-principles.md).
    deletedAt: { type: Date, default: null },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// A re-delivered sync merges into the same day's row instead of duplicating it.
AttendanceRecordSchema.index({ adminId: 1, personType: 1, personId: 1, date: 1 }, { unique: true });
// The month grid: one school, one person type, a date range.
AttendanceRecordSchema.index({ adminId: 1, personType: 1, date: 1 });

const AttendanceRecordV2Model = mongoose.model('v2-attendance-record', AttendanceRecordSchema);

module.exports = AttendanceRecordV2Model;
module.exports.STATUSES = STATUSES;
module.exports.PERSON_TYPES = PERSON_TYPES;
