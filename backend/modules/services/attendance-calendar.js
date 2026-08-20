'use strict';
const DailyAttendanceModel = require('../models/daily-attendance');
const RosterModel = require('../models/roster');
const ClassShiftModel = require('../models/class-shift');
const { getHolidayMapForMonth } = require('./holiday-lookup');
const { getLeaveMapForMonth } = require('./leave-lookup');
const { getActivePeople, getPerson, personCode } = require('./person-lookup');
const { toUtcMidnight, toDateKey } = require('../helpers/date-only');
const { nowWallClock } = require('../helpers/attendance-time');

// THE READ PATH. Two shapes of the same month:
//   getPersonMonth()     — one person, day by day (the day-detail drill-down)
//   getSchoolMonthGrid() — every person of one type, day by day (the calendar grid)
//
// DailyAttendance only holds rows for people who actually punched INSIDE their shift's
// arrival window (see the header of models/daily-attendance.js) — so "Absent" does not
// exist in the database, it is DERIVED here from the absence of a row on a day the person
// was expected. That is the whole reason this file exists rather than the controller just
// dumping the collection.
//
// Two statuses returned here are read-time only and are NOT in DailyAttendance's enum:
//   'Off'     — the person was not expected that day
//   ''        — a future date, nothing to say about it yet
// Persisting either would mean writing ~60M placeholder rows a month at target scale.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Students are not rostered day by day — their shift comes from ClassShift, which has no
// date dimension and would otherwise mark every Sunday Absent. Sunday is the weekly off
// this codebase already assumes: pages/admin/roster marks exactly `dow === 0` as the
// weekend column.
const STUDENT_WEEKLY_OFF = [0];

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const emptySummary = () => (
    { Present: 0, Late: 0, HalfDay: 0, Absent: 0, Leave: 0, Holiday: 0, Off: 0 }
);

/**
 * The bare date skeleton for a month — shared by both read shapes so the grid's column
 * headers and a person's day list can never disagree about how long the month is.
 */
const buildMonthDays = (year, month) => {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const total = daysInMonth(year, month);
    const days = [];
    for (let day = 1; day <= total; day += 1) {
        const date = new Date(monthStart.getTime() + (day - 1) * MS_PER_DAY);
        days.push({ dateKey: toDateKey(date), day, weekday: date.getUTCDay() });
    }
    return days;
};

/**
 * One person's month, resolved day by day. The single place the status precedence lives, so
 * the per-person view and the grid can never drift apart.
 *
 * @param {Object} args
 * @param {Array}  args.monthDays from buildMonthDays()
 * @param {Map}    args.rowByDateKey "YYYY-MM-DD" -> DailyAttendance row
 * @param {Map}    args.holidayMap   "YYYY-MM-DD" -> Holiday
 * @param {Map}    args.leaveMap     "YYYY-MM-DD" -> LeaveRequest
 * @param {String} args.todayKey
 * @param {Function} args.isExpected (dateKey, weekday) -> Boolean; was this person supposed
 *                   to be here? False means 'Off' rather than 'Absent'.
 * @returns {{ days: Array, summary: Object }}
 */
const buildDayEntries = ({ monthDays, rowByDateKey, holidayMap, leaveMap, todayKey, isExpected }) => {
    const days = [];
    const summary = emptySummary();

    for (const monthDay of monthDays) {
        const { dateKey, day, weekday } = monthDay;
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
        } else {
            entry.status = isExpected(dateKey, weekday) ? 'Absent' : 'Off';
        }

        if (entry.status && summary[entry.status] !== undefined) summary[entry.status] += 1;
        days.push(entry);
    }

    return { days, summary };
};

/**
 * Which days of this month a staff member or teacher is rostered on. Single findOne against
 * the monthly snapshot — O(1) per day afterwards, never a per-day query (see CLAUDE.md's
 * monthly-snapshot pattern).
 */
const getRosterDays = async (adminId, personType, personId, year, month) => {
    if (personType === 'student') return {};
    const roster = await RosterModel
        .findOne({ adminId, personType, personId, year, month }, { days: 1, _id: 0 })
        .lean();
    return (roster && roster.days) || {};
};

/**
 * Was this person expected in on a given day?
 *
 * staff / teacher — only on the days their Roster actually assigns a shift. The one
 *   exception is a person with NO roster rows at all that month: reporting a whole month of
 *   'Off' would quietly hide the fact that nobody filled the roster in, and since reconcile
 *   now writes no rows for an unrostered person, that would render as a blank month rather
 *   than a problem. Fall back to "every weekday" so the gap is loud.
 * student — only if their class is mapped to a shift, and never on the weekly off.
 */
