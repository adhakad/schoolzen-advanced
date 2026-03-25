'use strict';
const mongoose = require('mongoose');

const SubjectModel = mongoose.model('subject', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    subject: {
        type: String,
        required: true,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = SubjectModel;
