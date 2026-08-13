'use strict';
const mongoose = require('mongoose');

const AttendanceRuleModel = mongoose.model('attendance-rule', {
    adminId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    workStart: {
        type: String, // "HH:mm", e.g. "09:00"
        required: true,
        trim: true,
    },
    lateAfter: {
        type: Number, // minutes after workStart -> status 'Late'
        required: true,
        default: 15,
    },
    halfDayAfter: {
        type: Number, // minutes after workStart -> status 'HalfDay'
        required: true,
        default: 120,
    },
    allowOvertime: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = AttendanceRuleModel;
