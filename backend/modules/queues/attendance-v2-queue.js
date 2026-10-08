'use strict';
const crypto = require('crypto');
const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./connection');
const logger = require('../helpers/logger');

// The v2 Attendance pipeline's queue — producer side (consumed by
// workers/attendance-v2-worker.js in worker.js). Two job names:
//   sync      — the FAST path: pull a school-day from WDMS into v2 PunchLog
//   reconcile — the SLOW path: fold that day's punches into v2 AttendanceRecord
//
// Both jobIds are the natural key (school + device scope + day), so BullMQ drops a duplicate
// enqueue while the first is still waiting/running. A FINISHED job with the same key is
// removed first so the same day can be synced/reconciled again later.

const QUEUE_NAME = 'attendance-v2';
const ACTIVE_STATES = new Set(['waiting', 'active', 'delayed', 'waiting-children', 'prioritized']);
const FINISHED_STATES = new Set(['completed', 'failed']);

// Automatic polls are spread over this window per school (offset from the adminId hash), so
// 2,000 schools' ticks never hit WDMS in the same second.
const SYNC_WINDOW_MINUTES = Number(process.env.SYNC_WINDOW_MINUTES) || 10;
// Reconcile waits a moment so a burst of roster edits / punch batches collapses into one run.
const RECONCILE_DELAY_MS = Number(process.env.ATTENDANCE_V2_RECONCILE_DELAY_MS) || 5000;

const attendanceV2Queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: { ...defaultJobOptions, attempts: 3, backoff: { type: 'exponential', delay: 15000 } },
});
attendanceV2Queue.on('error', (error) => logger.error('attendance-v2-queue.error', error));

const syncJobId = (adminId, dateKey, deviceScope = 'all') => `sync-${adminId}-${deviceScope}-${dateKey}`;
const reconcileJobId = (adminId, dateKey) => `reconcile-${adminId}-${dateKey}`;

/** Stagger offset for a school, in ms, inside SYNC_WINDOW_MINUTES. */
const staggerDelayMs = (adminId) => {
    const hash = parseInt(crypto.createHash('sha1').update(String(adminId)).digest('hex').slice(0, 8), 16);
    return (hash % (SYNC_WINDOW_MINUTES * 60)) * 1000;
};

/** The state of a job by id, or null when BullMQ holds no such job. */
const stateOf = async (jobId) => {
    const job = await attendanceV2Queue.getJob(jobId);
    return job ? { job, state: await job.getState() } : null;
};

const isRunning = async (jobId) => {
    const found = await stateOf(jobId);
    return Boolean(found && ACTIVE_STATES.has(found.state));
};

const addFresh = async (name, jobId, data, opts = {}) => {
    const found = await stateOf(jobId);
    if (found && FINISHED_STATES.has(found.state)) {
        await found.job.remove().catch((error) => logger.warn('attendance-v2-queue.removeFinished', { jobId, reason: error.message }));
    }
    const job = await attendanceV2Queue.add(name, data, { jobId, ...opts });
    return job.id;
};

const addSyncJob = ({ adminId, dateKey, stagger = false }) =>
    addFresh('sync', syncJobId(adminId, dateKey), { adminId, dateKey }, stagger ? { delay: staggerDelayMs(adminId) } : {});

const addReconcileJob = ({ adminId, dateKey }) =>
    addFresh('reconcile', reconcileJobId(adminId, dateKey), { adminId, dateKey }, { delay: RECONCILE_DELAY_MS });

module.exports = {
    QUEUE_NAME,
    attendanceV2Queue,
    syncJobId,
    reconcileJobId,
    staggerDelayMs,
    isRunning,
    addSyncJob,
    addReconcileJob,
};
