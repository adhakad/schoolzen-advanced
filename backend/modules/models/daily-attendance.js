'use strict';
const mongoose = require('mongoose');

// One row per person per date — the calendar-facing summary, computed by the reconcile
// worker from PunchLog.
//
// IMPORTANT — rows are written ONLY for people who actually punched (or who have a
// Holiday/Leave override on a day they punched). "No row on a working day" MEANS Absent
// and is derived at read time by services/attendance-calendar.js. At 2M students,
// materialising an Absent row per person per day would be ~60M mostly-empty rows a month;
// this way writes stay proportional to actual attendance.
const DailyAttendanceModel = mongoose.model('daily-attendance', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    personType: {
        type: String,
        required: true,
        enum: ['student', 'teacher', 'staff'],
        trim: true,
    },
    personId: {
        type: String,
        required: true,
        trim: true,
    },
    date: {
        // UTC midnight — the calendar day, never an instant.
        type: Date,
        required: true,
    },
    status: {
        type: String,
        required: true,
        enum: ['Present', 'Absent', 'HalfDay', 'Late', 'Leave', 'Holiday'],
        trim: true,
    },
    firstIn: {
        // Earliest punch of the day. Kept even on Holiday/Leave rows — payroll needs the
        // facts, and an admin needs to see that people punched on a declared holiday.
        type: Date,
        default: null,
    },
    lastOut: {
        // Latest punch of the day, or null when there was only ONE punch — a lone punch is
        // an arrival, not a departure, and pairing it with itself would render a
        // zero-minute working day.
        type: Date,
        default: null,
    },
    punchCount: {
        // Supports multiple in/out punches per day (lunch breaks, multi-shift), rather
        // than the single in/out limit the reference project had.
        type: Number,
        default: 0,
    },
    lateByMinutes: {
        // Signed: negative means an early arrival. null when no baseline could be resolved.
        type: Number,
        default: null,
    },
    expectedStart: {
        // The shift's "HH:mm" startTime as it was when this row was computed. Persisted so a
        // status can still be explained after the fact if the shift is later re-timed.
        type: String,
        trim: true,
    },
    shiftId: {
        // Always set — a row only exists because a shift was resolved for the person.
        // Staff/teacher get theirs from Roster, students from ClassShift.
        type: String,
        trim: true,
        default: null,
    },
    holidayId: {
        type: String,
        trim: true,
        default: null,
    },
    leaveRequestId: {
        type: String,
        trim: true,
        default: null,
    },
    source: {
        type: String,
        enum: ['WDMS', 'MANUAL'],
        default: 'WDMS',
        trim: true,
    },
    isOverridden: {
        // Set by the manual-entry endpoint. Reconcile filters on `isOverridden: { $ne:
        // true }`, so a hand-corrected row is literally unmatchable by the worker and can
        // never be clobbered by a later sync.
        type: Boolean,
        default: false,
    },
    overriddenBy: {
        type: String,
        trim: true,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// This single index serves BOTH the reconcile upsert filter and the calendar read
// (equality, equality, equality, range on date) — the optimal prefix shape for both.
// unique makes a concurrent double-reconcile physically incapable of duplicating a row.
DailyAttendanceModel.schema.index(
    { adminId: 1, personType: 1, personId: 1, date: 1 },
    { unique: true },
);
// School-day dashboard ("how many Late today") and payroll's month scan. status last so a
// count-by-status is answered from the index alone.
DailyAttendanceModel.schema.index({ adminId: 1, date: 1, status: 1 });

module.exports = DailyAttendanceModel;
