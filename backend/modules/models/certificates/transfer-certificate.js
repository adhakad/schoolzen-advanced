'use strict';
const mongoose = require('mongoose');

// An issued Transfer Certificate (certificates/generate-tc.md). Everything printed is a
// SNAPSHOT taken at issue time — serial number included — and a reprint renders this
// document, never the live Student record.
//
// Issuing never deletes or changes the Student (the legacy hard-delete is not ported —
// certificates/errors.md shape 6). Cancelling keeps the document (status 'cancelled') and
// its serial, so a number is never handed out twice.
const REASONS = Object.freeze(['transfer', 'relocation', 'admission', 'other']);
const CONDUCTS = Object.freeze(['good', 'satisfactory', 'excellent']);

const TransferCertificateSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-student', required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-academic-session', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'student-enrollment', required: true },
    serialNumber: { type: String, required: true, trim: true },
    dateOfLeaving: { type: Date, required: true },
    reasonForLeaving: { type: String, enum: REASONS, required: true },
    qualifiedForPromotion: { type: Boolean, required: true },
    generalConduct: { type: String, enum: CONDUCTS, default: 'good' },
    remarks: { type: String, trim: true, default: null },
    // The 19 printed values + the codes-table extras, frozen at issue.
    snapshot: {
        _id: false,
        admissionNo: { type: String, default: null },
        name: String,
        motherName: String,
        fatherName: String,
        dob: String,
        aadharNumber: String,
        samagraId: String,
        nationality: String,
        category: String,
        firstAdmissionDate: String,
        classLastStudied: String,
        lastExamResult: String,
        subjects: String,
        promotion: String,
        workingDays: Number,
        presentDays: Number,
        issueDate: String,
        reason: String,
        conduct: String,
        remarks: String,
    },
    // Fees: what the ledger said at issue, and whether a 'fees-waiver' holder overrode it.
    feesDueAtIssue: { type: Number, default: 0 },
    feesOverride: { type: Boolean, default: false },
    status: { type: String, enum: ['issued', 'cancelled'], default: 'issued' },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, default: null },
    cancelReason: { type: String, trim: true, default: null },
    createdBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// A serial is printed once, ever — cancelled ones included.
TransferCertificateSchema.index({ adminId: 1, serialNumber: 1 }, { unique: true });
// One live TC per student: the DB guard behind TC_ALREADY_ISSUED (double click, two admins).
TransferCertificateSchema.index(
    { adminId: 1, studentId: 1 },
    { unique: true, partialFilterExpression: { status: 'issued' } }
);
TransferCertificateSchema.index({ adminId: 1, sessionId: 1, status: 1 });

const TransferCertificateModel = mongoose.model('v2-transfer-certificate', TransferCertificateSchema);

module.exports = TransferCertificateModel;
module.exports.REASONS = REASONS;
module.exports.CONDUCTS = CONDUCTS;
