'use strict';
const mongoose = require('mongoose');

// One payment against a StudentFeeRecord — schema per fees/fees.md (`FeePayment`). Paid /
// Due / Status are always DERIVED by summing these, never stored on the fee record.
//
// Admission writes ONE kind: an `admissionType: 'old'` admission's "Amount already paid till
// date" (mode 'opening-balance', student/errors.md), which carries no `allocations` and so
// counts against its own record. Every other payment comes from the Fees module's Collect,
// whose `allocations` say exactly which session's due each rupee cleared — oldest first
// (helpers/fees/fee-ledger.js allocateOldestFirst).
const FeePaymentSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    studentFeeRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-student-fee-record', required: true },
    amount: { type: Number, required: true, min: 0 },
    // 'cash' | 'online' | 'cheque' from Collect; 'opening-balance' from Admission only.
    mode: { type: String, required: true, trim: true },
    date: { type: Date, default: Date.now },
    collectedBy: { type: String, trim: true, default: null },
    receiptNo: { type: String, trim: true, default: null },
    note: { type: String, trim: true, default: null },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-student', default: null },
    sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    collectedByName: { type: String, trim: true, default: null },
    // Where the amount went: [{ sessionId, recordId, amount }], oldest session first.
    allocations: [{
        _id: false,
        sessionId: { type: mongoose.Schema.Types.ObjectId },
        recordId: { type: mongoose.Schema.Types.ObjectId },
        amount: { type: Number, min: 0 },
    }],
    // The client's Idempotency-Key — the database-level backstop behind the middleware.
    idempotencyKey: { type: String, trim: true, default: null },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});

FeePaymentSchema.index({ adminId: 1, studentFeeRecordId: 1, date: 1 });
FeePaymentSchema.index({ adminId: 1, studentId: 1 });
FeePaymentSchema.index({ adminId: 1, date: 1 });
// An atomic sequence makes these unique by construction; the index makes a collision loud.
FeePaymentSchema.index({ adminId: 1, receiptNo: 1 }, { unique: true, partialFilterExpression: { receiptNo: { $type: 'string' } } });
FeePaymentSchema.index({ adminId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

const FeePaymentModel = mongoose.model('v2-fee-payment', FeePaymentSchema);

module.exports = FeePaymentModel;
