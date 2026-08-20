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

    // ---- Punch-in settings -------------------------------------------------
    earlyPunchMinutes: {
        // How long BEFORE startTime an arrival punch is still an arrival. Anything earlier
        // is ignored entirely (a cleaner opening up at 05:00 is not the 09:00 shift
        // arriving four hours early).
        type: Number,
        required: true,
        default: 30,
    },
    graceMinutes: {
        // Minutes after startTime before an arrival counts as 'Late'.
        type: Number,
        required: true,
        default: 10,
    },
    halfDayAfterMinutes: {
        // Minutes after startTime past which an arrival counts as 'HalfDay'.
        type: Number,
        required: true,
        default: 120,
    },

    // ---- Punch-out settings ------------------------------------------------
    earlyCheckoutMinutes: {
        // How long BEFORE endTime a departure punch is accepted. This doubles as the end of
        // the arrival window — see services/attendance-status.js — so the two windows meet
        // exactly and no punch can be counted as both an arrival and a departure.
        type: Number,
        required: true,
        default: 30,
    },
    lateCheckoutMinutes: {
        // How long AFTER endTime a departure punch is still accepted.
        type: Number,
        required: true,
        default: 60,
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
