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
        type: String, // "HH:mm", same format as AttendanceRule.workStart
        required: true,
        trim: true,
    },
    endTime: {
        type: String, // "HH:mm"
        required: true,
        trim: true,
    },
    graceMinutes: {
        // Per-shift equivalent of AttendanceRule.lateAfter — minutes after startTime
        // before a punch counts as 'Late'. Preferred over the school-wide rule when a
        // roster row exists for the person/date.
        type: Number,
        required: true,
        default: 10,
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
