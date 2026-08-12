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

module.exports = BiometricMappingModel;
