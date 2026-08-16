'use strict';
const DailyAttendanceModel = require('../models/daily-attendance');
const PunchLogModel = require('../models/punch-log');
const SyncStateModel = require('../models/sync-state');
const { getPersonMonth, getSchoolDaySummary } = require('../services/attendance-calendar');
const { getActivePeople, personCode } = require('../services/person-lookup');
const { toUtcMidnight, toDateKey, parseDateKey } = require('../helpers/date-only');
const { atWallClock, nowWallClock } = require('../helpers/attendance-time');
const logger = require('../helpers/logger');

// HTTP surface for the attendance pipeline. Deliberately thin: the calendar derivation
// lives in services/attendance-calendar.js and the sync/reconcile work lives in the
// worker process — this file only reads, writes manual overrides, and enqueues.
//
// Queue modules are required LAZILY (see the same note in cron-attendance-service.js):
// queues/connection.js throws at require-time without Redis, and routes.js requires this
// controller at boot. Eager requires would mean a missing REDIS_URL 500s every endpoint
// here, including the read-only ones that don't need Redis at all.

// ---------------------------------------------------------------------------
// GET /calendar?adminId=&personType=&personId=&year=&month=
// One person's month, day by day. "Absent" is derived at read time — see the header of
// services/attendance-calendar.js for why it is never stored.
// ---------------------------------------------------------------------------
let GetAttendanceCalendar = async (req, res, next) => {
    const { adminId, personType, personId } = req.query;
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    try {
        if (!adminId || !personType || !personId) {
            return res.status(400).json('School, person type and person are required!');
        }
        if (!['student', 'teacher', 'staff'].includes(personType)) {
            return res.status(400).json('A valid person type is required!');
        }
        // Never let a bad period fall through to an unbounded scan.
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return res.status(400).json('A valid year and month (1-12) are required!');
        }

        const result = await getPersonMonth({ adminId, personType, personId, year, month });
        return res.status(200).json(result);
    } catch (error) {
        logger.error('attendance.GetAttendanceCalendar', error);
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// GET /day-summary?adminId=&date=
// Status counts for one school-day — answered from the { adminId, date, status } index.
// ---------------------------------------------------------------------------
let GetDaySummary = async (req, res, next) => {
    const { adminId, date } = req.query;
    try {
        if (!adminId || !parseDateKey(date)) {
            return res.status(400).json('School and a valid date are required!');
        }
        const summary = await getSchoolDaySummary({ adminId, dateKey: parseDateKey(date).dateKey });
        return res.status(200).json(summary);
    } catch (error) {
        logger.error('attendance.GetDaySummary', error);
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// GET /people?adminId=&personType=&class=
// The person picker for the calendar page. Wraps person-lookup so the frontend doesn't have
// to know that 'active' is spelled differently in each of the three collections.
// ---------------------------------------------------------------------------
let GetAttendancePeople = async (req, res, next) => {
    const { adminId, personType } = req.query;
    try {
        if (!adminId || !['student', 'teacher', 'staff'].includes(personType)) {
            return res.status(400).json('School and a valid person type are required!');
        }

        // Students are listed class-by-class — a whole school's roll is far too large for
        // a single dropdown.
        const extra = {};
        if (personType === 'student' && req.query.class) extra.class = req.query.class;

        const people = await getActivePeople(adminId, personType, extra);
        return res.status(200).json(people.map((person) => ({
            _id: person._id,
            name: person.name,
            code: personCode(personType, person),
        })));
    } catch (error) {
        logger.error('attendance.GetAttendancePeople', error);
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// GET /punch-log?adminId=&personType=&personId=&date=
// The raw punches behind one calendar cell — the audit trail for "why is this HalfDay?".
// ---------------------------------------------------------------------------
let GetPunchLog = async (req, res, next) => {
    const { adminId, personType, personId, date } = req.query;
    try {
        const parsed = parseDateKey(date);
        if (!adminId || !personType || !personId || !parsed) {
            return res.status(400).json('School, person and a valid date are required!');
        }

        const punches = await PunchLogModel
            .find(
                { adminId, personType, personId, date: toUtcMidnight(parsed.dateKey) },
                { punchTime: 1, punchState: 1, terminalSn: 1, source: 1, _id: 0 },
            )
            .sort({ punchTime: 1 })
            .lean();

        return res.status(200).json(punches);
    } catch (error) {
        logger.error('attendance.GetPunchLog', error);
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// POST /manual
// Writes DailyAttendance directly with source 'MANUAL' and isOverridden true.
// The flag is the whole point: services/attendance-reconcile.js reads overridden rows up
// front and skips those people, so a hand-corrected day can never be clobbered by a later
// sync — not today's, not next week's re-run.
// ---------------------------------------------------------------------------
let CreateManualAttendance = async (req, res, next) => {
    const { adminId, personType, personId, status, inTime, outTime, overriddenBy } = req.body;
    try {
        const parsed = parseDateKey(req.body.date);
        if (!parsed) return res.status(400).json('A valid date is required!');

        const date = toUtcMidnight(parsed.dateKey);
        // "HH:mm" against the day's UTC midnight — the same frame punchTime is stored in,
        // so a manual row is directly comparable with a synced one. See the header of
        // helpers/attendance-time.js.
        const firstIn = inTime ? atWallClock(date, inTime) : null;
        const lastOut = outTime ? atWallClock(date, outTime) : null;

        if (firstIn && lastOut && lastOut < firstIn) {
            return res.status(400).json('Out time cannot be before in time!');
        }

        const now = new Date();
        const row = await DailyAttendanceModel.findOneAndUpdate(
            { adminId, personType, personId, date },
            {
                $set: {
                    status,
                    firstIn,
                    lastOut,
                    // A manual row records what an admin asserts, not what a device saw —
                    // there is no punch behind it to count.
                    punchCount: 0,
                    lateByMinutes: null,
                    shiftId: null,
                    source: 'MANUAL',
                    isOverridden: true,
                    overriddenBy: overriddenBy || null,
                    updatedAt: now,
                },
                $setOnInsert: { createdAt: now },
            },
            { upsert: true, new: true },
        );

        return res.status(200).json({ successMsg: 'Attendance saved successfully.', attendance: row });
    } catch (error) {
        logger.error('attendance.CreateManualAttendance', error);
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// DELETE /manual
// Drops the override so the next reconcile recomputes the day from the raw punches.
// Body: { adminId, personType, personId, date }
// ---------------------------------------------------------------------------
let DeleteManualAttendance = async (req, res, next) => {
    const { adminId, personType, personId } = req.body;
    try {
        const parsed = parseDateKey(req.body.date);
        if (!adminId || !personType || !personId || !parsed) {
            return res.status(400).json('School, person and a valid date are required!');
        }

        const result = await DailyAttendanceModel.deleteOne({
            adminId,
            personType,
            personId,
            date: toUtcMidnight(parsed.dateKey),
            // Only ever removes a MANUAL row. A synced row must be corrected by
            // re-reconciling, never by deleting the record of what the device reported.
            isOverridden: true,
        });

        if (result.deletedCount === 0) return res.status(404).json('No manual entry found for that day!');

        // Queue the recompute rather than doing it inline — this endpoint returns
        // immediately and the slow path picks the day back up on its own cadence.
        try {
            const { addReconcileJob } = require('../queues/attendance-reconcile-queue');
            await addReconcileJob(adminId, parsed.dateKey, { delay: 0 });
        } catch (queueError) {
            // The delete already succeeded; a Redis outage must not turn that into a 500.
            // The 5-minute sweep will re-enqueue the day anyway.
            logger.error('attendance.DeleteManualAttendance.enqueueFailed', queueError);
        }

        return res.status(200).json('Manual entry removed. The day will be recalculated shortly.');
    } catch (error) {
        logger.error('attendance.DeleteManualAttendance', error);
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// POST /sync-now  { adminId, date }
// On-demand pull for one school-day, so the pipeline is testable without waiting for the
// 8am window. Clears the SyncState claim and the deduped jobId first — both exist to stop
// the CRON from re-running a day, and a human explicitly asking is the one case that
// should override them.
// ---------------------------------------------------------------------------
let SyncSchoolNow = async (req, res, next) => {
    const { adminId } = req.body;
    try {
        const parsed = parseDateKey(req.body.date);
        if (!parsed) return res.status(400).json('A valid date is required!');
        const dateKey = parsed.dateKey;

        const {
            attendanceSyncQueue,
            addSyncSchoolJob,
            buildSyncJobId,
        } = require('../queues/attendance-sync-queue');

        // A completed/failed job still occupying this jobId would make the re-add a silent
        // no-op, which reads to the user as "the button does nothing".
        const existing = await attendanceSyncQueue.getJob(buildSyncJobId(adminId, dateKey));
        if (existing) {
            const state = await existing.getState();
            if (state === 'active') {
                return res.status(400).json('A sync is already running for this day!');
            }
            await existing.remove();
        }

        const now = new Date();
        await SyncStateModel.updateOne(
            { adminId, date: toUtcMidnight(dateKey) },
            {
                $set: { status: 'PENDING', lastError: null, startedAt: null, finishedAt: null, updatedAt: now },
                $setOnInsert: { createdAt: now },
            },
            { upsert: true },
        );

        await addSyncSchoolJob(adminId, dateKey, { delay: 0 });
        return res.status(200).json('Sync queued. Punches will appear as they are pulled.');
    } catch (error) {
        logger.error('attendance.SyncSchoolNow', error);
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// GET /sync-state?adminId=&date=
// Where a school's pull actually got to. Backs the "last synced" line on the UI and is the
// per-school counterpart to /health.
// ---------------------------------------------------------------------------
let GetSyncState = async (req, res, next) => {
    const { adminId, date } = req.query;
    try {
        const parsed = parseDateKey(date);
        if (!adminId || !parsed) return res.status(400).json('School and a valid date are required!');

        const state = await SyncStateModel
            .findOne({ adminId, date: toUtcMidnight(parsed.dateKey) })
            .lean();

        return res.status(200).json(state || { adminId, date: parsed.dateKey, status: 'PENDING' });
    } catch (error) {
        logger.error('attendance.GetSyncState', error);
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// GET /health
// Makes a stalled pipeline observable from OUTSIDE the worker process — queue depth plus
// today's per-school sync outcomes. Reconcile keeps no completed-job history in Redis
// (see queues/attendance-reconcile-queue.js), so SyncState is the durable half of this.
// ---------------------------------------------------------------------------
let GetQueueHealth = async (req, res, next) => {
    try {
        const dateKey = req.query.date && parseDateKey(req.query.date)
            ? parseDateKey(req.query.date).dateKey
            // The school's wall clock, not the server's — a UTC container would otherwise
            // report yesterday's health for the whole of the morning punch window.
            : toDateKey(toUtcMidnight(nowWallClock()));

        const [syncCounts, reconcileCounts, syncWorkers, reconcileWorkers, stateRows] = await Promise.all([
            require('../queues/attendance-sync-queue').attendanceSyncQueue.getJobCounts(),
            require('../queues/attendance-reconcile-queue').attendanceReconcileQueue.getJobCounts(),
            // Empty arrays here with a non-zero waiting count is THE symptom of a dead
            // worker process — the single most useful thing this endpoint reports.
            require('../queues/attendance-sync-queue').attendanceSyncQueue.getWorkers(),
            require('../queues/attendance-reconcile-queue').attendanceReconcileQueue.getWorkers(),
            SyncStateModel.aggregate([
                { $match: { date: toUtcMidnight(dateKey) } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
        ]);

        const syncStateCounts = {};
        for (const row of stateRows) syncStateCounts[row._id] = row.count;

        return res.status(200).json({
            dateKey,
            queues: {
                'attendance-sync': syncCounts,
                'attendance-reconcile': reconcileCounts,
            },
            workers: {
                'attendance-sync': syncWorkers.length,
                'attendance-reconcile': reconcileWorkers.length,
            },
            workersAlive: syncWorkers.length > 0 && reconcileWorkers.length > 0,
            syncState: syncStateCounts,
        });
    } catch (error) {
        logger.error('attendance.GetQueueHealth', error);
        // 503, not 500: "the queue layer is unreachable" IS the health answer here, and a
        // monitor should be able to distinguish it from a bug in the handler.
        return res.status(503).json({ healthy: false, error: 'Queue backend unreachable' });
    }
};

module.exports = {
    GetAttendanceCalendar,
    GetDaySummary,
    GetAttendancePeople,
    GetPunchLog,
    CreateManualAttendance,
    DeleteManualAttendance,
    SyncSchoolNow,
    GetSyncState,
    GetQueueHealth,
};
