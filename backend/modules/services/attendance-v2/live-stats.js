'use strict';
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const PunchLogV2Model = require('../../models/attendance/punch-log');
const AttendanceLiveStatsModel = require('../../models/attendance/live-stats');
const cacheService = require('../cache/cache.service');
const cacheKeys = require('../cache/cache-keys');
const { toUtcMidnight } = require('../../helpers/date-only');

// Today's Live Status counts — the precomputed aggregate (attendance/optimization.md §6).
// recompute() runs on the events that change the numbers (a punch batch, a reconcile batch,
// a manual edit); read() serves GET /live-status from the stored doc behind a short TTL.

const LIVE_TTL_SECONDS = 45;
const EMPTY = () => ({ Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, live: 0 });

const recompute = async (adminId, dateKey) => {
    const date = toUtcMidnight(dateKey);
    const [byStatus, pending] = await Promise.all([
        AttendanceRecordV2Model.aggregate([
            { $match: { adminId, date, deletedAt: null } },
            { $group: { _id: { personType: '$personType', status: '$status' }, count: { $sum: 1 } } },
        ]),
        // Punched in, not reconciled yet — the "live" ring count.
        PunchLogV2Model.aggregate([
            { $match: { adminId, dateKey, reconciled: false } },
            { $group: { _id: { personType: '$personType', personId: '$personId' } } },
            { $group: { _id: '$_id.personType', count: { $sum: 1 } } },
        ]),
    ]);
    const stats = { staff: EMPTY(), student: EMPTY() };
    byStatus.forEach((row) => {
        const bucket = stats[row._id.personType];
        if (bucket && bucket[row._id.status] !== undefined) bucket[row._id.status] = row.count;
    });
    pending.forEach((row) => { if (stats[row._id]) stats[row._id].live = row.count; });

    await AttendanceLiveStatsModel.updateOne(
        { adminId, dateKey },
        { $set: { staff: stats.staff, student: stats.student, computedAt: new Date() } },
        { upsert: true }
    );
    await cacheService.del(cacheKeys.attendance.liveStatus(adminId, dateKey));
    return { dateKey, ...stats };
};

const read = (adminId, dateKey) => cacheService.wrap(
    cacheKeys.attendance.liveStatus(adminId, dateKey),
    LIVE_TTL_SECONDS,
    async () => {
        const doc = await AttendanceLiveStatsModel.findOne({ adminId, dateKey }).lean();
        // First read of a day nothing has touched yet: compute once rather than show zeros.
        if (!doc) return recompute(adminId, dateKey);
        return { dateKey, staff: { ...EMPTY(), ...doc.staff }, student: { ...EMPTY(), ...doc.student } };
    }
);

module.exports = { recompute, read };
