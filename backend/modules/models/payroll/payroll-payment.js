'use strict';
const mongoose = require('mongoose');

// v2 PayrollPayment (salary-payouts.md) — money recorded against a LOCKED PayrollRun.
//
// A recorded payment sits `pending` until the employee confirms it (24h window), so a
// one-sided "I paid" is never treated as settled. A run's Unpaid / Partial / Full is DERIVED
// from summing `confirmed` payments against its net — there is no stored payout status.
// One document is the whole story: who recorded it, who confirmed it, and when.
const MODES = Object.freeze(['bank', 'cash', 'upi']);
const CONFIRMATION = Object.freeze(['pending', 'confirmed', 'disputed', 'expired']);
const CONFIRM_WINDOW_MS = 24 * 60 * 60 * 1000;

const PayrollPaymentSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    payrollRunId: { type: String, required: true, trim: true },
    staffId: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    amountPaid: { type: Number, required: true, min: 0.01 },
    mode: { type: String, enum: MODES, required: true },
    reference: { type: String, trim: true, default: null },
    // Calendar "YYYY-MM-DD" the money moved.
    date: { type: String, required: true },
    paidBy: { type: String, default: null },
    paidByName: { type: String, default: null },
    confirmationStatus: { type: String, enum: CONFIRMATION, default: 'pending' },
    confirmationRequestedAt: { type: Date, default: Date.now },
    confirmationExpiresAt: { type: Date, required: true },
    confirmedAt: { type: Date, default: null },
    confirmedByDeviceInfo: { type: mongoose.Schema.Types.Mixed, default: null },
    disputeReason: { type: String, trim: true, default: null },
    // Razorpay-Route-ready (design only — nothing reads or writes these yet).
    payoutMode: { type: String, enum: ['manual', 'automated'], default: 'manual' },
    payoutGatewayId: { type: String, default: null },
    payoutStatus: { type: String, enum: ['pending', 'processing', 'success', 'failed', null], default: null },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

PayrollPaymentSchema.index({ adminId: 1, payrollRunId: 1 });
// The hourly expiry sweep.
PayrollPaymentSchema.index({ confirmationStatus: 1, confirmationExpiresAt: 1 });

const PayrollPaymentV2Model = mongoose.model('v2-payroll-payment', PayrollPaymentSchema);

module.exports = PayrollPaymentV2Model;
module.exports.MODES = MODES;
module.exports.CONFIRMATION = CONFIRMATION;
module.exports.CONFIRM_WINDOW_MS = CONFIRM_WINDOW_MS;
