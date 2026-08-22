'use strict';
const mongoose = require('mongoose');

const ShiftModel = mongoose.model('shift', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    startTime: {
        type: String, // "HH:mm" wall clock
        required: true,
        trim: true,
    },
    endTime: {
        type: String, // "HH:mm"
        required: true,
        trim: true,
    },

    // NO DEFAULTS on any of the five numeric fields below, deliberately. A default here is
    // how a school ends up running its whole attendance on numbers nobody chose — silently,
    // and only discovered when a month of payroll is already wrong. The Shift form
    // (pages/admin/shift) matches this: every field starts empty.
    //
    // REQUIRED vs OPTIONAL splits on who reads the field. earlyPunchMinutes and graceMinutes
    // are read for EVERY person type, so they stay required. The three below them are read
    // only when the person is staff or a teacher (see computeStatus in
    // services/attendance-status.js), and a shift attached to a class via ClassShift is used
    // by students alone — requiring them there forced a school running student-only
    // attendance to invent three numbers that would never be read.
    //
    // services/attendance-status.js keeps a SHIFT_DEFAULTS read-time fallback. It was written
    // for documents saved before these fields existed, and now also covers a student-only
    // shift that legitimately omits them.

    // ---- Punch-in settings -------------------------------------------------
    earlyPunchMinutes: {
        // How long BEFORE startTime an arrival punch is still an arrival. Anything earlier
        // is ignored entirely (a cleaner opening up at 05:00 is not the 09:00 shift
        // arriving four hours early).
        type: Number,
        required: true,
    },
    graceMinutes: {
        // Minutes after startTime before an arrival counts as 'Late'. The ONLY one of these
        // that applies to students — see computeStatus in services/attendance-status.js.
        type: Number,
        required: true,
    },
    halfDayAfterMinutes: {
        // STAFF/TEACHER ONLY. Minutes after startTime past which an arrival counts as
        // 'HalfDay'. Never read when the person is a student, hence optional.
        type: Number,
    },

    // ---- Punch-out settings (STAFF/TEACHER ONLY) ---------------------------
    // Students have no departure punch at all, so neither of these ever produces a value
    // for one. earlyCheckoutMinutes still matters for a student's shift indirectly: it is
    // what closes the ARRIVAL window.
    earlyCheckoutMinutes: {
        // How long BEFORE endTime a departure punch is accepted. This doubles as the end of
        // the arrival window — see services/attendance-status.js — so the two windows meet
        // exactly and no punch can be counted as both an arrival and a departure.
        type: Number,
    },
    lateCheckoutMinutes: {
        // How long AFTER endTime a departure punch is still accepted.
        type: Number,
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = ShiftModel;
