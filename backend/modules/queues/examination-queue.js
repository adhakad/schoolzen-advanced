'use strict';
const { Queue } = require('bullmq');
const { connection, defaultJobOptions } = require('./connection');
const logger = require('../helpers/logger');

// The Examination module's background jobs — producer side only (consumed by
// workers/examination-worker.js in the separate worker process).
//
// admit-cards — Admit Card Structure create/edit (admit-card-structure.md): a scope can
// match hundreds of students, so card generation never runs inside the HTTP request. The
// jobId is derived from (structureId, version): a double-submitted save collapses onto the
// same job, and a newer save gets its own (errors.md DRAFT shape 7 dedup).

const QUEUE_NAME = 'examination-jobs';

const examinationQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: { ...defaultJobOptions, attempts: 3, backoff: { type: 'exponential', delay: 10000 } },
});

examinationQueue.on('error', (error) => logger.error('examination-queue.error', error));

const admitCardJobId = (structureId, version) => `admit-${structureId}-v${version}`;

const addAdmitCardJob = async ({ adminId, structureId, version }) => {
    const job = await examinationQueue.add(
        'admit-cards',
        { adminId, structureId: String(structureId), version },
        { jobId: admitCardJobId(structureId, version) }
    );
    return job.id;
};

module.exports = { QUEUE_NAME, examinationQueue, admitCardJobId, addAdmitCardJob };
