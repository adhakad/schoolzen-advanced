'use strict';
const mongoose = require('mongoose');

const DesignationModel = mongoose.model('designation', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    departmentId: {
        // plain String FK -> Department._id, per repo convention (no Mongoose ref/ObjectId)
        type: String,
        required: false,
        trim: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = DesignationModel;