const buildExpectationFn = ({ personType, rosterDays, classHasShift }) => {
    if (personType === 'student') {
        return (dateKey, weekday) => classHasShift && !STUDENT_WEEKLY_OFF.includes(weekday);
    }
    const rosteredDayCount = Object.keys(rosterDays || {}).length;
    if (rosteredDayCount === 0) {
        return (dateKey, weekday) => !STUDENT_WEEKLY_OFF.includes(weekday);
    }
    return (dateKey) => !!rosterDays[dateKey];
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
    const monthDays = buildMonthDays(year, month);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month - 1, daysInMonth(year, month)));

    const [person, rows, holidayMap, leaveMap, rosterDays] = await Promise.all([
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

    // Only students need the class mapping, and only their own class — one indexed lookup.
    let classHasShift = false;
    if (personType === 'student' && person) {
        const classShift = await ClassShiftModel
            .findOne({ adminId, class: String(person.class) }, { _id: 1 })
            .lean();
        classHasShift = !!classShift;
    }

    const rowByDateKey = new Map();
    for (const row of rows) rowByDateKey.set(toDateKey(row.date), row);

    // "Today" in the SCHOOL's wall clock, not the server's — a container running UTC would
    // otherwise call the current Indian school day a future date until 05:30.
    const todayKey = toDateKey(toUtcMidnight(nowWallClock()));

    const { days, summary } = buildDayEntries({
        monthDays,
        rowByDateKey,
        holidayMap,
        leaveMap,
        todayKey,
        isExpected: buildExpectationFn({ personType, rosterDays, classHasShift }),
    });

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
 * A whole school's month for one person type — the calendar grid.
 *
 * A fixed number of round-trips regardless of headcount: 1 people scan, 1 DailyAttendance
 * range read, 1 holiday map, and 1 expectation read (Roster for staff/teacher, ClassShift
 * for students). Never one query per person.
 *
 * `class` is REQUIRED for students, enforced by the controller: a whole school's roll times
 * 31 columns is tens of thousands of cells, which is neither renderable nor readable.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {String} args.personType
 * @param {Number} args.year
 * @param {Number} args.month 1-12
 * @param {String} [args.class] narrows the student roll
 * @returns {Promise<Object>} { personType, year, month, days, rows, summary }
 */
const getSchoolMonthGrid = async ({ adminId, personType, year, month, class: classFilter }) => {
    const monthDays = buildMonthDays(year, month);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month - 1, daysInMonth(year, month)));

    const extra = {};
    if (personType === 'student' && classFilter) extra.class = classFilter;

    const people = await getActivePeople(adminId, personType, extra);
    if (people.length === 0) {
        return { personType, year, month, days: monthDays, rows: [], summary: emptySummary() };
    }

    const personIds = people.map((person) => person._id.toString());

    const [rows, holidayMap, rosterList, classShiftRows] = await Promise.all([
        DailyAttendanceModel
            .find({
                adminId,
                personType,
                personId: { $in: personIds },
                date: { $gte: monthStart, $lte: monthEnd },
            })
            .lean(),
        getHolidayMapForMonth(adminId, year, month),
        // One scan of the monthly snapshots for the whole school, not one findOne per
        // person. Empty for students, who are never rostered.
        personType === 'student'
            ? []
            : RosterModel
                .find({ adminId, personType, year, month }, { personId: 1, days: 1, _id: 0 })
                .lean(),
        personType === 'student'
            ? ClassShiftModel.find({ adminId }, { class: 1, _id: 0 }).lean()
            : [],
    ]);

    // Leave is taken from the stored rows only. getLeaveMapForMonth is per person, so
    // deriving Leave for un-punched days here would be one query per row. When Phase 8
    // lands it needs a batched school-month form; until then a leave day only shows once
    // the reconciler has written it, which is also the only way it reaches payroll.
    const emptyLeaveMap = new Map();

    const rosterDaysByPersonId = new Map();
    for (const roster of rosterList) {
        rosterDaysByPersonId.set(String(roster.personId), roster.days || {});
    }

    const classesWithShift = new Set(classShiftRows.map((row) => String(row.class)));

    // personId -> its own dateKey -> row. One pass over the flat result rather than a
    // filter per person, which would be O(people x rows).
    const rowsByPersonId = new Map();
    for (const row of rows) {
        const key = String(row.personId);
        if (!rowsByPersonId.has(key)) rowsByPersonId.set(key, new Map());
        rowsByPersonId.get(key).set(toDateKey(row.date), row);
    }

    const todayKey = toDateKey(toUtcMidnight(nowWallClock()));
    const gridSummary = emptySummary();
    const gridRows = [];

    for (const person of people) {
        const personId = person._id.toString();
        const { days, summary } = buildDayEntries({
            monthDays,
            rowByDateKey: rowsByPersonId.get(personId) || new Map(),
            holidayMap,
            leaveMap: emptyLeaveMap,
            todayKey,
            isExpected: buildExpectationFn({
                personType,
                rosterDays: rosterDaysByPersonId.get(personId),
                classHasShift: classesWithShift.has(String(person.class)),
            }),
        });

        for (const status of Object.keys(summary)) gridSummary[status] += summary[status];

        gridRows.push({
            person: {
                _id: person._id,
                name: person.name,
                code: personCode(personType, person),
            },
            days,
            summary,
        });
    }

    return { personType, year, month, days: monthDays, rows: gridRows, summary: gridSummary };
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

module.exports = { getPersonMonth, getSchoolMonthGrid, getSchoolDaySummary };
