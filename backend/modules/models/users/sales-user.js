'use strict';
const mongoose = require('mongoose');

const SalesUserModel = mongoose.model('sales-user', {
    name: {
        type: String,
        required: true,
        trim: true,
    },
    salesUserId: {
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
    status: {
        type: String,
        trim: true,
        enum: ['active', 'inactive'],
        default: 'active',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = SalesUserModel;
