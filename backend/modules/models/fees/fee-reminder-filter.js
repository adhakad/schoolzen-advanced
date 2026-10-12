'use strict';
const mongoose = require('mongoose');

// A saved Fee Reminder filter — schema per fees/fee-reminder.md. Only the DEFINITION is
// stored: who it matches is re-resolved live against the ledger on every preview and send,
// never kept as a recipient list. null on a threshold = "No filter".
const FeeReminderFilterSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'academic-class', required: true },
    paidBelowPercent: { type: Number, min: 0, max: 100, default: null },
    noPaymentSinceDays: { type: Number, min: 0, default: null },
    gapSinceLastReminderDays: { type: Number, min: 0, default: null },
    deletedAt: { type: Date, default: null },
    createdBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
});

FeeReminderFilterSchema.index({ adminId: 1, deletedAt: 1, createdAt: -1 });

const FeeReminderFilterModel = mongoose.model('v2-fee-reminder-filter', FeeReminderFilterSchema);

module.exports = FeeReminderFilterModel;
