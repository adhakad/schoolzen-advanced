'use strict';
const mongoose = require('mongoose');

const MessageLogSchema = {
    _id: false,
    requestId: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed'],
        default: 'sent'
    },
    sentAt: {
        type: Date
    },
    deliveredAt: {
        type: Date
    },
    readAt: {
        type: Date
    }
};

const FeesConfirmationLogsModel = mongoose.model('fees-confirmation-logs', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    studentId: {
        type: String,
        required: true,
        trim: true
    },
    logs: {
        type: [MessageLogSchema],
        default: []
    },
    lastMessageSentAt: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});
module.exports = FeesConfirmationLogsModel;
