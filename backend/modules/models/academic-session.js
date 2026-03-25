'use strict';
const mongoose = require('mongoose');

const AcademicSessionModel = mongoose.model('academic-session', {
    academicSession: {
        type: String,
        required: true,
        trim: true,
    },
    previousAcademicSession: {
        type: String,
        required: true,
        trim: true,
    },
    allSession: [{
        type: String,
        trim: true
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = AcademicSessionModel;