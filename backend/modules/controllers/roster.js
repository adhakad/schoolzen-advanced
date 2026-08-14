'use strict';
const RosterModel = require('../models/roster');
// parseDateKey is shared with services/roster-lookup.js — no Date arithmetic anywhere in
// the write path, the string IS the source of truth, so nothing can drift by a day/month.
const { toDateKey, parseDateKey, eachDateInRange } = require('../helpers/date-only');
const { getExpectedShift } = require('../services/roster-lookup');

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