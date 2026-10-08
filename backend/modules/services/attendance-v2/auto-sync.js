'use strict';
const DeviceModel = require('../../models/devices/device');
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

module.exports = { scheduleV2AutoSync };
