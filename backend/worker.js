'use strict';
require('dotenv').config();
// database.js reads global.global_config at require-time, exactly as app.js sets it up —
// so this must happen before anything pulls in a model.
global.global_config = require('./config/config.js');

const mongoose = require('mongoose');
const { DbConnect } = require('./modules/helpers/database');
const { connection } = require('./modules/queues/connection');
const startAttendanceSyncWorker = require('./modules/workers/attendance-sync-worker');
const startAttendanceReconcileWorker = require('./modules/workers/attendance-reconcile-worker');
const { stopHeartbeats } = require('./modules/workers/heartbeat');
const logger = require('./modules/helpers/logger');

// SEPARATE PROCESS from app.js, started with `npm run worker`.
//
// The API process only ever ENQUEUES (cron-job.js) and reads queue depth (the health
// endpoint); this process is the only one that consumes. That split is what stops a burst
// of 2000 school syncs from starving the HTTP request loop during the morning peak — and it
// means the API can be restarted mid-sync without dropping a job.

DbConnect();

const workers = [
    startAttendanceSyncWorker(),
    startAttendanceReconcileWorker(),
];

logger.info('worker.started', { pid: process.pid, workers: workers.length });

// --- Graceful shutdown ---------------------------------------------------------------
// worker.close() waits for in-flight jobs to finish and returns anything still queued to
// the waiting list, instead of leaving it stalled until stalledInterval notices. Without
// this a container restart mid-morning would strand every job it was holding.
let shuttingDown = false;

const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('worker.shutdown.start', { signal });

    try {
        // Stop beating BEFORE closing the connection, or a beat mid-shutdown races the quit()
        // below and logs a spurious write failure on every clean restart.
        stopHeartbeats();
        await Promise.all(workers.map((worker) => worker.close()));
        await connection.quit();
        await mongoose.connection.close();
        logger.info('worker.shutdown.done', { signal });
        process.exit(0);
    } catch (error) {
        logger.error('worker.shutdown.failed', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A rejection that escapes a job handler would otherwise kill the process silently under
// Node's default behaviour. Log it, then shut down cleanly so the supervisor restarts a
// healthy process rather than one in an unknown state.
process.on('unhandledRejection', (reason) => {
    logger.error('worker.unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});
process.on('uncaughtException', (error) => {
    logger.error('worker.uncaughtException', error);
    shutdown('uncaughtException');
});
