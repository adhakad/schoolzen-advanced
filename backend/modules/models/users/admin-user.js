'use strict';
const mongoose = require('mongoose');

const AdminModel = mongoose.model('admin-users', {
    email: {
        type: String,
        trim: true,
        unique: true,
    },
    password: {
        type: String,
        trim: true,
    },
    verified: {
        type: Boolean,
        default: false
    },
    name: {
        type: String,
        trim: true
    },
    mobile: {
        type: Number,
        trim: true,
        unique: true,
    },
    city: {
        type: String,
        trim: true,
    },
    state: {
        type: String,
        trim: true,
    },
    country: {
        type: String,
        default: 'India',
    },
    address: {
        type: String,
        trim: true,
    },
    pinCode: {
        type: Number,
        trim: true,
    },
    schoolName: {
        type: String,
        trim: true,
    },
    affiliationNumber: {
        type: String,
        trim: true,
    },
    schoolId: {
        type: Number,
        trim: true,
        unique: true
    },
    stepId: {
        type: String,
        trim: true,
        unique: true
    },
    signupStep: {
        type: Number,
        enum: [0, 2],
        default: 2,
        trim: true
    },
    otpStep: {
        type: Number,
        enum: [0, 2, 3],
        default: 2,
        trim: true
    },
    schoolDetailStep: {
        type: Number,
        enum: [0, 1, 2],
        default: 0,
        trim: true
    },
    // status: {
    //     type: String,
    //     trim: true,
    //     required: true,
    //     enum: ['Active', 'Inactive']
    // }
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = AdminModel;