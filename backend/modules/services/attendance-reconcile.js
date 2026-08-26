'use strict';
const mongoose = require('mongoose');
const PunchLogModel = require('../models/punch-log');
const DailyAttendanceModel = require('../models/daily-attendance');
const { getExpectedShiftsForDate } = require('./roster-lookup');
const { getStudentShiftMap } = require('./class-shift-lookup');
const { getHolidayMapForDate } = require('./holiday-lookup');
const { getApprovedLeavesForDate } = require('./leave-lookup');
const { buildShiftWindows, computeStatus, resolveStatus } = require('./attendance-status');
const { toUtcMidnight } = require('../helpers/date-only');
const logger = require('../helpers/logger');

// THE SLOW PATH. Turn one school-day of raw PunchLog rows into DailyAttendance summaries.
// Allowed to lag minutes-to-hours behind ingestion — the punch already landed and already
// emitted, so nothing looks broken while this catches up.
//
// SHIFT IS EVERYTHING. A person is only assessed if a shift can be resolved for them on
// this date:
//   staff / teacher -> Roster       (per person, per day)
//   student         -> ClassShift   (per class, every day)
// Anyone else is skipped and writes no row, which the calendar reads as Absent. Their
// punches are discarded, so an unrostered school produces no attendance at all — that is
// intended, and the per-job `unshiftedCount` warn below is what makes it diagnosable
// instead of mystifying.
//
// COST MODEL — a fixed number of round-trips per school-day, independent of headcount AND
// independent of how many times people punched:
//   1 puncher aggregation (one row per PERSON, not per punch)
// + 2 roster/shift + 1 classShift + 1 classShift-shift + 1 student-class
// + 4 holiday (2 assignment scans + template + holiday reads) + 1 leave + 1 override scan
// + 1 WINDOWED punch aggregation (both windows in a single $facet)
// + ceil(personCount / 1000) bulkWrites.
// Nothing here is per-punch or per-person round-tripped.

// Mongo caps a single bulkWrite at 100k ops; 1000 keeps each round-trip small enough that a
// large school still commits inside the default 60s transaction lifetime.
const WRITE_CHUNK_SIZE = 1000;

const chunk = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
};

// Composite key `${personType}|${personId}` — the same key roster-lookup.js and
// leave-lookup.js batch on, so every map in this file is readable with one lookup.
const personKeyOf = (personType, personId) => `${personType}|${personId}`;

/**
 * PASS 1 — who punched today, and how many times.
 *
 * Just the roll-call: the arrival/departure windows are per-shift, so we cannot ask the
 * database for firstIn/lastOut until we know which shift each of these people is on. That
 * is what PASS 2 does.
 *
 * The $match is a pure equality seek on PunchLog's { adminId, date, personType, personId }
 * index — which is exactly why models/punch-log.js denormalises `date` alongside
 * `punchTime`: matching a calendar day on punchTime would be a range scan instead. Because
 * personType+personId are the next keys in that same index, the $group runs over
 * already-ordered input and needs no in-memory sort.
 *
 * NOTE ON .lean(): aggregate() never hydrates Mongoose documents — its output is already
 * plain objects, so .lean() does not apply to it. Every other read in this file is
 * explicitly .lean()-ed.
 *
 * @returns {Promise<Array>} [{ _id: { personType, personId }, punchCount }]
 */
const getPunchersForDate = async (adminId, date) => {
    return PunchLogModel.aggregate([
        { $match: { adminId, date } },
        {
            $group: {
                _id: { personType: '$personType', personId: '$personId' },
                // Every punch, in-window or not. Stored on the row as the audit count
                // behind the calendar cell; it is NOT an input to the status.
                punchCount: { $sum: 1 },
            },
        },
    ]);
};

