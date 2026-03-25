'use strict';
const mongoose = require('mongoose');

const ClassSubjectModel = mongoose.model('class-subject', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    class: {
        type: Number,
        required: true,
        trim: true,
    },
    stream: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    subject: {},
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = ClassSubjectModel;