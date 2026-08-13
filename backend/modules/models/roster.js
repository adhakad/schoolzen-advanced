'use strict';
const mongoose = require('mongoose');

const RosterModel = mongoose.model('roster', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    personType: {
        type: String,
        required: true,
        enum: ['staff', 'teacher'],
        trim: true,
    },
    personId: {
        // plain String FK -> staff._id / teacher._id, depending on personType.
        // No Mongoose ref, per repo convention.
        type: String,
        required: true,
        trim: true,
    },
    shiftId: {
        // plain String FK -> shift._id
        type: String,
        required: true,
        trim: true,
    },
    date: {
        // Always UTC midnight — written through toUtcMidnight() so a calendar day never
        // drifts across timezones.
        type: Date,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// The repo's inline-literal model style leaves no Schema object to call .index() on, so
// attach them via the compiled model's schema instead — this keeps the convention while
// still getting the compound indexes the reconciliation lookup needs at scale.
// The unique index also encodes the business rule (one shift per person per day) and is
// what makes the bulk upserts idempotent on a re-run.
RosterModel.schema.index({ adminId: 1, personType: 1, personId: 1, date: 1 }, { unique: true });
RosterModel.schema.index({ adminId: 1, date: 1 });

module.exports = RosterModel;
