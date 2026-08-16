'use strict';
const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./connection');
const logger = require('../helpers/logger');

// SLOW path queue — one job per (school, date) that turns PunchLog rows into
// DailyAttendance statuses. Allowed to lag minutes-to-hours behind ingestion: the raw
// punch already landed and already emitted, so nothing looks broken while this catches up.

const QUEUE_NAME = 'attendance-reconcile';

const attendanceReconcileQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30000 },
        // DELIBERATE DIVERGENCE from the sync queue's removeOnComplete: { count: 100 }.
        // BullMQ's jobId uniqueness covers jobs that still EXIST in Redis, completed ones
        // included. Retaining a finished `reconcile-<admin>-<date>` job would make every
        // later re-add with that same jobId silently ignored — so the school would stop
        // reconciling for the rest of the day, exactly while punches keep arriving.
        // Dropping completed jobs immediately frees the jobId for the next 5-minute tick
        // while still guaranteeing only ONE reconcile is queued per school+date at a time,
        // which is the actual intent. Outcomes are recorded in SyncState, not in BullMQ's
        // job history, so nothing observable is lost.
        removeOnComplete: true,
    },
});

attendanceReconcileQueue.on('error', (error) => logger.error('attendance-reconcile-queue.error', error));

const buildReconcileJobId = (adminId, dateKey) => `reconcile-${adminId}-${dateKey}`;

/**
 * The debounce IS the jobId. However many punch batches land for a school-day, they all
 * collapse into the single queued reconcile job — no manual debounce timer anywhere.
 * @param {String} adminId
 * @param {String} dateKey "YYYY-MM-DD"
 * @param {Object} [opts]
 */
const addReconcileJob = async (adminId, dateKey, opts = {}) => {
    return attendanceReconcileQueue.add(
        'reconcile-school-date',
        { adminId, dateKey },
        {
            jobId: buildReconcileJobId(adminId, dateKey),
            // Give punches a few minutes to accumulate so a burst of arrivals reconciles
            // once rather than repeatedly.
            delay: Number(process.env.RECONCILE_DEBOUNCE_MS) || 180000,
            ...opts,
        },
    );
};

module.exports = { attendanceReconcileQueue, addReconcileJob, buildReconcileJobId, QUEUE_NAME };
