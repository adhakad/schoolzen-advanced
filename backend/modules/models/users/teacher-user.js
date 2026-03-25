'use strict';
const mongoose = require('mongoose');

const TeacherUserModel = mongoose.model('teacher-user', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    teacherId: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = TeacherUserModel;