'use strict';
const { Worker } = require('bullmq');
const { defaultWorkerOptions } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/attendance-sync-queue');
const { ingestSchoolDay } = require('../services/punch-ingest');
const SyncStateModel = require('../models/sync-state');
const { toUtcMidnight } = require('../helpers/date-only');
const logger = require('../helpers/logger');

// A REAL BullMQ consumer — the thing the reference project never had (it defined queues and
// then ran the actual sync via cron -> exec(child process), so nothing consumed them and
// nothing limited concurrency). Because this is a proper Worker, `concurrency` is what caps
// how many schools hit WDMS and Mongo at once during the 8-10am peak.

// Conservative by default: each job is an outbound WDMS pull plus a bulk insert, so the
// ceiling is WDMS's tolerance rather than this process's CPU. Tune from load testing.
const CONCURRENCY = Number(process.env.WDMS_SYNC_CONCURRENCY) || 5;

// `inc` and `max` are applied in the same round-trip as the $set so marking a run RUNNING
// and counting the attempt can never end up as two half-applied writes.
const markSyncState = async (adminId, dateKey, patch, inc, max) => {
    const date = toUtcMidnight(dateKey);
    const update = {
        $set: { ...patch, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
    };
    if (inc) update.$inc = inc;
    if (max) update.$max = max;
    return SyncStateModel.updateOne({ adminId, date }, update, { upsert: true });
};

const processSyncJob = async (job) => {
    const { adminId, dateKey } = job.data;
    logger.info('attendance-sync-worker.start', { adminId, dateKey, jobId: job.id, attempt: job.attemptsMade + 1 });

    await markSyncState(
        adminId,
        dateKey,
        { status: 'RUNNING', startedAt: new Date(), lastError: null },
        { attempts: 1 },
    );

    const result = await ingestSchoolDay({ adminId, dateKey });

    // punchCount goes through $max, NOT $set. It is what gates the 5-minute reconcile
    // sweep (`SYNCED + punchCount > 0` in cron-attendance-service.js), and a second run of
    // the same day — a manual "Sync now", or a BullMQ retry — inserts zero NEW rows because
    // every punch collides on punchHash. $set would write that 0 over the real count and
    // silently drop the school out of the sweep for the rest of the day. $max keeps the
    // high-water mark, which is the fact the sweep actually needs: "this day has punches".
    await markSyncState(
        adminId,
        dateKey,
        { status: 'SYNCED', finishedAt: new Date(), lastError: null },
        null,
        { punchCount: result.insertedCount },
    );

    // NOTE: the reconcile hand-off is NOT here. It lives in services/punch-ingest.js,
    // immediately after the insertMany that produced the rows, so that EVERY ingest path
    // queues the recompute rather than just this one worker. See the comment there.

    logger.info('attendance-sync-worker.done', { adminId, dateKey, ...result });
    return result;
};

/**
 * @returns {Worker} started, and owned by worker.js's shutdown handler.
 */
const startAttendanceSyncWorker = () => {
    // defaultWorkerOptions carries the shared connection plus the idle-polling tuning
    // (drainDelay / stalledInterval / skipStalledCheck) — see queues/connection.js.
    const worker = new Worker(QUEUE_NAME, processSyncJob, {
        ...defaultWorkerOptions,
        concurrency: CONCURRENCY,
    });

    // Nobody is watching a UI when this pipeline breaks, so the log is the only record.
    worker.on('failed', async (job, error) => {
        logger.error('attendance-sync-worker.failed', error);
        if (!job) return;
        try {
            await markSyncState(job.data.adminId, job.data.dateKey, {
                // Only the FINAL attempt is FAILED — an intermediate retry stays RUNNING so
                // the health endpoint doesn't cry wolf over a job BullMQ is about to retry.
                status: job.attemptsMade >= (job.opts.attempts || 1) ? 'FAILED' : 'RUNNING',
                lastError: (error && error.message ? error.message : String(error)).slice(0, 500),
                finishedAt: new Date(),
            });
        } catch (stateError) {
            logger.error('attendance-sync-worker.failedStateWriteFailed', stateError);
        }
    });

    worker.on('error', (error) => logger.error('attendance-sync-worker.error', error));

    logger.info('attendance-sync-worker.started', { queue: QUEUE_NAME, concurrency: CONCURRENCY });
    return worker;
};

module.exports = startAttendanceSyncWorker;
