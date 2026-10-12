'use strict';
const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./connection');
const logger = require('../helpers/logger');

// The Fees module's background jobs — producer side only (consumed by
// workers/fees-worker.js in the separate worker process).
//
// reminder — Fee Reminder's "Send Now" (fees/fee-reminder.md): a filter can resolve to
// hundreds of recipients, so WhatsApp sends never run inside the HTTP request. The reviewed
// recipient list is the job's input; `jobKey` (one per Send Now) is both the BullMQ jobId —
// a double-submit collapses onto the same job — and the per-recipient dedup key the worker
// writes to FeeReminderDelivery, so a retried job never re-messages anyone already sent to.

const QUEUE_NAME = 'fees-jobs';

const feesQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: { ...defaultJobOptions, attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
});

feesQueue.on('error', (error) => logger.error('fees-queue.error', error));

const addReminderJob = async (data) => {
    const job = await feesQueue.add('reminder', data, { jobId: `reminder-${data.jobKey}` });
    return job.id;
};

module.exports = { QUEUE_NAME, feesQueue, addReminderJob };
