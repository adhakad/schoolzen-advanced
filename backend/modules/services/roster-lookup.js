'use strict';
const RosterModel = require('../models/roster');
const ShiftModel = require('../models/shift');
const { toUtcMidnight } = require('../helpers/date-only');

/**
 * The Shift this person is expected to work on this date, or null when no roster row
 * exists — the caller then falls back to the school's AttendanceRule.
 * Express-unaware on purpose: the attendance-reconciliation worker calls this in-process,
 * never over HTTP.
 * @param {String} adminId
 * @param {String} personType 'staff' | 'teacher'
 * @param {String} personId
 * @param {String|Date} date "YYYY-MM-DD" or a Date
 * @returns {Object|null} the Shift document, or null
 */
const getExpectedShift = async (adminId, personType, personId, date) => {
    const rosterDate = toUtcMidnight(date);
    if (!rosterDate) return null;

    const roster = await RosterModel.findOne({
        adminId: adminId,
        personType: personType,
        personId: personId,
        date: rosterDate,
    });
    if (!roster) return null;

    const shift = await ShiftModel.findOne({ _id: roster.shiftId });
    return shift || null;
};

/**
 * Batch variant — one school + one date -> Map of `${personType}|${personId}` -> Shift.
 * Reconciliation processes a whole school-day at once; at 2000 schools a per-person query
 * would be thousands of round-trips per school per day, so this resolves the day in two
 * queries regardless of headcount.
 * @param {String} adminId
 * @param {String|Date} date
 * @returns {Map<String, Object>}
 */
const getExpectedShiftsForDate = async (adminId, date) => {
    const shiftMap = new Map();
    const rosterDate = toUtcMidnight(date);
    if (!rosterDate) return shiftMap;

    const rosterList = await RosterModel.find({ adminId: adminId, date: rosterDate });
    if (rosterList.length === 0) return shiftMap;

    const shiftIds = [...new Set(rosterList.map((roster) => roster.shiftId))];
    const shiftList = await ShiftModel.find({ _id: { $in: shiftIds } });

    const shiftById = new Map();
    for (const shift of shiftList) {
        shiftById.set(shift._id.toString(), shift);
    }

    for (const roster of rosterList) {
        const shift = shiftById.get(roster.shiftId);
        if (shift) {
            shiftMap.set(`${roster.personType}|${roster.personId}`, shift);
        }
    }
    return shiftMap;
};

module.exports = {
    getExpectedShift,
    getExpectedShiftsForDate,
};
