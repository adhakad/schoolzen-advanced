'use strict';
const mongoose = require('mongoose');

const DeviceModel = mongoose.model('device', {
    terminalSn: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    alias: {
        type: String,
        trim: true,
    },
    terminalName: {
        type: String,
        trim: true,
    },
    active: {
        type: Boolean,
        default: true,
    },
    // Sales user who assigned this device to a school (its "book of business" owner) —
    // distinct from addedBy, which is set once at WDMS-sync-insert time and never changes.
    salesPersonId: {
        type: String,
        trim: true,
        default: null,
    },
    addedBy: {
        type: String,
        trim: true,
    },
    // Stores admin-user._id (the same adminId/tenant-FK convention used everywhere else
    // in this codebase) — not a separate School collection id.
    assignedSchoolId: {
        type: String,
        trim: true,
        default: null,
    },
    assignedAt: {
        type: Date,
        default: null,
    },
    status: {
        type: String,
        trim: true,
        enum: ['unassigned', 'active', 'blocked'],
        default: 'unassigned',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = DeviceModel;
