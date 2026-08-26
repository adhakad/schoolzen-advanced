'use strict';
const DailyAttendanceModel = require('../models/daily-attendance');
const RosterModel = require('../models/roster');
const ClassShiftModel = require('../models/class-shift');
const ShiftModel = require('../models/shift');
const LeaveTypeModel = require('../models/leave-type');
const { getHolidayMapForMonth, getHolidayMapForPeopleMonth } = require('./holiday-lookup');
const { getLeaveMapForMonth, getLeaveMapForSchoolMonth } = require('./leave-lookup');
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
//   ''        — a future date with nothing known about it yet
// Persisting either would mean writing ~60M placeholder rows a month at target scale.
//
// A future date is NOT automatically ''. An approved Leave or an assigned Holiday is already
// known before the day arrives, so those cells carry their real status and the name that
// explains it (holidayName / leaveTypeName). Only a future day with neither is blank. The
// `isFuture` flag rides along so the client can render those cells read-only without
// re-deriving "has this happened" against the browser's own clock.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Students are not rostered day by day — their shift comes from ClassShift, which has no
// date dimension and would otherwise mark every Sunday Absent. Sunday is the weekly off
// this codebase already assumes: pages/admin/roster marks exactly `dow === 0` as the
// weekend column.
const STUDENT_WEEKLY_OFF = [0];

/**
 * leaveTypeId -> name, for the hover text on a Leave cell. LeaveRequest stores only the id,
 * and a school has a handful of types, so this is one small query per month read rather than
 * a populate per row.
 */
const getLeaveTypeNames = async (adminId) => {
    const leaveTypes = await LeaveTypeModel.find({ adminId }, { name: 1 }).lean();
    return new Map(leaveTypes.map((leaveType) => [leaveType._id.toString(), leaveType.name]));
};

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
 * @param {Map}    [args.leaveTypeNameById] leaveTypeId -> name, for the cell's hover text.
 * @returns {{ days: Array, summary: Object }}
 */
