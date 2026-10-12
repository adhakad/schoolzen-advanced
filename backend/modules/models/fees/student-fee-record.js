'use strict';
const mongoose = require('mongoose');

// One student's fee ledger for one session — schema per fees/fees.md (`StudentFeeRecord`).
//
// The FIRST record is written by Admission in the same transaction as the student
// (student-fix4.md E, student/errors.md "Admission-time fee & concession"): it carries the
// fee structure's total and the concession fixed at admission. From then on the concession
// is Fees-module truth — the Student document's admissionFee/feesConcession are a
// write-once snapshot, never edited to change what the student owes.
//
// Paid / Due / Status are DERIVED from FeePayment records (Fees module), never stored here.
const StudentFeeRecordSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-student', required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-academic-session', required: true },
    feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-fee-structure', default: null },
    admissionFee: { type: Number, min: 0, default: 0 },
    totalFee: { type: Number, min: 0, required: true },
    concession: { type: Number, min: 0, default: 0 },
    // Required when the concession is above the school's threshold share of totalFee — the
    // audit answer to "why was this student charged so little?".
    concessionReason: { type: String, trim: true, default: null },
    // Populated by Class Promotion's carry-forward (helpers/fees/fee-promotion.js): one entry
    // per earlier session still owing money at promotion time. `amount` is that moment's
    // SNAPSHOT — what is owed now is always derived live from FeePayment allocations
    // (helpers/fees/fee-ledger.js), so a later payment can never leave it stale.
    arrears: [{
        _id: false,
        sessionId: { type: mongoose.Schema.Types.ObjectId },
        recordId: { type: mongoose.Schema.Types.ObjectId, default: null },
        amount: { type: Number, min: 0 },
    }],
    // Fee Reminder's "Gap Since Last Reminder" — written in one batched bulkWrite after a
    // send job completes, never one write per message.
    lastReminderSentAt: { type: Date, default: null },
    // The concurrency lock, nothing else: every payment / concession write $incs it on all of
    // the student's records inside its transaction, so two writers for the same student
    // conflict and one retries against the other's committed ledger (fees/errors.md shape 9).
    ledgerVersion: { type: Number, default: 0 },
    // Soft delete only — fee records are never hard-deleted. A deleted record keeps its
    // unique key and is revived (not re-inserted) if the student needs one again.
    deletedAt: { type: Date, default: null },
    createdBy: { type: String, trim: true, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

StudentFeeRecordSchema.index({ adminId: 1, studentId: 1, sessionId: 1 }, { unique: true });
StudentFeeRecordSchema.index({ adminId: 1, sessionId: 1 });
// Fee Structure's sync and its delete-in-use check.
StudentFeeRecordSchema.index({ adminId: 1, feeStructureId: 1 });

const StudentFeeRecordModel = mongoose.model('v2-student-fee-record', StudentFeeRecordSchema);

module.exports = StudentFeeRecordModel;
