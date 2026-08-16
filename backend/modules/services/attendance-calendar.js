'use strict';
const DailyAttendanceModel = require('../models/daily-attendance');
const RosterModel = require('../models/roster');
const { getHolidayMapForMonth } = require('./holiday-lookup');
const { getLeaveMapForMonth } = require('./leave-lookup');
const { getPerson, personCode } = require('./person-lookup');
const { toUtcMidnight, toDateKey } = require('../helpers/date-only');
const { nowWallClock } = require('../helpers/attendance-time');

// THE READ PATH. One person + one month -> a day-by-day status list for the calendar UI.
//
// DailyAttendance only holds rows for people who actually punched (see the header of
// models/daily-attendance.js) — so "Absent" does not exist in the database, it is DERIVED
// here from the absence of a row on a day the person was expected. That is the whole
// reason this file exists rather than the controller just dumping the collection.
//
// Two statuses returned here are read-time only and are NOT in DailyAttendance's enum:
//   'Off'     — the person was not expected that day (no rostered shift; Sunday for students)
//   ''        — a future date, nothing to say about it yet
// Persisting either would mean writing ~60M placeholder rows a month at target scale.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Students are never rostered, so their non-working days have to come from somewhere.
// Sunday is the one this codebase already assumes — pages/admin/roster marks exactly
// `dow === 0` as the weekend column.
const STUDENT_WEEKLY_OFF = [0];

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Which days of this month the person is rostered on. Single findOne against the monthly
 * snapshot — O(1) per day afterwards, never a per-day query (see CLAUDE.md's
 * monthly-snapshot pattern).
 * @returns {Promise<{hasRoster: Boolean, shiftIdByDateKey: Object}>}
 *          hasRoster false means the school does not roster this person at all, in which
 *          case every weekday is treated as expected rather than every day as 'Off'.
 */
const getRosterDays = async (adminId, personType, personId, year, month) => {
    if (personType === 'student') return { hasRoster: false, shiftIdByDateKey: {} };

    const roster = await RosterModel
        .findOne({ adminId, personType, personId, year, month }, { days: 1, _id: 0 })
        .lean();

    const days = (roster && roster.days) || {};
    return { hasRoster: Object.keys(days).length > 0, shiftIdByDateKey: days };
};

/**
 * A person's month, day by day.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {String} args.personType 'student' | 'teacher' | 'staff'
 * @param {String} args.personId
 * @param {Number} args.year
 * @param {Number} args.month 1-12 (August = 8), matching helpers/date-only.js
 * @returns {Promise<Object>} { person, year, month, days: [...], summary: {...} }
 */
const getPersonMonth = async ({ adminId, personType, personId, year, month }) => {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const totalDays = daysInMonth(year, month);
    const monthEnd = new Date(Date.UTC(year, month - 1, totalDays));

    const [person, rows, holidayMap, leaveMap, roster] = await Promise.all([
        getPerson(personType, personId),
        // Equality on adminId+personType+personId, range on date — exactly the shape of
        // DailyAttendance's leading unique index, so this is one index walk.
        DailyAttendanceModel
            .find({ adminId, personType, personId, date: { $gte: monthStart, $lte: monthEnd } })
            .lean(),
        getHolidayMapForMonth(adminId, year, month),
        getLeaveMapForMonth(adminId, personType, personId, year, month),
        getRosterDays(adminId, personType, personId, year, month),
    ]);

    const rowByDateKey = new Map();
    for (const row of rows) rowByDateKey.set(toDateKey(row.date), row);

    // "Today" in the SCHOOL's wall clock, not the server's — a container running UTC would
    // otherwise call the current Indian school day a future date until 05:30.
    const todayKey = toDateKey(toUtcMidnight(nowWallClock()));

    const days = [];
    const summary = { Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, Off: 0 };

    for (let day = 1; day <= totalDays; day += 1) {
        const date = new Date(monthStart.getTime() + (day - 1) * MS_PER_DAY);
        const dateKey = toDateKey(date);
        const weekday = date.getUTCDay();
        const row = rowByDateKey.get(dateKey) || null;

        const entry = {
            dateKey,
            day,
            weekday,
            status: '',
            firstIn: row ? row.firstIn : null,
            lastOut: row ? row.lastOut : null,
            punchCount: row ? row.punchCount : 0,
            lateByMinutes: row ? row.lateByMinutes : null,
            expectedStart: row ? row.expectedStart : null,
            isOverridden: row ? !!row.isOverridden : false,
            source: row ? row.source : null,
        };

        if (row) {
            // A real row always wins — it already carries the reconciler's Holiday/Leave
            // resolution and any manual override, so re-deriving here could disagree with
            // what payroll will read.
            entry.status = row.status;
        } else if (dateKey > todayKey) {
            // Lexicographic compare is safe on "YYYY-MM-DD" and needs no Date arithmetic.
            entry.status = '';
        } else if (holidayMap.get(dateKey)) {
            entry.status = 'Holiday';
        } else if (leaveMap.get(dateKey)) {
            entry.status = 'Leave';
        } else if (roster.hasRoster) {
            // Rostered person: expected only on the days actually assigned a shift.
            entry.status = roster.shiftIdByDateKey[dateKey] ? 'Absent' : 'Off';
        } else {
            // Students (never rostered) and staff/teacher the school hasn't rostered fall
            // back to the weekly-off assumption — reporting a whole month of 'Off' just
            // because nobody filled in a roster would hide real absences.
            entry.status = STUDENT_WEEKLY_OFF.includes(weekday) ? 'Off' : 'Absent';
        }

        if (entry.status && summary[entry.status] !== undefined) summary[entry.status] += 1;
        days.push(entry);
    }

    return {
        person: person
            ? { _id: person._id, name: person.name, code: personCode(personType, person) }
            : null,
        personType,
        personId,
        year,
        month,
        days,
        summary,
    };
};

/**
 * One school on one date — the headline counts for a dashboard strip.
 * Answered entirely from the { adminId, date, status } index.
 * @returns {Promise<Object>} { dateKey, total, statusCounts }
 */
const getSchoolDaySummary = async ({ adminId, dateKey }) => {
    const date = toUtcMidnight(dateKey);
    if (!date) return { dateKey, total: 0, statusCounts: {} };

    const grouped = await DailyAttendanceModel.aggregate([
        { $match: { adminId, date } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusCounts = {};
    let total = 0;
    for (const group of grouped) {
        statusCounts[group._id] = group.count;
        total += group.count;
    }
    return { dateKey, total, statusCounts };
};

module.exports = { getPersonMonth, getSchoolDaySummary };
