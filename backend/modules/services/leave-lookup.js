'use strict';
const LeaveRequestModel = require('../models/leave-request');
const { toDateKey } = require('../helpers/date-only');

// Approved leave, in the three shapes the attendance pipeline reads it.
//
// Express-unaware and called in-process, the same as roster-lookup.js — the reconcile
// worker has no HTTP layer to go through.
//
// EVERY LOOKUP READS `leaveDates`, NEVER THE fromDate/toDate RANGE. Approval expands the
// requested range into the days actually granted, dropping Sundays and holidays
// (controllers/leave-request.js `expandLeaveDates`), so a range-based lookup here would
// report a Sunday as Leave that no DailyAttendance row backs — the calendar and the
// reconciler would then disagree about the same day. The range is still used to NARROW a
// month query, because it is indexed and the array is not usefully range-scannable; the
// leaveDates intersection afterwards is what makes the answer exact.
//
// Batched by (school, date) and (school, month) for the reason roster-lookup.js is:
// reconciliation processes a whole school-day at once, and the grid renders a whole
// school-month at once. A per-person query would be thousands of round-trips per school.

// The same composite key roster-lookup.js and attendance-reconcile.js batch on, so the
// worker can read both maps with one lookup.
const personKeyOf = (personType, personId) => `${personType}|${personId}`;

// UTC midnights bracketing the month, plus the "YYYY-MM" prefix used to filter leaveDates
// down to this month. A string prefix test is exact on "YYYY-MM-DD" and needs no Date
// arithmetic — the same trick attendance-calendar.js uses for its today/future compare.
const monthBounds = (year, month) => {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    // Day 0 of the NEXT month is the last day of this one, so this needs no leap-year table.
    const monthEnd = new Date(Date.UTC(year, month, 0));
    return { monthStart, monthEnd, prefix: `${year}-${`${month}`.padStart(2, '0')}` };
};

/**
 * Approved leave covering one school-day.
 *
 * One equality seek on { adminId, status, leaveDates } — the multikey index declared on
 * models/leave-request.js exists for exactly this call.
 *
 * @param {String} adminId
 * @param {Date|String} date
 * @returns {Promise<Map<String, Object>>} "personType|personId" -> LeaveRequest doc
 */
const getApprovedLeavesForDate = async (adminId, date) => {
    const leaveMap = new Map();
    const dateKey = date instanceof Date ? toDateKey(date) : String(date).slice(0, 10);
    if (!adminId || !dateKey) return leaveMap;

    const requests = await LeaveRequestModel
        .find({ adminId, status: 'Approved', leaveDates: dateKey })
        .lean();

    for (const request of requests) {
        leaveMap.set(personKeyOf(request.personType, request.personId), request);
    }
    return leaveMap;
};

/**
 * One person's approved leave across one month — the per-person calendar read path.
 *
 * @param {String} adminId
 * @param {String} personType 'student' | 'teacher' | 'staff'
 * @param {String} personId
 * @param {Number} year
 * @param {Number} month 1-12 (August = 8), matching helpers/date-only.js parseDateKey
 * @returns {Promise<Map<String, Object>>} "YYYY-MM-DD" -> LeaveRequest doc
 */
const getLeaveMapForMonth = async (adminId, personType, personId, year, month) => {
    const leaveMap = new Map();
    if (!adminId || !personType || !personId || !year || !month) return leaveMap;

    const { monthStart, monthEnd, prefix } = monthBounds(year, month);

    // Overlap, not containment: a request running 28 Jul - 3 Aug is leave in BOTH months,
    // so anything starting on or before the month ends and finishing on or after it starts
    // has to be considered.
    const requests = await LeaveRequestModel
        .find({
            adminId,
            personType,
            personId,
            status: 'Approved',
            fromDate: { $lte: monthEnd },
            toDate: { $gte: monthStart },
        })
        .lean();

    for (const request of requests) {
        for (const dateKey of request.leaveDates || []) {
            if (dateKey.startsWith(prefix)) leaveMap.set(dateKey, request);
        }
    }
    return leaveMap;
};

/**
 * A WHOLE SCHOOL's approved leave for one month, for the calendar grid.
 *
 * The batched form services/attendance-calendar.js's getSchoolMonthGrid needs: one query
 * regardless of headcount, where calling getLeaveMapForMonth per row would be one query per
 * person. That is the whole reason this exists as a third export rather than the caller
 * looping.
 *
 * @param {String} adminId
 * @param {String} personType
 * @param {Number} year
 * @param {Number} month 1-12
 * @returns {Promise<Map<String, Map<String, Object>>>} personId -> ("YYYY-MM-DD" -> LeaveRequest)
 */
const getLeaveMapForSchoolMonth = async (adminId, personType, year, month) => {
    const byPersonId = new Map();
    if (!adminId || !personType || !year || !month) return byPersonId;

    const { monthStart, monthEnd, prefix } = monthBounds(year, month);

    const requests = await LeaveRequestModel
        .find({
            adminId,
            personType,
            status: 'Approved',
            fromDate: { $lte: monthEnd },
            toDate: { $gte: monthStart },
        })
        .lean();

    for (const request of requests) {
        const personId = String(request.personId);
        if (!byPersonId.has(personId)) byPersonId.set(personId, new Map());
        const personMap = byPersonId.get(personId);
        for (const dateKey of request.leaveDates || []) {
            if (dateKey.startsWith(prefix)) personMap.set(dateKey, request);
        }
    }
    return byPersonId;
};

module.exports = { getApprovedLeavesForDate, getLeaveMapForMonth, getLeaveMapForSchoolMonth };
