'use strict';
const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./connection');
const logger = require('../helpers/logger');

// FAST path queue — one job per (school, date) that pulls raw punches from WDMS into
// PunchLog. Producer side only: this file is required by app.js/cron-job.js, never by
// worker.js, so the API process cannot accidentally start consuming.

const QUEUE_NAME = 'attendance-sync';

const attendanceSyncQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
    },
});

attendanceSyncQueue.on('error', (error) => logger.error('attendance-sync-queue.error', error));

// jobId is the natural key, so a second enqueue for the same school-day is ignored by
// BullMQ rather than doubling the WDMS pull. Colons are BullMQ's internal key separator
// and a purely-numeric id collides with its auto-generated ids — hence the "sync-" prefix
// and hyphen separators.
const buildSyncJobId = (adminId, dateKey) => `sync-${adminId}-${dateKey}`;

/**
 * @param {String} adminId
 * @param {String} dateKey "YYYY-MM-DD"
 * @param {Object} [opts]  e.g. { delay } for the staggered cron window
 */
const addSyncSchoolJob = async (adminId, dateKey, opts = {}) => {
    return attendanceSyncQueue.add(
        'sync-school',
        { adminId, dateKey },
        { jobId: buildSyncJobId(adminId, dateKey), ...opts },
    );
};

module.exports = { attendanceSyncQueue, addSyncSchoolJob, buildSyncJobId, QUEUE_NAME };
