'use strict';
const RosterModel = require('../models/roster');
const { toUtcMidnight, eachDateInRange } = require('../helpers/date-only');
const { getExpectedShift } = require('../services/roster-lookup');

let GetRosterMonth = async (req, res, next) => {
    const { adminId, personType, year, month } = req.body;
    try {
        // month is 0-11, matching the frontend's Date semantics.
        const firstDay = new Date(Date.UTC(Number(year), Number(month), 1));
        const lastDay = new Date(Date.UTC(Number(year), Number(month) + 1, 0));

        const rosterList = await RosterModel.find({
            adminId: adminId,
            personType: personType,
            date: { $gte: firstDay, $lte: lastDay },
        });
        return res.status(200).json({ rosterList });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleRoster = async (req, res, next) => {
    try {
        const singleRoster = await RosterModel.findOne({ _id: req.params.id });
        return res.status(200).json(singleRoster);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

// Read-only wrapper over the roster-lookup service, so the contract the attendance
// reconciliation will depend on is testable by hand before any worker exists.
let GetExpectedShift = async (req, res, next) => {
    try {
        const { adminId, personType, personId, date } = req.params;
        const shift = await getExpectedShift(adminId, personType, personId, date);
        return res.status(200).json(shift);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateRoster = async (req, res, next) => {
    const { adminId, personType, personId, shiftId, date } = req.body;
    try {
        const rosterDate = toUtcMidnight(date);
        if (!rosterDate) {
            return res.status(400).json('A valid date is required!');
        }
        // Upsert, so re-assigning a day that already has a shift changes it instead of
        // colliding with the unique index.
        const roster = await RosterModel.findOneAndUpdate(
            { adminId: adminId, personType: personType, personId: personId, date: rosterDate },
            { $set: { shiftId: shiftId } },
            { upsert: true, new: true }
        );
        return res.status(200).json('Roster assigned successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let UpdateRoster = async (req, res, next) => {
    // personType/personId/date are treated as immutable identity fields — only the shift is
    // editable. To move an assignment to another person or day, delete and recreate.
    try {
        const id = req.params.id;
        const rosterData = {
            shiftId: req.body.shiftId,
        }
        const update = await RosterModel.findByIdAndUpdate(id, { $set: rosterData }, { new: true });
        return res.status(200).json('Roster updated successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteRoster = async (req, res, next) => {
    try {
        const id = req.params.id;
        const dlt = await RosterModel.findByIdAndRemove(id);
        return res.status(200).json('Roster cleared successfully.');
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

// Response shape is an object (not the plain-string pattern the rest of this file uses)
// because the frontend reports the counts back to the user — the same deliberate,
// isolated exception AssignCard/BulkAssignCard make in biometric-mapping.js.
let BulkAssignRoster = async (req, res, next) => {
    const { adminId, personType, personIds, shiftId, fromDate, toDate, weekdays } = req.body;
    try {
        if (!personIds || personIds.length === 0) {
            return res.status(400).json('Select at least one person!');
        }
        if (!shiftId) {
            return res.status(400).json('Select a shift!');
        }
        const dates = eachDateInRange(fromDate, toDate, weekdays);
        if (dates.length === 0) {
            return res.status(400).json('The selected date range has no matching days!');
        }

        // One bulkWrite for the whole expansion — never a save() per row.
        const operations = [];
        for (const personId of personIds) {
            for (const date of dates) {
                operations.push({
                    updateOne: {
                        filter: { adminId: adminId, personType: personType, personId: personId, date: date },
                        update: { $set: { shiftId: shiftId }, $setOnInsert: { createdAt: new Date() } },
                        upsert: true,
                    }
                });
            }
        }

        const result = await RosterModel.bulkWrite(operations, { ordered: false });
        const assignedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);
        const skippedCount = operations.length - assignedCount;
        return res.status(200).json({ assignedCount: assignedCount, skippedCount: skippedCount });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let BulkClearRoster = async (req, res, next) => {
    const { adminId, personType, personIds, fromDate, toDate, weekdays } = req.body;
    try {
        if (!personIds || personIds.length === 0) {
            return res.status(400).json('Select at least one person!');
        }
        const dates = eachDateInRange(fromDate, toDate, weekdays);
        if (dates.length === 0) {
            return res.status(400).json('The selected date range has no matching days!');
        }

        const result = await RosterModel.deleteMany({
            adminId: adminId,
            personType: personType,
            personId: { $in: personIds },
            date: { $in: dates },
        });
        return res.status(200).json({ clearedCount: result.deletedCount || 0 });
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetRosterMonth,
    GetSingleRoster,
    GetExpectedShift,
    CreateRoster,
    UpdateRoster,
    DeleteRoster,
    BulkAssignRoster,
    BulkClearRoster,
}
