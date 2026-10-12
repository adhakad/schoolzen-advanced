'use strict';
const crypto = require('crypto');
const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./connection');
const logger = require('../helpers/logger');

// The Payroll module's background jobs — producer side only (consumed by
// workers/payroll-worker.js in the separate worker process).
//
// generate — "Generate for Selected" for a large selection (generate-payroll.md): computing
// a month of attendance for many staff never runs inside the HTTP request.
//
// The jobId is the natural idempotency key (school + month + selection), so a double-click
// collapses onto the run already waiting/running; a FINISHED job with the same key is
// removed first so a later regenerate is a real new run, not a replay of the old result.

const QUEUE_NAME = 'payroll-jobs';
const FINISHED_STATES = new Set(['completed', 'failed']);

const payrollQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: { ...defaultJobOptions, attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
});

payrollQueue.on('error', (error) => logger.error('payroll-queue.error', error));

const hashOf = (value) => crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);

const addGenerateJob = async (data) => {
    const jobId = `generate-${data.adminId}-${data.year}${String(data.month).padStart(2, '0')}-${hashOf([...data.staffIds].sort())}`;
    const prior = await payrollQueue.getJob(jobId);
    if (prior && FINISHED_STATES.has(await prior.getState())) {
        await prior.remove().catch((error) => logger.warn('payroll-queue.generate.removeFinished', { jobId, reason: error.message }));
    }
    const job = await payrollQueue.add('generate', data, { jobId });
    return job.id;
};

module.exports = { QUEUE_NAME, payrollQueue, addGenerateJob };