/**
 * PASS 2 — the earliest ARRIVAL and the latest DEPARTURE for every person, with each
 * person measured against their own shift's windows.
 *
 * One round-trip for both windows. $facet runs both sub-pipelines over the same already
 * index-matched stream, so the school-day's punches are read once, not twice.
 *
 * The windows differ per shift, so each shift contributes one $or branch scoped to the
 * people on it. A school has a handful of shifts, so this is a handful of branches — the
 * personId lists inside them are the only thing that grows with headcount, and they hold
 * only people who actually punched.
 *
 * @param {String} adminId
 * @param {Date} date
 * @param {Array} buckets [{ windows, peopleByType: Map<personType, String[]> }]
 * @returns {Promise<Object>} { arrivals: [{_id, firstIn}], departures: [{_id, lastOut}] }
 */
const aggregateWindowedPunches = async (adminId, date, buckets) => {
    const empty = { arrivals: [], departures: [] };

    const inWindowClauses = [];
    const outWindowClauses = [];
    for (const bucket of buckets) {
        for (const [personType, personIds] of bucket.peopleByType) {
            if (personIds.length === 0) continue;
            inWindowClauses.push({
                personType,
                personId: { $in: personIds },
                // Half-open: $lt, not $lte. The arrival window ends exactly where the
                // departure window starts, so this is what stops one punch counting twice.
                punchTime: { $gte: bucket.windows.inFrom, $lt: bucket.windows.inTo },
            });
            // Students have no departure — computeStatus discards lastOut for them and
            // punch-ingest never stored an out-punch in the first place. Not adding the
            // branch at all keeps the $or narrow rather than matching rows we throw away.
            if (personType === 'student') continue;
            outWindowClauses.push({
                personType,
                personId: { $in: personIds },
                punchTime: { $gte: bucket.windows.outFrom, $lte: bucket.windows.outTo },
            });
        }
    }
    if (inWindowClauses.length === 0) return empty;

    const groupId = { personType: '$personType', personId: '$personId' };
    const facetSpec = {
        arrivals: [
            { $match: { $or: inWindowClauses } },
            { $group: { _id: groupId, firstIn: { $min: '$punchTime' } } },
        ],
    };
    // A student-only school leaves this empty, and `$or: []` is a hard aggregation error —
    // so the sub-pipeline is omitted entirely rather than run against nothing.
    if (outWindowClauses.length > 0) {
        facetSpec.departures = [
            { $match: { $or: outWindowClauses } },
            { $group: { _id: groupId, lastOut: { $max: '$punchTime' } } },
        ];
    }

    const [facets] = await PunchLogModel.aggregate([
        { $match: { adminId, date } },
        { $facet: facetSpec },
    ]);

    if (!facets) return empty;
    return { arrivals: facets.arrivals || [], departures: facets.departures || [] };
};

/**
 * Recompute DailyAttendance for one school on one date.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {String} args.dateKey "YYYY-MM-DD"
 * @returns {Promise<Object>} { personCount, shiftedCount, unshiftedCount, noArrivalCount,
 *                              skippedOverriddenCount, writtenCount, statusCounts }
 */
