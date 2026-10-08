'use strict';
const { Worker } = require('bullmq');
const { defaultWorkerOptions } = require('../queues/connection');
const { QUEUE_NAME, addReconcileJob } = require('../queues/attendance-v2-queue');
const { ingestDay } = require('../services/attendance-v2/ingest');
const { reconcileDay } = require('../services/attendance-v2/reconcile');
const { startHeartbeat } = require('./heartbeat');
const logger = require('../helpers/logger');

// Consumer for the v2 Attendance queue (a real Worker process — never a cron exec()).
// Concurrency is capped so one school's large sync can't starve the others.
const CONCURRENCY = Number(process.env.ATTENDANCE_V2_CONCURRENCY) || 5;

const processJob = async (job) => {
    const { adminId, dateKey } = job.data;
    if (job.name === 'sync') {
        const summary = await ingestDay(adminId, dateKey);
        // Every day the punches actually fell on, plus the requested one (a completed day
        // with no new punches still needs its Absent rows).
        const days = new Set([dateKey, ...summary.dateKeys]);
        await Promise.all([...days].map((key) => addReconcileJob({ adminId, dateKey: key })));
        return summary;
    }
    if (job.name === 'reconcile') return reconcileDay(adminId, dateKey);
    throw new Error(`Unknown attendance-v2 job: ${job.name}`);
};

const startAttendanceV2Worker = () => {
    const worker = new Worker(QUEUE_NAME, processJob, { ...defaultWorkerOptions, concurrency: CONCURRENCY });
    worker.on('failed', (job, error) => {
        logger.error('attendance-v2-worker.failed', error);
        if (job) logger.error('attendance-v2-worker.failedJob', { name: job.name, adminId: job.data.adminId, dateKey: job.data.dateKey, attemptsMade: job.attemptsMade });
    });
    worker.on('error', (error) => logger.error('attendance-v2-worker.error', error));
    startHeartbeat(QUEUE_NAME);
    logger.info('attendance-v2-worker.started', { queue: QUEUE_NAME, concurrency: CONCURRENCY });
    return worker;
};

module.exports = startAttendanceV2Worker;
