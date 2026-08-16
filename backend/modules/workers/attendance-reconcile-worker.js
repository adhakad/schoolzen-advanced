'use strict';
const { Worker } = require('bullmq');
const { connection } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/attendance-reconcile-queue');
const { reconcileSchoolDate } = require('../services/attendance-reconcile');
const logger = require('../helpers/logger');

// Consumer for the SLOW path. Higher concurrency than the sync worker: a reconcile job is
// pure Mongo work with a fixed query budget per school-day and no outbound HTTP, so the
// limiting factor is the database rather than a third-party API's patience.
const CONCURRENCY = Number(process.env.RECONCILE_CONCURRENCY) || 10;
const STALLED_INTERVAL = Number(process.env.WORKER_STALLED_INTERVAL_MS) || 30000;

const processReconcileJob = async (job) => {
    const { adminId, dateKey } = job.data;
    logger.info('attendance-reconcile-worker.start', {
        adminId, dateKey, jobId: job.id, attempt: job.attemptsMade + 1,
    });

    const summary = await reconcileSchoolDate({ adminId, dateKey });

    // NOTE: this job is removed from Redis the moment it completes (see the removeOnComplete
    // comment in queues/attendance-reconcile-queue.js) — that is deliberate, and it is what
    // frees `reconcile-<admin>-<date>` for the next 5-minute tick to re-enqueue.
    return summary;
};

/**
 * @returns {Worker} started, and owned by worker.js's shutdown handler.
 */
const startAttendanceReconcileWorker = () => {
    const worker = new Worker(QUEUE_NAME, processReconcileJob, {
        connection,
        concurrency: CONCURRENCY,
        stalledInterval: STALLED_INTERVAL,
    });

    worker.on('failed', (job, error) => {
        logger.error('attendance-reconcile-worker.failed', error);
        if (job) {
            logger.error('attendance-reconcile-worker.failedJob', {
                adminId: job.data.adminId,
                dateKey: job.data.dateKey,
                attemptsMade: job.attemptsMade,
            });
        }
    });

    worker.on('error', (error) => logger.error('attendance-reconcile-worker.error', error));

    logger.info('attendance-reconcile-worker.started', { queue: QUEUE_NAME, concurrency: CONCURRENCY });
    return worker;
};

module.exports = startAttendanceReconcileWorker;