const reconcileSchoolDate = async ({ adminId, dateKey }) => {
    const date = toUtcMidnight(dateKey);
    if (!date) throw new Error('reconcileSchoolDate: unparseable dateKey ' + dateKey);

    const summary = {
        personCount: 0,
        shiftedCount: 0,
        unshiftedCount: 0,
        noArrivalCount: 0,
        skippedOverriddenCount: 0,
        writtenCount: 0,
        statusCounts: {},
    };

    // ---- PASS 1: who punched ------------------------------------------------
    const punchers = await getPunchersForDate(adminId, date);
    if (punchers.length === 0) return summary;
    summary.personCount = punchers.length;

    const studentIds = punchers
        .filter((row) => row._id.personType === 'student')
        .map((row) => row._id.personId);

    // ---- Everything the calculation needs, fetched ONCE and in parallel -----
    // None of these is ever re-read inside a loop below.
    const [rosterShifts, studentShifts, holidayByPerson, leaveByPerson, overriddenRows] = await Promise.all([
        // `${personType}|${personId}` -> Shift, from the monthly-snapshot Roster.
        getExpectedShiftsForDate(adminId, date),
        // personId -> Shift, via the punching students' classes.
        getStudentShiftMap(adminId, studentIds),
        // `${personType}|${personId}` -> Holiday. Per-person, NOT school-wide: a holiday
        // reaches somebody only through the HolidayTemplate they are assigned, so the office
        // can be open on a day the classrooms are shut. studentIds is passed so the students
        // who punched can be resolved through their class in the same call.
        getHolidayMapForDate(adminId, date, studentIds),
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

    const overriddenPersonKeys = new Set(
        overriddenRows.map((row) => personKeyOf(row.personType, row.personId)),
    );

    // ---- Resolve each puncher's shift, and bucket by shift ------------------
    // Bucketing is what keeps PASS 2 to one query: everyone on the same shift shares one
    // pair of windows, so the windows are built once per shift rather than once per person.
    const shiftByPersonKey = new Map();
    const windowsByShiftId = new Map();
    const bucketByShiftId = new Map();

    for (const puncher of punchers) {
        const { personType, personId } = puncher._id;
        const personKey = personKeyOf(personType, personId);

        // An admin corrected this day by hand. Their row is the truth and this worker must
        // never touch it — not on this run, not on any later re-sync. Skipped before shift
        // resolution so an overridden person costs nothing.
        if (overriddenPersonKeys.has(personKey)) {
            summary.skippedOverriddenCount += 1;
            continue;
        }

        const shift = personType === 'student'
            ? studentShifts.get(personId)
            : rosterShifts.get(personKey);

        if (!shift) {
            summary.unshiftedCount += 1;
            continue;
        }

        const shiftId = shift._id.toString();
        if (!windowsByShiftId.has(shiftId)) {
            const windows = buildShiftWindows({ date, shift, adminId });
            // An unparseable shift takes its whole bucket with it rather than throwing —
            // one broken settings row must not stop the rest of the school reconciling.
            if (!windows) continue;
            windowsByShiftId.set(shiftId, windows);
            bucketByShiftId.set(shiftId, { windows, peopleByType: new Map() });
        }
        const bucket = bucketByShiftId.get(shiftId);
        if (!bucket) continue;

        if (!bucket.peopleByType.has(personType)) bucket.peopleByType.set(personType, []);
        bucket.peopleByType.get(personType).push(personId);

        shiftByPersonKey.set(personKey, windowsByShiftId.get(shiftId));
        summary.shiftedCount += 1;
    }

    if (summary.unshiftedCount > 0) {
        // The single most useful line in this log. "Everyone shows Absent even though the
        // machine is full of punches" is otherwise very hard to trace back to an empty
        // roster or an unmapped class.
        logger.warn('attendance-reconcile.unshiftedPunchers', {
            adminId, dateKey, unshiftedCount: summary.unshiftedCount,
        });
    }

    // NOT returning early when shiftedCount is 0. People punched but nobody resolved to a
    // shift, which means any DailyAttendance rows still sitting on this date are stale and
    // must be cleared — that clearing happens at the bottom. aggregateWindowedPunches short
    // -circuits on empty buckets without touching the database, so falling through is free.

    // ---- PASS 2: windowed arrivals and departures ---------------------------
    const { arrivals, departures } = await aggregateWindowedPunches(
        adminId, date, [...bucketByShiftId.values()],
    );

    const firstInByPersonKey = new Map();
    for (const row of arrivals) {
        firstInByPersonKey.set(personKeyOf(row._id.personType, row._id.personId), row.firstIn);
    }
    const lastOutByPersonKey = new Map();
    for (const row of departures) {
        lastOutByPersonKey.set(personKeyOf(row._id.personType, row._id.personId), row.lastOut);
    }

    // ---- Build the writes ---------------------------------------------------
    const now = new Date();
    const writeOps = [];

    // Single O(n) pass, n = people who punched. Every lookup inside is an O(1) Map hit.
    for (const puncher of punchers) {
        const { personType, personId } = puncher._id;
        const personKey = personKeyOf(personType, personId);

        const windows = shiftByPersonKey.get(personKey);
        if (!windows) continue; // overridden or unshifted — already counted above

        const computed = computeStatus({
            // Students are banded differently — Present/Late off the arrival alone, and no
            // lastOut at all. computeStatus owns that branch; this just tells it which
            // kind of person it is looking at.
            personType,
            firstIn: firstInByPersonKey.get(personKey) || null,
            lastOut: lastOutByPersonKey.get(personKey) || null,
            punchCount: puncher.punchCount,
            windows,
        });
        // Punched, but never inside the arrival window — a departure-only punch, or someone
        // who turned up hours after the shift had effectively ended. No row: the calendar
        // derives Absent, which is the honest answer.
        if (!computed) {
            summary.noArrivalCount += 1;
            continue;
        }

        // Approved Leave outranks the computed status; a declared Holiday does NOT — anyone
        // reaching this line punched, and a person who came in despite the holiday keeps the
        // status they earned, with holidayId stamped for provenance. See resolveStatus.
        const resolved = resolveStatus({
            holiday: holidayByPerson.get(personKey) || null,
            leave: leaveByPerson.get(personKey) || null,
            computed,
        });
        if (!resolved) continue;

        summary.statusCounts[resolved.status] = (summary.statusCounts[resolved.status] || 0) + 1;

        writeOps.push({
            updateOne: {
                // Matches DailyAttendance's unique { adminId, personType, personId, date }
                // index exactly — an equality seek on every key, so each upsert is a direct
                // index hit rather than a scan. personType is part of that key because
                // personId is only unique WITHIN a type: a student and a staff member can
                // carry the same _id string across their two collections.
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

    // Somebody who used to have an in-window arrival and no longer does (their shift moved,
    // or their class was unmapped) still has a stale row. Clear those in the same
    // transaction so the calendar shows Absent rather than yesterday's answer.
    const staleFilter = {
        adminId,
        date,
        isOverridden: { $ne: true },
        personId: { $nin: writeOps.map((op) => op.updateOne.filter.personId) },
    };

    if (writeOps.length === 0) {
        // Nothing to write, but stale rows may still need clearing.
        const cleared = await DailyAttendanceModel.deleteMany(staleFilter);
        if (cleared.deletedCount > 0) {
            logger.info('attendance-reconcile.clearedStale', {
                adminId, dateKey, clearedCount: cleared.deletedCount,
            });
        }
        return summary;
    }

    // ONE bulkWrite per 1000 people — never a .save() per person. A partially-written
    // school-day would show some people reconciled and others stale with no way to tell
    // which, so the whole day commits or none of it does. Same session/transaction pattern
    // as CreateBulkStudentRecord.
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        for (const batch of chunk(writeOps, WRITE_CHUNK_SIZE)) {
            await DailyAttendanceModel.bulkWrite(batch, { ordered: false, session });
        }
        await DailyAttendanceModel.deleteMany(staleFilter, { session });
        await session.commitTransaction();
        summary.writtenCount = writeOps.length;
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
 * Every (school, date) that has punches — the recovery path for a reconcile job lost to a
 * crash or a Redis flush. Read-only; the caller decides what to enqueue.
 *
 * NOT used by the 5-minute sweep: PunchLog has no index led by `date`, so this would scan
 * the largest collection in the system every tick. cron-attendance-service.js reads the
 * small, indexed SyncState collection instead. Keep this for one-off backfills only.
 *
 * @param {Date|String} date
 * @returns {Promise<String[]>} adminIds
 */
const getSchoolsWithPunchesForDate = async (date) => {
    const utcDate = toUtcMidnight(date);
    if (!utcDate) return [];
    return PunchLogModel.distinct('adminId', { date: utcDate });
};

module.exports = {
    reconcileSchoolDate,
    getSchoolsWithPunchesForDate,
    getPunchersForDate,
    // Re-exported from services/class-shift-lookup.js, where it now lives so the fast path
    // can reach it without requiring this module. Kept here so existing importers of
    // attendance-reconcile.getStudentShiftMap keep working.
    getStudentShiftMap,
};
