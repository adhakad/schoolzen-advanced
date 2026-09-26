'use strict';
const crypto = require('crypto');
const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./connection');
const logger = require('../helpers/logger');

// The Student module's background jobs — producer side only (consumed by
// workers/student-worker.js in the separate worker process).
//
// Three job names share one queue because they share one shape of concern (bulk student
// writes that must never block an HTTP request — additional-technical-considerations.md,
// Background job queue):
//   import      — Excel Import rows, validated + bulk-written
//   device-sync — push cards/verify-mode to WDMS for a set of students (assign & resync)
//   promotion   — Class Promotion, processed in bounded, per-chunk transactions
//
// Every job's jobId is its natural idempotency key, so a double-click or a client retry
// enqueues nothing new while the first run is still known to BullMQ.

const QUEUE_NAME = 'student-jobs';

const studentQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
    },
});

studentQueue.on('error', (error) => logger.error('student-queue.error', error));

/** Short, stable hash of anything JSON-able — the variable part of a job key. */
const hashOf = (value) => crypto
    .createHash('sha1')
    .update(Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex')
    .slice(0, 16);

// BullMQ uses ':' internally, so keys are hyphen-separated.
const enqueue = async (name, jobId, data) => {
    const job = await studentQueue.add(name, data, { jobId });
    return job.id;
};

// The scope is part of the key: the same file imported into a DIFFERENT class/session is a
// different job, while a double-submit of the same file into the same scope collapses.
const addImportJob = (data, fileBuffer) =>
    enqueue('import', `import-${data.adminId}-${hashOf([data.session, data.placement, hashOf(fileBuffer)])}`, data);

// Includes a timestamp bucket: re-assigning the SAME cards a minute later is a legitimate
// "push again", while a double-submit inside the same minute collapses into one job.
const addDeviceSyncJob = (data) =>
    enqueue('device-sync', `cards-${data.adminId}-${hashOf([data.studentIds, data.reason, Math.floor(Date.now() / 60000)])}`, data);

const addPromotionJob = (data) =>
    enqueue('promotion', `promo-${data.adminId}-${data.fromSession}-${data.classId}-${hashOf(data.items)}`, data);

module.exports = {
    QUEUE_NAME,
    studentQueue,
    hashOf,
    addImportJob,
    addDeviceSyncJob,
    addPromotionJob,
};
