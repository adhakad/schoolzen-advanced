'use strict';
const mongoose = require('mongoose');

// One row per (send job, student) — the per-recipient dedup key a WhatsApp send needs
// (fees/errors.md, data-modeling gaps): a worker retried mid-batch skips everyone whose row
// already says 'sent' instead of messaging them twice. Also what "Reminders Sent This Month"
// counts.
const FeeReminderDeliverySchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    jobKey: { type: String, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    filterId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
    reason: { type: String, default: null },
    sentAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});

FeeReminderDeliverySchema.index({ jobKey: 1, studentId: 1 }, { unique: true });
FeeReminderDeliverySchema.index({ adminId: 1, status: 1, sentAt: 1 });

const FeeReminderDeliveryModel = mongoose.model('v2-fee-reminder-delivery', FeeReminderDeliverySchema);

module.exports = FeeReminderDeliveryModel;
