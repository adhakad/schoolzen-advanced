'use strict';
const DeviceModel = require('../models/devices/device');
const SyncStateModel = require('../models/sync-state');
const { toUtcMidnight, toDateKey } = require('../helpers/date-only');
const { nowWallClock } = require('../helpers/attendance-time');
const logger = require('../helpers/logger');

// The PRODUCER side of the pipeline, running inside the API process (cron-job.js). It only
// ever enqueues — every consumer lives in worker.js. Nothing here does WDMS or attendance
// work itself, which is the fix for the reference project's `cron -> exec(child process)`
// design that spawned uncoordinated processes with no concurrency ceiling.

// The rolling window sync jobs are spread across, in minutes.
const SYNC_WINDOW_MINUTES = Number(process.env.SYNC_WINDOW_MINUTES) || 120;

// The queue modules are required LAZILY inside each function on purpose:
// queues/connection.js throws at require-time when Redis is not configured, and app.js
// requires cron-job.js at boot. Requiring eagerly would mean a missing REDIS_URL takes the
// whole API down instead of just disabling the background pipeline.
const loadQueues = () => ({
    addSyncSchoolJob: require('../queues/attendance-sync-queue').addSyncSchoolJob,
    addReconcileJob: require('../queues/attendance-reconcile-queue').addReconcileJob,
});

// "Today" in the SCHOOL's wall clock. A container running UTC would otherwise still be on
// yesterday's date until 05:30 IST — i.e. for the entire morning punch window.
const todayKey = () => toDateKey(toUtcMidnight(nowWallClock()));

/**
 * Schools worth syncing: distinct assignedSchoolId across devices that are active on BOTH
 * the sales side (status) and the WDMS side (active). A school with no active device has
 * literally nothing to pull, so it never gets a job — no wasted WDMS call, no wasted Redis
 * slot.
 * @returns {Promise<String[]>} adminIds
 */
const getActiveSchoolIds = async () => {
    const ids = await DeviceModel.distinct('assignedSchoolId', {
        assignedSchoolId: { $ne: null },
        status: 'active',
        active: true,
    });
    return ids.filter(Boolean).map(String);
};

/**
 * adminIds already claimed for this date, so a second cron tick (or a restart mid-window)
 * cannot re-enqueue them.
 * @returns {Promise<Set<String>>}
 */
const getAlreadyClaimedSchoolIds = async (dateKey) => {
    const rows = await SyncStateModel.find(
        { date: toUtcMidnight(dateKey), status: { $in: ['PENDING', 'RUNNING', 'SYNCED'] } },
        { adminId: 1, _id: 0 },
    ).lean();
    return new Set(rows.map((row) => String(row.adminId)));
};

/**
 * Enqueue one staggered "sync school X" job per active school.
 *
 * Offset per school = index x (SYNC_WINDOW_MINUTES x 60 / totalActiveSchools) seconds from
 * now, so 2000 schools land smoothly across the window rather than stampeding WDMS and
 * Mongo in the same second.
 *
 * @param {Object} [opts]
 * @param {String} [opts.dateKey] override for a backfill run
 * @returns {Promise<Object>} { dateKey, totalActive, enqueuedCount, skippedCount }
 */
const scheduleDailyAttendanceSync = async (opts = {}) => {
    const dateKey = opts.dateKey || todayKey();
    const summary = { dateKey, totalActive: 0, enqueuedCount: 0, skippedCount: 0 };

    try {
        const { addSyncSchoolJob } = loadQueues();

        const schoolIds = await getActiveSchoolIds();
        summary.totalActive = schoolIds.length;
        if (schoolIds.length === 0) {
            logger.info('cron-attendance.noActiveSchools', { dateKey });
            return summary;
        }

        const claimed = await getAlreadyClaimedSchoolIds(dateKey);
        const pending = schoolIds.filter((adminId) => !claimed.has(adminId));
        summary.skippedCount = schoolIds.length - pending.length;
        if (pending.length === 0) {
            logger.info('cron-attendance.allAlreadySynced', { dateKey, ...summary });
            return summary;
        }

        const stepSeconds = (SYNC_WINDOW_MINUTES * 60) / pending.length;
        const date = toUtcMidnight(dateKey);
        const now = new Date();

        for (let index = 0; index < pending.length; index += 1) {
            const adminId = pending[index];
            const delayMs = Math.round(index * stepSeconds) * 1000;

            try {
                // Claim FIRST. The unique { adminId, date } index makes this the actual
                // race guard: two cron ticks firing together produce one winner and one
                // E11000, and the loser skips instead of double-enqueuing.
                await SyncStateModel.create({
                    adminId,
                    date,
                    status: 'PENDING',
                    createdAt: now,
                    updatedAt: now,
                });
            } catch (error) {
                if (error && error.code === 11000) {
                    summary.skippedCount += 1;
                    continue;
                }
                throw error;
            }

            await addSyncSchoolJob(adminId, dateKey, { delay: delayMs });
            summary.enqueuedCount += 1;
        }

        logger.info('cron-attendance.syncScheduled', { ...summary, windowMinutes: SYNC_WINDOW_MINUTES });
        return summary;
    } catch (error) {
        // Swallowed at the cron boundary — nothing upstream can handle it, and throwing
        // out of a node-cron callback takes the API process with it.
        logger.error('cron-attendance.scheduleFailed', error);
        return summary;
    }
};

/**
 * The steady 5-minute reconcile cadence.
 *
 * Enqueues a reconcile job for every school that has been (or is being) synced today. The
 * jobId dedup in queues/attendance-reconcile-queue.js means this is idempotent — however
 * many times it fires, only one reconcile per school+date is ever queued. That IS the
 * debounce; there is no manual timer anywhere.
 *
 * @returns {Promise<Object>} { dateKey, enqueuedCount }
 */
const scheduleReconcileSweep = async (opts = {}) => {
    const dateKey = opts.dateKey || todayKey();
    const summary = { dateKey, enqueuedCount: 0 };

    try {
        const { addReconcileJob } = loadQueues();

        // Uses the { status, date } index — deliberately NOT led by adminId, because this
        // sweep is global across schools.
        const rows = await SyncStateModel.find(
            { date: toUtcMidnight(dateKey), status: { $in: ['RUNNING', 'SYNCED'] } },
            { adminId: 1, _id: 0 },
        ).lean();

        for (const row of rows) {
            await addReconcileJob(String(row.adminId), dateKey);
            summary.enqueuedCount += 1;
        }

        if (summary.enqueuedCount > 0) logger.info('cron-attendance.reconcileSweep', summary);
        return summary;
    } catch (error) {
        logger.error('cron-attendance.reconcileSweepFailed', error);
        return summary;
    }
};

module.exports = {
    scheduleDailyAttendanceSync,
    scheduleReconcileSweep,
    getActiveSchoolIds,
    todayKey,
    SYNC_WINDOW_MINUTES,
};
