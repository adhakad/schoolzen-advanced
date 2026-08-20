'use strict';
const RosterModel = require('../models/roster');
// parseDateKey is shared with services/roster-lookup.js — no Date arithmetic anywhere in
// the write path, the string IS the source of truth, so nothing can drift by a day/month.
const { toUtcMidnight, toDateKey, parseDateKey, eachDateInRange } = require('../helpers/date-only');
const { getExpectedShift } = require('../services/roster-lookup');
const { nowWallClock } = require('../helpers/attendance-time');
const logger = require('../helpers/logger');

// ---------------------------------------------------------------------------
// INTERNAL HELPER — patch a single person's monthly doc
// dayUpdates: { "YYYY-MM-DD": shiftId }  → set that day
//             { "YYYY-MM-DD": null }     → unset (remove) that day
// Uses atomic $set/$unset on the Map subdoc — never loads the whole doc.
// ---------------------------------------------------------------------------
const patchDays = async (adminId, personType, personId, year, month, dayUpdates) => {
    const setFields   = { updatedAt: new Date() };
    const unsetFields = {};

    for (const [dateKey, shiftId] of Object.entries(dayUpdates)) {
        if (shiftId) {
            setFields[`days.${dateKey}`] = shiftId;
        } else {
            unsetFields[`days.${dateKey}`] = '';
        }
    }

    const update = {
        $set: setFields,
        $setOnInsert: { createdAt: new Date() },
    };
    if (Object.keys(unsetFields).length) update.$unset = unsetFields;

    return RosterModel.findOneAndUpdate(
        { adminId, personType, personId, year, month },
        update,
        { upsert: true, new: true }
    );
};

// ---------------------------------------------------------------------------
// INTERNAL HELPER — queue the attendance recompute for the days a roster edit touched
//
// Roster supplies the EXPECTED SHIFT that services/attendance-status.js measures a punch
// against: the shift startTime becomes the baseline, and its graceMinutes overrides the
// school-wide lateAfter. So moving somebody from an 09:00 shift to an 11:00 one silently
// invalidates every DailyAttendance row already written for those dates — the stored
// status, lateByMinutes and expectedStart all still describe the OLD shift. Without this,
// the calendar keeps showing Late until something unrelated happens to re-reconcile that
// day, and payroll reads the stale row as fact.
//
// Cheap by construction:
//  - addReconcileJob dedupes on jobId (reconcile-<adminId>-<dateKey>), so bulk-assigning
//    500 people across 26 days queues at most 26 jobs, not 13,000. One reconcile recomputes
//    the whole school-day for everyone on it, so headcount never multiplies the job count.
//  - FUTURE dates are skipped: they have no punches yet, so the job would scan, find
//    nothing and exit. Those days get reconciled for free once their punches land, because
//    services/punch-ingest.js enqueues on insert.
//  - Never throws. The roster rows are already committed and the request already succeeded;
//    turning that into a 500 because Redis blinked would be strictly worse than a late
//    recompute. Today is re-enqueued by the 5-minute sweep regardless.
// ---------------------------------------------------------------------------
const enqueueReconcileForDates = async (adminId, dateKeys) => {
    if (!adminId || !Array.isArray(dateKeys) || dateKeys.length === 0) return 0;

    // "Today" in the SCHOOL wall clock, not the server one — a container running UTC would
    // treat the current Indian school day as a future date until 05:30 and skip it.
    const todayKey = toDateKey(toUtcMidnight(nowWallClock()));
    // Lexicographic compare is exact on "YYYY-MM-DD" and needs no Date arithmetic.
    const dueDateKeys = [...new Set(dateKeys)].filter((dateKey) => dateKey <= todayKey);
    if (dueDateKeys.length === 0) return 0;

    try {
        // Lazily required, for the reason spelled out in controllers/attendance.js:
        // queues/connection.js throws at require-time when Redis is not configured, and
        // routes.js requires this controller at boot — an eager require would make a
        // missing REDIS_URL 500 every roster endpoint, the read-only ones included.
        const { addReconcileJob } = require('../queues/attendance-reconcile-queue');
        for (const dateKey of dueDateKeys) {
            // delay 0, unlike the punch fast path 3-minute debounce: a roster edit is a
            // deliberate human action with somebody watching the calendar for the change.
            await addReconcileJob(adminId, dateKey, { delay: 0 });
        }
        logger.info('roster.reconcileEnqueued', { adminId, dateCount: dueDateKeys.length });
        return dueDateKeys.length;
    } catch (error) {
        logger.error('roster.reconcileEnqueueFailed', error);
        return 0;
    }
};

