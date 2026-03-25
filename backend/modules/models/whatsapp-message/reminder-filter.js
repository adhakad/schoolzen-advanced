'use strict';
const mongoose = require('mongoose');

const ReminderLogsModel = mongoose.model('reminder-filter', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    class: {
        type: Number,
        required: true,
        trim: true
    },
    minPercentage: {
        type: Number,
        required: true,
        trim: true
    },
    lastPaymentDays: {
        type: Number,
        required: true,
        trim: true
    },
    lastReminderDays: {
        type: Number,
        required: true,
        trim: true
    },
    paymentLastDate: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = ReminderLogsModel;
