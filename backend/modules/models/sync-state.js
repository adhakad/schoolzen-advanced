'use strict';
const mongoose = require('mongoose');

// One row per (school, date) recording whether that school-day has been pulled from WDMS.
// Two jobs at once:
//   1. Waste prevention — cron checks this BEFORE enqueuing, so a school already synced
//      today never gets a redundant job (and never burns a WDMS call or a Redis slot).
//   2. Observability — because reconcile deliberately does NOT keep completed jobs in
//      BullMQ's history (see queues/attendance-reconcile-queue.js), this collection is
//      where a stalled or repeatedly-failing school actually becomes visible.
const SyncStateModel = mongoose.model('sync-state', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    date: {
        // UTC midnight.
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'SYNCED', 'FAILED'],
        default: 'PENDING',
        trim: true,
    },
    attempts: {
        type: Number,
        default: 0,
    },
    punchCount: {
        // How many NEW punches the last successful run actually inserted (duplicates that
        // the punchHash index rejected are not counted).
        type: Number,
        default: 0,
    },
    lastError: {
        type: String,
        trim: true,
        default: null,
    },
    startedAt: {
        type: Date,
        default: null,
    },
    finishedAt: {
        type: Date,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// The claim key. unique is what makes the "check then enqueue" race-safe: two cron ticks
// firing together resolve to one winner and one E11000, which the caller reads as
// "already claimed, skip".
SyncStateModel.schema.index({ adminId: 1, date: 1 }, { unique: true });
// The sweeper: "every FAILED or stuck-RUNNING school for this date", GLOBAL across
// schools — so adminId deliberately does NOT lead this index.
SyncStateModel.schema.index({ status: 1, date: 1 });

module.exports = SyncStateModel;
