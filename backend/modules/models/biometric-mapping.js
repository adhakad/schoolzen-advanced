'use strict';
const mongoose = require('mongoose');

const BiometricMappingModel = mongoose.model('biometric-mapping', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    personType: {
        type: String,
        required: true,
        enum: ['student', 'teacher', 'staff'],
        trim: true,
    },
    personId: {
        // plain String FK -> student._id / teacher._id / staff._id, depending on personType.
        // No Mongoose ref, per repo convention.
        type: String,
        required: true,
        trim: true,
    },
    wdmsEmpCode: {
        type: String,
        required: true,
        trim: true,
    },
    cardNo: {
        type: String,
        required: false,
        trim: true,
    },
    wdmsId: {
        // WDMS-side employee id returned by createWdmsEmployee, cached here so a later
        // card re-assign can PATCH the same WDMS record instead of creating a duplicate.
        type: String,
        required: false,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Punch ingestion resolves wdmsEmpCode -> person for every incoming punch, and this
// collection had no index at all — a full collection scan per punch during the 8-10am
// peak. Matches the exact findOne({ adminId, wdmsEmpCode }) resolution query.
// unique also enforces at the DB level what CreateBiometricMapping only checked in
// application code, so concurrent writes can no longer produce a duplicate emp code.
// (Ingest still loads a school's whole mapping into a Map once per job; this is the
// safety net, not the primary access path.)
BiometricMappingModel.schema.index({ adminId: 1, wdmsEmpCode: 1 }, { unique: true });

module.exports = BiometricMappingModel;
