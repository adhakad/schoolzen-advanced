'use strict';
const { Worker } = require('bullmq');
const { defaultWorkerOptions } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/payroll-queue');
const { generatePayroll } = require('../helpers/payroll/generate');
const { startHeartbeat } = require('./heartbeat');
const logger = require('../helpers/logger');

// Consumer for queues/payroll-queue.js — runs only in the worker process (worker.js).
// The handler is the SAME generatePayroll() the inline path calls, so a queued bulk run and
// an inline one produce identical numbers. Its result (counts + per-row skips) becomes the
// job's returnvalue, which GET /api/v2/payroll/jobs/:jobId hands to the polling page.

const CONCURRENCY = Number(process.env.PAYROLL_WORKER_CONCURRENCY) || 2;

const HANDLERS = {
    generate: async (job) => {
        const { adminId, staffIds, year, month, actor, todayKey } = job.data;
        const { runs, skipped, warning } = await generatePayroll({ adminId, staffIds, year, month, actor, todayKey });
        return { generated: runs.length, skipped, warning };
    },
};

const processPayrollJob = async (job) => {
    const handler = HANDLERS[job.name];
    if (!handler) throw new Error(`Unknown payroll job: ${job.name}`);
    return handler(job);
};

const startPayrollWorker = () => {
    const worker = new Worker(QUEUE_NAME, processPayrollJob, { ...defaultWorkerOptions, concurrency: CONCURRENCY });
    worker.on('failed', (job, error) => logger.error('payroll-worker.failed', error));
    worker.on('error', (error) => logger.error('payroll-worker.error', error));
    startHeartbeat(QUEUE_NAME);
    logger.info('payroll-worker.started', { queue: QUEUE_NAME, concurrency: CONCURRENCY });
    return worker;
};

module.exports = startPayrollWorker;
module.exports.handlers = HANDLERS;