const buildDayEntries = ({ monthDays, rowByDateKey, holidayMap, leaveMap, todayKey, isExpected, leaveTypeNameById }) => {
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
            // Lexicographic compare is safe on "YYYY-MM-DD" and needs no Date arithmetic.
            // Sent so the client does not have to re-derive "has this day happened" against
            // its own clock — a browser in another timezone would disagree with the school's.
            isFuture: dateKey > todayKey,
            // Hover text for a cell that carries a Holiday/Leave chip. Empty otherwise.
            holidayName: '',
            leaveTypeName: '',
        };

        const holiday = holidayMap.get(dateKey);
        const leave = leaveMap.get(dateKey);

        if (row) {
            // A real row always wins — it already carries the reconciler's Holiday/Leave
            // resolution and any manual override, so re-deriving here could disagree with
            // what payroll will read.
            entry.status = row.status;
        } else if (holiday) {
            // DELIBERATELY ABOVE THE FUTURE CHECK. An approved leave or an assigned holiday
            // is already KNOWN for a date that has not arrived — dimming it to '' hid
            // information the admin had entered themselves, which is what this ordering
            // fixes. Holiday before Leave matches the precedence attendance-status.js
            // documents, so a future cell and its eventual reconciled row agree.
            entry.status = 'Holiday';
        } else if (leave) {
            entry.status = 'Leave';
        } else if (entry.isFuture) {
            // Nothing known about this day yet. Stays a plain dimmed cell.
            entry.status = '';
        } else {
            entry.status = isExpected(dateKey, weekday) ? 'Absent' : 'Off';
        }

        // Names for the cell's hover text, set whenever one was resolved — the frontend
        // decides where to show them. Only ever read for cells that carry a chip.
        if (holiday) entry.holidayName = `${holiday.name || ''}`;
        if (leave) {
            entry.leaveTypeName = leaveTypeNameById
                ? (leaveTypeNameById.get(String(leave.leaveTypeId)) || '')
                : '';
        }

        // Future Leave/Holiday days ARE counted here, because the summary strip is a
        // roll-up of exactly the cells on screen — showing six LV chips above a strip
        // reading "LV 1" would be its own bug. Future days with nothing known stay
        // uncounted, so the strip still means "days accounted for", not "days elapsed".
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

    const [person, rows, holidayMap, leaveMap, rosterDays, leaveTypeNameById] = await Promise.all([
        getPerson(personType, personId),
        // Equality on adminId+personType+personId, range on date — exactly the shape of
        // DailyAttendance's leading unique index, so this is one index walk.
        DailyAttendanceModel
            .find({ adminId, personType, personId, date: { $gte: monthStart, $lte: monthEnd } })
            .lean(),
        // Per-person, not school-wide: a holiday only reaches somebody through the
        // HolidayTemplate they are assigned. Unassigned means an empty map and the Absent
        // branch below stands — see the header of services/holiday-lookup.js.
        getHolidayMapForMonth(adminId, personType, personId, year, month),
        getLeaveMapForMonth(adminId, personType, personId, year, month),
        getRosterDays(adminId, personType, personId, year, month),
        getLeaveTypeNames(adminId),
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
        leaveTypeNameById,
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
 * The shift a person is CURRENTLY on, for the grid's Name column.
 *
 * The grid shows one row per person and 31 date columns; repeating the shift name in every
 * cell would be 31 copies of the same string per row. It belongs once, next to the name.
 *
 * "Currently" for a staff member or teacher means the latest day this month they are
 * rostered on that is not in the future — that is the shift a reader is looking at the row
 * to understand. A person rostered only for days still to come falls back to their first
 * such day rather than showing nothing.
 *
 * @param {Object} rosterDays "YYYY-MM-DD" -> shiftId, from the monthly snapshot
 * @param {String} todayKey
 * @returns {String|null} shiftId
 */
const currentShiftIdOf = (rosterDays, todayKey) => {
    const dateKeys = Object.keys(rosterDays || {}).filter((key) => rosterDays[key]).sort();
    if (dateKeys.length === 0) return null;
    // Lexicographic compare is safe on "YYYY-MM-DD" — same trick buildDayEntries uses.
    const past = dateKeys.filter((key) => key <= todayKey);
    const chosen = past.length > 0 ? past[past.length - 1] : dateKeys[0];
    return rosterDays[chosen];
};

// Name plus RAW "HH:mm" timings — never a pre-formatted display string. The grid renders
// these through the timeAmPm pipe (pipes/time-am-pm.pipe.ts) so a school office reads
// "8:00 AM" instead of "08:00", and a label assembled here would arrive as one opaque
// string the pipe cannot reach into. Timings ride along with the name because two shifts
// called "Morning" and "Morning B" are indistinguishable at 10px otherwise.
const shiftSummaryOf = (shift) => ({
    shiftName: shift ? String(shift.name) : '',
    shiftStart: shift && shift.startTime ? String(shift.startTime) : '',
    shiftEnd: shift && shift.endTime ? String(shift.endTime) : '',
});

/**
 * A whole school's month for one person type — the calendar grid.
 *
 * A fixed number of round-trips regardless of headcount: 1 people scan, 1 DailyAttendance
 * range read, 1 batched holiday map, and 1 expectation read (Roster for staff/teacher, ClassShift
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

    const [rows, holidayByPersonId, leaveByPersonId, rosterList, classShiftRows, leaveTypeNameById] = await Promise.all([
        DailyAttendanceModel
            .find({
                adminId,
                personType,
                personId: { $in: personIds },
                date: { $gte: monthStart, $lte: monthEnd },
            })
            .lean(),
        // Holidays are per-person now, so this is the batched form for the same reason the
        // leave one below exists. `people` is passed in rather than re-read: their documents
        // already carry `.class`, so resolving a student's class-level template costs no
        // extra query at all.
        getHolidayMapForPeopleMonth(adminId, personType, people, year, month),
        // ONE query for the whole school-month. The per-person getLeaveMapForMonth would be
        // one query per row here, which is why leave-lookup.js carries this batched form.
        getLeaveMapForSchoolMonth(adminId, personType, year, month),
        // One scan of the monthly snapshots for the whole school, not one findOne per
        // person. Empty for students, who are never rostered.
        personType === 'student'
            ? []
            : RosterModel
                .find({ adminId, personType, year, month }, { personId: 1, days: 1, _id: 0 })
                .lean(),
        personType === 'student'
            ? ClassShiftModel.find({ adminId }, { class: 1, shiftId: 1, _id: 0 }).lean()
            : [],
        getLeaveTypeNames(adminId),
    ]);

    // Reused for anyone with no approved leave — and no holiday template — this month, so
    // the common case allocates nothing per row.
    const emptyLeaveMap = new Map();
    const emptyHolidayMap = new Map();

    const rosterDaysByPersonId = new Map();
    for (const roster of rosterList) {
        rosterDaysByPersonId.set(String(roster.personId), roster.days || {});
    }

    const classesWithShift = new Set(classShiftRows.map((row) => String(row.class)));
    const shiftIdByClass = new Map(classShiftRows.map((row) => [String(row.class), row.shiftId]));

    // personId -> its own dateKey -> row. One pass over the flat result rather than a
    // filter per person, which would be O(people x rows).
    const rowsByPersonId = new Map();
    for (const row of rows) {
        const key = String(row.personId);
        if (!rowsByPersonId.has(key)) rowsByPersonId.set(key, new Map());
        rowsByPersonId.get(key).set(toDateKey(row.date), row);
    }

    const todayKey = toDateKey(toUtcMidnight(nowWallClock()));

    // ---- Each person's current shift, for the grid's Name column --------------
    // ONE lookup for the distinct shifts the whole school is on, never one per person: a
    // 400-pupil school running two shifts costs two documents.
    const shiftIdByPersonId = new Map();
    if (personType === 'student') {
        for (const person of people) {
            const shiftId = shiftIdByClass.get(String(person.class));
            if (shiftId) shiftIdByPersonId.set(person._id.toString(), shiftId);
        }
    } else {
        for (const [personId, rosterDays] of rosterDaysByPersonId) {
            const shiftId = currentShiftIdOf(rosterDays, todayKey);
            if (shiftId) shiftIdByPersonId.set(personId, shiftId);
        }
    }

    const shiftById = new Map();
    const shiftIds = [...new Set(shiftIdByPersonId.values())];
    if (shiftIds.length > 0) {
        const shiftList = await ShiftModel
            .find({ _id: { $in: shiftIds } }, { name: 1, startTime: 1, endTime: 1 })
            .lean();
        for (const shift of shiftList) shiftById.set(shift._id.toString(), shift);
    }

    const gridSummary = emptySummary();
    const gridRows = [];

    for (const person of people) {
        const personId = person._id.toString();
        const { days, summary } = buildDayEntries({
            monthDays,
            rowByDateKey: rowsByPersonId.get(personId) || new Map(),
            holidayMap: holidayByPersonId.get(personId) || emptyHolidayMap,
            leaveMap: leaveByPersonId.get(personId) || emptyLeaveMap,
            todayKey,
            isExpected: buildExpectationFn({
                personType,
                rosterDays: rosterDaysByPersonId.get(personId),
                classHasShift: classesWithShift.has(String(person.class)),
            }),
            leaveTypeNameById,
        });

        for (const status of Object.keys(summary)) gridSummary[status] += summary[status];

        const shift = shiftById.get(shiftIdByPersonId.get(personId)) || null;

        gridRows.push({
            person: {
                _id: person._id,
                name: person.name,
                code: personCode(personType, person),
            },
            // Once per row, never per cell — see currentShiftIdOf above.
            ...shiftSummaryOf(shift),
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
