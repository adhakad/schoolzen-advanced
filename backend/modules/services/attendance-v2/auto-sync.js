'use strict';
const DeviceModel = require('../../models/devices/device');
const StaffV2Model = require('../../models/staff/staff');
const { toDateKey } = require('../../helpers/date-only');
const { nowWallClock } = require('../../helpers/attendance-time');
const logger = require('../../helpers/logger');

// Periodic v2 poll: enqueue today's sync for every school that has an active terminal, each
// delayed by its own stagger offset (queues/attendance-v2-queue.js) so the schools spread
// across SYNC_WINDOW_MINUTES instead of hitting WDMS together. Enqueue only — the worker
// process consumes. Off unless ATTENDANCE_V2_AUTO_SYNC=true, so a school still on the legacy
// pipeline isn't pulled twice.
const scheduleV2AutoSync = async () => {
    try {
        const { addSyncJob } = require('../../queues/attendance-v2-queue');
        const dateKey = toDateKey(nowWallClock());
        const schools = await DeviceModel.distinct('assignedSchoolId', { status: 'active', active: true, assignedSchoolId: { $ne: null } });
        await Promise.all(schools.map((adminId) => addSyncJob({ adminId, dateKey, stagger: true })
            .catch((error) => logger.warn('attendance-v2.autoSync.enqueueFailed', { adminId, reason: error.message }))));
        logger.info('attendance-v2.autoSync.enqueued', { schools: schools.length, dateKey });
    } catch (error) {
        logger.error('attendance-v2.autoSync.failed', error);
    }
};

/**
 * Nightly: reconcile YESTERDAY once it is over, for every v2 school. A day is only
 * finalised (no-shows → Absent, roster WO → WeeklyOff, holidays) by a reconcile that runs
 * after it ends; every other trigger reconciles "today", so without this a past day kept
 * whatever its last mid-day run left. Enqueue only — no WDMS pull.
 */
const scheduleV2ReconcileYesterday = async () => {
    try {
        const { addReconcileJob } = require('../../queues/attendance-v2-queue');
        const today = nowWallClock();
        const dateKey = toDateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1)));
        const schools = await StaffV2Model.distinct('adminId', { status: 'active' });
        await Promise.all(schools.map((adminId) => addReconcileJob({ adminId, dateKey })
            .catch((error) => logger.warn('attendance-v2.nightlyReconcile.enqueueFailed', { adminId, reason: error.message }))));
        logger.info('attendance-v2.nightlyReconcile.enqueued', { schools: schools.length, dateKey });
    } catch (error) {
        logger.error('attendance-v2.nightlyReconcile.failed', error);
    }
};

module.exports = { scheduleV2AutoSync, scheduleV2ReconcileYesterday };
