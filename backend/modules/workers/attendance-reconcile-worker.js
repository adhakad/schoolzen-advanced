'use strict';
const { Worker } = require('bullmq');
const { defaultWorkerOptions } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/attendance-reconcile-queue');
const { reconcileSchoolDate } = require('../services/attendance-reconcile');
const { publishReconcileDone } = require('../services/reconcile-publisher');
const { startHeartbeat } = require('./heartbeat');
const logger = require('../helpers/logger');

// Consumer for the SLOW path. Higher concurrency than the sync worker: a reconcile job is
// pure Mongo work with a fixed query budget per school-day and no outbound HTTP, so the
// limiting factor is the database rather than a third-party API's patience.
const CONCURRENCY = Number(process.env.RECONCILE_CONCURRENCY) || 10;

const processReconcileJob = async (job) => {
    const { adminId, dateKey } = job.data;
    logger.info('attendance-reconcile-worker.start', {
        adminId, dateKey, jobId: job.id, attempt: job.attemptsMade + 1,
    });

    const summary = await reconcileSchoolDate({ adminId, dateKey });

    // NOTE: this job is removed from Redis the moment it completes (see the removeOnComplete
    // comment in queues/attendance-reconcile-queue.js) — that is deliberate, and it is what
    // frees `reconcile-<admin>-<date>` for the next 5-minute tick to re-enqueue.
    //
    // Which is exactly why the success has to be logged HERE. BullMQ keeps no completed-job
    // history for this queue, so once the job is gone this line is the ONLY record that a
    // school-day was ever recomputed — and the counterpart to sync's .done, which the health
    // endpoint's SyncState half cannot answer for reconcile.
    logger.info('attendance-reconcile-worker.done', { adminId, dateKey, ...summary });

    // Tell any connected page that this school-day now has real statuses. Until this existed
    // a cell that had just received a raw punch showed its "pending" dot until somebody
    // reloaded — the fast path can say WHEN someone arrived, only this job can say whether
    // that made them Present or Late.
    //
    // Fire-and-forget and deliberately last, matching the publish at the end of
    // services/punch-ingest.js: the rows are committed, so a Redis hiccup must not fail a
    // finished job and trigger a retry that recomputes a day it already got right.
    await publishReconcileDone(adminId, dateKey, summary);

    return summary;
};

/**
 * @returns {Worker} started, and owned by worker.js's shutdown handler.
 */
const startAttendanceReconcileWorker = () => {
    // Same shared connection + idle-polling tuning as the sync worker; only the
    // concurrency ceiling differs. See queues/connection.js.
    const worker = new Worker(QUEUE_NAME, processReconcileJob, {
        ...defaultWorkerOptions,
        concurrency: CONCURRENCY,
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

    // Same liveness key pattern as the sync worker — the health endpoint checks BOTH, so a
    // reconcile worker that dies while sync keeps running is still visible from outside.
    startHeartbeat(QUEUE_NAME);

    logger.info('attendance-reconcile-worker.started', { queue: QUEUE_NAME, concurrency: CONCURRENCY });
    return worker;
};

module.exports = startAttendanceReconcileWorker;
