'use strict';
const { Worker } = require('bullmq');
const { defaultWorkerOptions } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/examination-queue');
const AdmitCardStructureModel = require('../models/examination/admit-card-structure');
const { generateAdmitCards } = require('../helpers/examination/admit-card-generation');
const { startHeartbeat } = require('./heartbeat');
const logger = require('../helpers/logger');

// Consumer for queues/examination-queue.js — runs only in the worker process (worker.js).
//
// admit-cards: (re)generates every card for one structure version (idempotent upserts, see
// helpers/examination/admit-card-generation.js). On the final failed attempt the structure
// is marked 'failed' so the page stops showing "generating" forever and the admin can save
// again to retry.

const CONCURRENCY = Number(process.env.EXAMINATION_WORKER_CONCURRENCY) || 2;

const processJob = async (job) => {
    if (job.name !== 'admit-cards') throw new Error(`Unknown examination job: ${job.name}`);
    const { adminId, structureId, version } = job.data;
    return generateAdmitCards(adminId, structureId, version);
};

const startExaminationWorker = () => {
    const worker = new Worker(QUEUE_NAME, processJob, { ...defaultWorkerOptions, concurrency: CONCURRENCY });
    startHeartbeat(QUEUE_NAME);

    worker.on('failed', async (job, error) => {
        logger.error('examination-worker.failed', error);
        if (!job || job.attemptsMade < (job.opts.attempts || 1)) return;
        const { adminId, structureId, version } = job.data;
        try {
            await AdmitCardStructureModel.updateOne(
                { _id: structureId, adminId, version },
                { $set: { 'generation.state': 'failed', 'generation.finishedAt': new Date() } }
            );
        } catch (markError) {
            logger.error('examination-worker.markFailed', markError);
        }
    });
    worker.on('error', (error) => logger.error('examination-worker.error', error));
    return worker;
};

module.exports = startExaminationWorker;
