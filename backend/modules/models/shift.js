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
    // and only discovered when a month of payroll is already wrong. They are all `required`
    // instead, so a create that omits one is a hard validation failure. The Shift form
    // (pages/admin/shift) matches this: every field starts empty.
    //
    // services/attendance-status.js keeps a SHIFT_DEFAULTS read-time fallback, which exists
    // ONLY for documents written before these fields did — not as a write-time default.

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
        // 'HalfDay'. Never read when the person is a student.
        type: Number,
        required: true,
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
        required: true,
    },
    lateCheckoutMinutes: {
        // How long AFTER endTime a departure punch is still accepted.
        type: Number,
        required: true,
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
