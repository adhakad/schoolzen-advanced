'use strict';
const mongoose = require('mongoose');
const PunchLogModel = require('../models/punch-log');
const DailyAttendanceModel = require('../models/daily-attendance');
const AttendanceRuleModel = require('../models/attendance-rule');
const { getExpectedShiftsForDate } = require('./roster-lookup');
const { getHolidayForDate } = require('./holiday-lookup');
const { getApprovedLeavesForDate } = require('./leave-lookup');
const { computeStatus, resolveStatus } = require('./attendance-status');
const { toUtcMidnight } = require('../helpers/date-only');
const logger = require('../helpers/logger');

// THE SLOW PATH. Turn one school-day of raw PunchLog rows into DailyAttendance summaries.
// Allowed to lag minutes-to-hours behind ingestion — the punch already landed and already
// emitted, so nothing looks broken while this catches up.
//
// Fixed query budget per school-day, independent of headcount:
//   1 punch scan + 1 rule + 2 roster/shift + 1 holiday + 1 leave + 1 override scan + N/1000 writes.
// A per-person lookup anywhere in here would be thousands of round-trips per school.

// Mongo caps a single bulkWrite at 100k ops; 1000 keeps each round-trip small enough that a
// large school still commits inside the default 60s transaction lifetime.
const WRITE_CHUNK_SIZE = 1000;

const chunk = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
};

/**
 * Recompute DailyAttendance for one school on one date.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {String} args.dateKey "YYYY-MM-DD"
 * @returns {Promise<Object>} { personCount, writtenCount, skippedOverriddenCount, statusCounts }
 */
const reconcileSchoolDate = async ({ adminId, dateKey }) => {
    const date = toUtcMidnight(dateKey);
    if (!date) throw new Error(`reconcileSchoolDate: unparseable dateKey "${dateKey}"`);

    const summary = {
        personCount: 0,
        writtenCount: 0,
        skippedOverriddenCount: 0,
        statusCounts: {},
    };

    // Equality match on the { adminId, date, personType, personId } index — never a range
    // scan, which is why PunchLog denormalises `date` alongside `punchTime`.
    const punches = await PunchLogModel
        .find({ adminId, date }, { personType: 1, personId: 1, punchTime: 1, _id: 0 })
        .lean();
    if (punches.length === 0) return summary;

    // Group into `personType|personId` -> punches. Same composite key roster-lookup.js and
    // leave-lookup.js batch on, so all three maps are readable with one key.
    const punchesByPerson = new Map();
    for (const punch of punches) {
        const key = `${punch.personType}|${punch.personId}`;
        if (!punchesByPerson.has(key)) punchesByPerson.set(key, []);
        punchesByPerson.get(key).push(punch);
    }
    summary.personCount = punchesByPerson.size;

    const [rule, shiftMap, holiday, leaveMap, overriddenRows] = await Promise.all([
        AttendanceRuleModel.findOne({ adminId }).lean(),
        // Students are filtered out inside computeStatus() — this map only ever resolves
        // staff/teacher, because models/roster.js does not enum 'student'.
        getExpectedShiftsForDate(adminId, date),
        getHolidayForDate(adminId, date),
        getApprovedLeavesForDate(adminId, date),
        // Manual overrides are read UP FRONT and excluded below rather than filtered in the
        // write. An upsert whose filter carried `isOverridden: { $ne: true }` would match
        // nothing for an overridden person and then try to INSERT a second row for the same
        // (adminId, personType, personId, date) — a guaranteed duplicate-key error against
        // DailyAttendance's unique index.
        DailyAttendanceModel
            .find({ adminId, date, isOverridden: true }, { personType: 1, personId: 1, _id: 0 })
            .lean(),
    ]);

    if (!rule) {
        // Not fatal: computeStatus() falls back to Present-with-no-baseline and says so in
        // the log. Recorded here too because "every teacher shows Present" is otherwise a
        // very confusing symptom to trace back to a missing settings row.
        logger.warn('attendance-reconcile.noAttendanceRule', { adminId, dateKey });
    }

    const overriddenKeys = new Set(overriddenRows.map((row) => `${row.personType}|${row.personId}`));

    const now = new Date();
    const ops = [];

    for (const [key, personPunches] of punchesByPerson) {
        if (overriddenKeys.has(key)) {
            summary.skippedOverriddenCount += 1;
            continue;
        }

        const [personType, personId] = key.split('|');

        const computed = computeStatus({
            date,
            punches: personPunches,
            rule,
            shift: shiftMap.get(key) || null,
            personType,
            adminId,
        });
        // null only when there are no punches, which cannot happen inside this loop —
        // guarded anyway so a future caller can't write a statusless row.
        if (!computed) continue;

        const resolved = resolveStatus({
            holiday,
            leave: leaveMap.get(key) || null,
            computed,
        });
        if (!resolved) continue;

        summary.statusCounts[resolved.status] = (summary.statusCounts[resolved.status] || 0) + 1;

        ops.push({
            updateOne: {
                filter: { adminId, personType, personId, date },
                update: {
                    $set: {
                        status: resolved.status,
                        firstIn: resolved.firstIn,
                        lastOut: resolved.lastOut,
                        punchCount: resolved.punchCount,
                        lateByMinutes: resolved.lateByMinutes != null ? resolved.lateByMinutes : null,
                        expectedStart: resolved.expectedStart,
                        shiftId: resolved.shiftId || null,
                        holidayId: resolved.holidayId || null,
                        leaveRequestId: resolved.leaveRequestId || null,
                        source: 'WDMS',
                        updatedAt: now,
                    },
                    // isOverridden is set ONLY on insert. Re-asserting false on every run
                    // would let a reconcile silently un-override a row an admin corrected
                    // between the override write and this pass.
                    $setOnInsert: { isOverridden: false, overriddenBy: null, createdAt: now },
                },
                upsert: true,
            },
        });
    }

    if (ops.length === 0) return summary;

    // A partially-written school-day would show some people reconciled and others stale
    // with no way to tell which — so the whole day commits or none of it does. Same
    // session/transaction pattern as CreateBulkStudentRecord.
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        for (const batch of chunk(ops, WRITE_CHUNK_SIZE)) {
            await DailyAttendanceModel.bulkWrite(batch, { ordered: false, session });
        }
        await session.commitTransaction();
        summary.writtenCount = ops.length;
    } catch (error) {
        await session.abortTransaction();
        logger.error('attendance-reconcile.writeFailed', error);
        throw error;
    } finally {
        session.endSession();
    }

    logger.info('attendance-reconcile.done', { adminId, dateKey, ...summary });
    return summary;
};

/**
 * Every (school, date) that has punches but no DailyAttendance rows yet — the recovery
 * path for a reconcile job lost to a crash or a Redis flush. Read-only; the caller decides
 * what to enqueue.
 * @param {Date|String} date
 * @returns {Promise<String[]>} adminIds
 */
const getSchoolsWithPunchesForDate = async (date) => {
    const utcDate = toUtcMidnight(date);
    if (!utcDate) return [];
    return PunchLogModel.distinct('adminId', { date: utcDate });
};

module.exports = { reconcileSchoolDate, getSchoolsWithPunchesForDate };