// ---------------------------------------------------------------------------
// GET /roster-month?adminId=&personType=&year=&month=
// Returns flat rosterMap { "personId|YYYY-MM-DD": shiftId } — one DB scan.
// ---------------------------------------------------------------------------
let GetRosterMonth = async (req, res, next) => {
    const { adminId, personType } = req.query;
    const year  = Number(req.query.year);
    const month = Number(req.query.month);
    try {
        // Bad/missing period params must return nothing — never an unfiltered month scan.
        if (!adminId || !personType || !Number.isInteger(year) || !Number.isInteger(month)) {
            return res.status(200).json({ rosterMap: {} });
        }

        const docs = await RosterModel
            .find({ adminId, personType, year, month }, { personId: 1, days: 1, _id: 0 })
            .lean();

        // Flat map: "personId|YYYY-MM-DD" -> shiftId (O(1) cell lookup on the client)
        const rosterMap = {};
        for (const doc of docs) {
            if (!doc.days) continue;
            for (const [dateKey, shiftId] of Object.entries(doc.days)) {
                if (shiftId) rosterMap[`${doc.personId}|${dateKey}`] = shiftId;
            }
        }

        return res.status(200).json({ rosterMap });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// GET /expected-shift/:adminId/:personType/:personId/:date
// Read-only shift lookup for attendance reconciliation worker
// ---------------------------------------------------------------------------
let GetExpectedShift = async (req, res, next) => {
    try {
        const { adminId, personType, personId, date } = req.params;
        const shift = await getExpectedShift(adminId, personType, personId, date);
        return res.status(200).json(shift);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// POST /  — single cell ASSIGN (click one grid cell → pick shift)
// Body: { adminId, personType, personId, shiftId, date: "YYYY-MM-DD" }
// ---------------------------------------------------------------------------
let CreateRoster = async (req, res, next) => {
    const { adminId, personType, personId, shiftId, date } = req.body;
    try {
        if (!date || !shiftId) return res.status(400).json('Date and shift are required!');

        const parsed = parseDateKey(date);
        if (!parsed) return res.status(400).json('A valid date is required!');

        await patchDays(adminId, personType, personId, parsed.year, parsed.month, {
            [parsed.dateKey]: shiftId,
        });

        // The new shift is this person expected start for that day now — recompute it.
        await enqueueReconcileForDates(adminId, [parsed.dateKey]);

        return res.status(200).json('Roster assigned successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// DELETE /  — single cell REMOVE (click cell → clear shift)
// Body: { adminId, personType, personId, date: "YYYY-MM-DD" }
// Uses DELETE with body (supported by Express; Angular HttpClient passes { body })
// ---------------------------------------------------------------------------
let DeleteRoster = async (req, res, next) => {
    const { adminId, personType, personId, date } = req.body;
    try {
        if (!date) return res.status(400).json('Date is required!');

        const parsed = parseDateKey(date);
        if (!parsed) return res.status(400).json('A valid date is required!');

        await patchDays(adminId, personType, personId, parsed.year, parsed.month, {
            [parsed.dateKey]: null,   // null -> $unset this day key
        });

        // Clearing matters as much as assigning: with no rostered shift there is no
        // baseline left to measure a punch against, so the person drops out of
        // DailyAttendance entirely and any already-stored Late for that day is now wrong.
        await enqueueReconcileForDates(adminId, [parsed.dateKey]);

        return res.status(200).json('Roster cleared successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// POST /bulk-assign — assign shift to many persons across a date range
// Groups dates by month → one DB op per (person, month), not per (person, day)
// ---------------------------------------------------------------------------
let BulkAssignRoster = async (req, res, next) => {
    const { adminId, personType, personIds, shiftId, fromDate, toDate, weekdays } = req.body;
    try {
        if (!personIds?.length)  return res.status(400).json('Select at least one person!');
        if (!shiftId)            return res.status(400).json('Select a shift!');

        const dates = eachDateInRange(fromDate, toDate, weekdays);
        if (!dates.length) return res.status(400).json('The selected date range has no matching days!');

        // Group expanded dates by year+month
        // Group by (year, month) parsed from the dateKey string itself
        const monthGroups = new Map();
        for (const d of dates) {
            const parsed = parseDateKey(toDateKey(d));
            if (!parsed) continue;
            const key = `${parsed.year}-${parsed.month}`;
            if (!monthGroups.has(key)) {
                monthGroups.set(key, { year: parsed.year, month: parsed.month, dateKeys: [] });
            }
            monthGroups.get(key).dateKeys.push(parsed.dateKey);
        }

        // One bulkWrite op per (person × month), not per (person × day)
        const ops = [];
        for (const personId of personIds) {
            for (const { year, month, dateKeys } of monthGroups.values()) {
                const setFields = { updatedAt: new Date() };
                for (const dk of dateKeys) setFields[`days.${dk}`] = shiftId;

                ops.push({
                    updateOne: {
                        filter: { adminId, personType, personId, year, month },
                        update: {
                            $set: setFields,
                            $setOnInsert: { createdAt: new Date() },
                        },
                        upsert: true,
                    },
                });
            }
        }

        const result = await RosterModel.bulkWrite(ops, { ordered: false });
        const assignedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);

        // Every touched day, collapsed to one reconcile per school-date inside the helper —
        // the personIds do not multiply the job count.
        const touchedDateKeys = [];
        for (const group of monthGroups.values()) touchedDateKeys.push(...group.dateKeys);
        await enqueueReconcileForDates(adminId, touchedDateKeys);

        return res.status(200).json({ assignedCount, skippedCount: ops.length - assignedCount });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};

// ---------------------------------------------------------------------------
// POST /bulk-clear — unset shift keys for many persons across a date range
// ---------------------------------------------------------------------------
let BulkClearRoster = async (req, res, next) => {
    const { adminId, personType, personIds, fromDate, toDate, weekdays } = req.body;
    try {
        if (!personIds?.length) return res.status(400).json('Select at least one person!');

        const dates = eachDateInRange(fromDate, toDate, weekdays);
        if (!dates.length) return res.status(400).json('The selected date range has no matching days!');

        // Group by (year, month) parsed from the dateKey string itself
        const monthGroups = new Map();
        for (const d of dates) {
            const parsed = parseDateKey(toDateKey(d));
            if (!parsed) continue;
            const key = `${parsed.year}-${parsed.month}`;
            if (!monthGroups.has(key)) {
                monthGroups.set(key, { year: parsed.year, month: parsed.month, dateKeys: [] });
            }
            monthGroups.get(key).dateKeys.push(parsed.dateKey);
        }

        const ops = [];
        for (const personId of personIds) {
            for (const { year, month, dateKeys } of monthGroups.values()) {
                const unsetFields = {};
                for (const dk of dateKeys) unsetFields[`days.${dk}`] = '';

                ops.push({
                    updateOne: {
                        filter: { adminId, personType, personId, year, month },
                        update: {
                            $unset: unsetFields,
                            $set: { updatedAt: new Date() },
                        },
                    },
                });
            }
        }

        const result = await RosterModel.bulkWrite(ops, { ordered: false });

        const touchedDateKeys = [];
        for (const group of monthGroups.values()) touchedDateKeys.push(...group.dateKeys);
        await enqueueReconcileForDates(adminId, touchedDateKeys);

        return res.status(200).json({ clearedCount: result.modifiedCount || 0 });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};

module.exports = {
    GetRosterMonth,
    GetExpectedShift,
    CreateRoster,
    DeleteRoster,
    BulkAssignRoster,
    BulkClearRoster,
};