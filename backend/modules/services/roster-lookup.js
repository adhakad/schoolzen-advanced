'use strict';
const RosterModel = require('../models/roster');
const ShiftModel = require('../models/shift');
const { parseDateKey } = require('../helpers/date-only');

/**
 * The Shift this person is expected to work on this date, or null when no roster row
 * exists. There is no fallback baseline any more: a staff/teacher with no rostered shift
 * simply produces no DailyAttendance row (see services/attendance-reconcile.js).
 * Express-unaware on purpose: the attendance-reconciliation worker calls this in-process,
 * never over HTTP.
 * Roster is stored as one doc per (adminId+personType+personId+year+month) with a
 * days: Map<"YYYY-MM-DD", shiftId> — so this is a single findOne + O(1) key lookup, never
 * a per-day document scan.
 * @param {String} adminId
 * @param {String} personType 'staff' | 'teacher'
 * @param {String} personId
 * @param {String|Date} date "YYYY-MM-DD" or a Date
 * @returns {Object|null} the Shift document, or null
 */
const getExpectedShift = async (adminId, personType, personId, date) => {
    const parsed = parseDateKey(date);
    if (!parsed) return null;

    const roster = await RosterModel.findOne(
        { adminId, personType, personId, year: parsed.year, month: parsed.month },
        { days: 1, _id: 0 }
    ).lean();
    // .lean() serialises the Map field as a plain object, so a direct key read is enough.
    const shiftId = roster && roster.days ? roster.days[parsed.dateKey] : null;
    if (!shiftId) return null;

    // .lean(): the reconcile worker only ever READS these fields (startTime/graceMinutes),
    // so hydrating a full Mongoose document per shift is pure overhead. _id stays an
    // ObjectId under lean(), so the .toString() in attendance-status.js still works.
    const shift = await ShiftModel.findOne({ _id: shiftId }).lean();
    return shift || null;
};

/**
 * Batch variant — one school + one date -> Map of `${personType}|${personId}` -> Shift.
 * Reconciliation processes a whole school-day at once; at 2000 schools a per-person query
 * would be thousands of round-trips per school per day, so this resolves the day in two
 * queries regardless of headcount: one Roster scan for the month (across both personTypes),
 * then one Shift lookup for the distinct shiftIds actually assigned on that date.
 * @param {String} adminId
 * @param {String|Date} date
 * @returns {Map<String, Object>}
 */
const getExpectedShiftsForDate = async (adminId, date) => {
    const shiftMap = new Map();
    const parsed = parseDateKey(date);
    if (!parsed) return shiftMap;

    const rosterList = await RosterModel.find(
        { adminId, year: parsed.year, month: parsed.month },
        { personType: 1, personId: 1, days: 1, _id: 0 }
    ).lean();
    if (rosterList.length === 0) return shiftMap;

    // Keep only the people who actually have a shift assigned on this exact date —
    // the monthly doc covers every day in the month, most of which aren't `date`.
    const shiftIdByPerson = new Map(); // `${personType}|${personId}` -> shiftId
    for (const roster of rosterList) {
        const shiftId = roster.days && roster.days[parsed.dateKey];
        if (shiftId) shiftIdByPerson.set(`${roster.personType}|${roster.personId}`, shiftId);
    }
    if (shiftIdByPerson.size === 0) return shiftMap;

    const shiftIds = [...new Set(shiftIdByPerson.values())];
    const shiftList = await ShiftModel.find({ _id: { $in: shiftIds } }).lean();

    const shiftById = new Map();
    for (const shift of shiftList) {
        shiftById.set(shift._id.toString(), shift);
    }

    for (const [key, shiftId] of shiftIdByPerson) {
        const shift = shiftById.get(shiftId);
        if (shift) shiftMap.set(key, shift);
    }
    return shiftMap;
};

module.exports = {
    getExpectedShift,
    getExpectedShiftsForDate,
};
