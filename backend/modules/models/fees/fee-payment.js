'use strict';
const mongoose = require('mongoose');

// One payment against a StudentFeeRecord — schema per fees/fees.md (`FeePayment`). Paid /
// Due / Status are always DERIVED by summing these, never stored on the fee record.
//
// Created here, ahead of the Fees module (08), for ONE case: an `admissionType: 'old'`
// admission — a student already studying at the school before it adopted the ERP — whose
// "Amount already paid till date" seeds the ledger (student/errors.md, admissionType). That
// is recorded as a payment with mode 'opening-balance' in the same transaction as the fee
// record, so the ledger's running paid total starts from it instead of zero, with no second
// record type. The Fees module owns every other payment.
const FeePaymentSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    studentFeeRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-student-fee-record', required: true },
    amount: { type: Number, required: true, min: 0 },
    // 'opening-balance' is the only mode written outside the Fees module.
    mode: { type: String, required: true, trim: true },
    date: { type: Date, default: Date.now },
    collectedBy: { type: String, trim: true, default: null },
    receiptNo: { type: String, trim: true, default: null },
    note: { type: String, trim: true, default: null },
    createdAt: { type: Date, default: Date.now },
});

FeePaymentSchema.index({ adminId: 1, studentFeeRecordId: 1, date: 1 });

const FeePaymentModel = mongoose.model('v2-fee-payment', FeePaymentSchema);

module.exports = FeePaymentModel;
