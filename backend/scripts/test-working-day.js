'use strict';
// Essential checks for the shared working-day resolver and what reads it: precedence, Roster
// WO, Leave day counting, and every Attendance status the Overview grid shows.
// No DB or Redis: model reads are replaced with in-memory rows below.
// Run: node scripts/test-working-day.js
const assert = require('assert');

// ---- in-memory stand-ins (installed BEFORE the code under test is required) ---------------
const cacheService = require('../modules/services/cache/cache.service');
cacheService.wrap = (_key, _ttl, fn) => fn();
cacheService.del = async () => {};
cacheService.delPattern = async () => {};
require('../modules/services/activity-log.service').logActivity = async () => {};
require('../modules/services/attendance-v2/publisher').publishReconciled = async () => {};
require('../modules/services/attendance-v2/live-stats').recompute = async () => {};
require('../modules/helpers/academic-session/session-resolver').getActiveSession = async () => ({ _id: 'session1' });

const RosterV2Model = require('../modules/models/attendance/roster');
const ShiftV2Model = require('../modules/models/attendance/shift');
const ClassShiftV2Model = require('../modules/models/attendance/class-shift');
const PunchLogV2Model = require('../modules/models/attendance/punch-log');
const AttendanceRecordV2Model = require('../modules/models/attendance/attendance-record');
const StaffV2Model = require('../modules/models/staff/staff');
const StudentEnrollmentModel = require('../modules/models/student/student-enrollment');
const HolidayV2Model = require('../modules/models/holiday/holiday');
const HolidayTemplateV2Model = require('../modules/models/holiday/holiday-template');
const LeaveRequestV2Model = require('../modules/models/leave/leave-request');

/** A chainable stand-in for a mongoose query that resolves to `rows`. */
const query = (rows) => {
    const q = { sort: () => q, limit: () => q, skip: () => q, collation: () => q, session: () => q, select: () => q };
    q.lean = () => Promise.resolve(rows);
    q.then = (resolve, reject) => Promise.resolve(rows).then(resolve, reject);
    return q;
};
const inIds = (filter, field, rows, key = field) => {
    const want = filter && filter[field] && filter[field].$in;
    return want ? rows.filter((row) => want.map(String).includes(String(row[key]))) : rows;
};

const ADMIN = 'admin1';
const RAVI = '64b7f0c2a1b2c3d4e5f60701';
const SITA = '64b7f0c2a1b2c3d4e5f60702';
const SHIFT = {
    _id: '64b7f0c2a1b2c3d4e5f60799', name: 'Morning Shift', startTime: '09:00', endTime: '15:00', status: 'active',
    earlyInMinutes: 30, graceMinutes: 10, halfDayAfterMinutes: 120, earlyOutMinutes: 30, lateOutMinutes: 60,
};
const TEMPLATE = '64b7f0c2a1b2c3d4e5f607aa';
const HOLIDAY = '64b7f0c2a1b2c3d4e5f607bb';

const db = {
    staff: [
        { _id: RAVI, name: 'Ravi', empCode: 'E1', status: 'active', holidayTemplateId: TEMPLATE },
        { _id: SITA, name: 'Sita', empCode: 'E2', status: 'active', holidayTemplateId: null },
    ],
    rosters: [],
    leaves: [],
    punches: [],
    records: new Map(),
};

StaffV2Model.find = (filter) => query(inIds(filter, '_id', db.staff));
StaffV2Model.distinct = async () => [ADMIN];
StudentEnrollmentModel.find = () => query([]);
ClassShiftV2Model.find = () => query([]);
ShiftV2Model.find = () => query([SHIFT]);
ShiftV2Model.findOne = () => query(SHIFT);
HolidayTemplateV2Model.findOne = () => query({ _id: TEMPLATE, holidayIds: [HOLIDAY] });
// Wednesday 12 Aug 2026 is a dated holiday in Ravi's template.
HolidayV2Model.find = () => query([{ _id: HOLIDAY, startDateKey: '2026-08-12', endDateKey: '2026-08-12' }]);
RosterV2Model.find = (filter) => query(inIds(filter, 'staffId', db.rosters).filter((doc) => !filter.$or
    || filter.$or.some((m) => m.year === doc.year && m.month === doc.month)
    || (filter.year === doc.year && filter.month === doc.month)));
RosterV2Model.updateMany = async () => ({});
RosterV2Model.bulkWrite = async (ops) => {
    ops.forEach(({ updateOne: { filter, update } }) => {
        let doc = db.rosters.find((row) => row.staffId === filter.staffId && row.year === filter.year && row.month === filter.month);
        if (!doc) db.rosters.push(doc = { staffId: filter.staffId, year: filter.year, month: filter.month, days: {} });
        Object.entries(update.$set).forEach(([path, value]) => { if (path.startsWith('days.')) doc.days[path.slice(5)] = value; });
    });
};
LeaveRequestV2Model.find = (filter) => query(db.leaves.filter((row) => row.status === filter.status
    && filter.personId.$in.includes(row.personId) && row.fromDateKey <= filter.fromDateKey.$lte && row.toDateKey >= filter.toDateKey.$gte));
PunchLogV2Model.find = (filter) => query(db.punches.filter((row) => row.dateKey === filter.dateKey));
PunchLogV2Model.updateMany = async () => ({});
PunchLogV2Model.distinct = async () => [];
const recordKey = (r) => `${r.personType}|${r.personId}|${r.dateKey}`;
AttendanceRecordV2Model.find = (filter) => query([...db.records.values()].filter((row) => (filter.isOverridden === undefined || row.isOverridden === filter.isOverridden)
    && (!filter.date || !filter.date.getTime || row.dateKey === filter.date.toISOString().slice(0, 10))));
AttendanceRecordV2Model.bulkWrite = async (ops) => {
    ops.forEach(({ updateOne: { filter, update } }) => {
        const row = { personType: filter.personType, personId: filter.personId, isOverridden: false, ...update.$set };
        db.records.set(recordKey(row), row);
    });
};

const { DAY_TYPE, resolveDayType } = require('../modules/helpers/calendar/working-day-rules');
const { resolveDays, workingDayKeys } = require('../modules/services/calendar/working-day');
const { AssignStaffRoster } = require('../modules/controllers/attendance/roster.controller');
const { reconcileDay } = require('../modules/services/attendance-v2/reconcile');
const { GetGrid } = require('../modules/controllers/attendance/overview.controller');

const call = async (handler, req) => {
    let body;
    await handler(req, { status: () => ({ json: (value) => { body = value; } }) });
    return body;
};
/** Ravi's August 2026 roster: Morning Shift every day except Saturday (WO). */
const rosterRaviAugust = () => {
    const days = {};
    for (let d = 1; d <= 31; d += 1) {
        const key = `2026-08-${String(d).padStart(2, '0')}`;
        days[key] = new Date(`${key}T00:00:00Z`).getUTCDay() === 6 ? 'WO' : SHIFT._id;
    }
    db.rosters = [{ staffId: RAVI, year: 2026, month: 8, days }];
};
const typesOf = async (staffId, from, to) => [...(await resolveDays(ADMIN, { people: [{ personType: 'staff', personId: staffId }], fromKey: from, toKey: to }))
    .get(`staff|${staffId}`).values()];

const tests = {
    // ---- A: precedence -------------------------------------------------------------------
    'precedence: Holiday > Leave > roster WO > working': () => {
        const monday = '2026-08-10';
        assert.strictEqual(resolveDayType({ dateKey: monday, holiday: true, leave: true, rosterValue: 'WO' }), DAY_TYPE.HOLIDAY);
        assert.strictEqual(resolveDayType({ dateKey: monday, holiday: false, leave: true, rosterValue: 'WO' }), DAY_TYPE.LEAVE);
        assert.strictEqual(resolveDayType({ dateKey: monday, holiday: false, leave: false, rosterValue: 'WO' }), DAY_TYPE.WEEKLY_OFF);
        assert.strictEqual(resolveDayType({ dateKey: monday, holiday: false, leave: false, rosterValue: 'shift1' }), DAY_TYPE.WORKING);
    },
    'no roster entry keeps the pre-Holiday rule: Sunday off, every other day working': () => {
        assert.strictEqual(resolveDayType({ dateKey: '2026-08-09', rosterValue: undefined }), DAY_TYPE.WEEKLY_OFF);
        assert.strictEqual(resolveDayType({ dateKey: '2026-08-08', rosterValue: undefined }), DAY_TYPE.WORKING);
        // A rostered shift on a Sunday is a working day.
        assert.strictEqual(resolveDayType({ dateKey: '2026-08-09', rosterValue: 'shift1' }), DAY_TYPE.WORKING);
    },

    // ---- B: roster WO --------------------------------------------------------------------
    'roster assign over a date range: unticked Saturday becomes WO for that person only': async () => {
        db.rosters = [];
        // Sun–Fri ticked, Saturday is the weekly off; the range crosses a month boundary.
        await call(AssignStaffRoster, { body: { adminId: ADMIN, staffIds: [RAVI], shiftId: SHIFT._id, weekdays: [0, 1, 2, 3, 4, 5], fromDate: '2026-10-26', toDate: '2026-11-08' } });
        assert.strictEqual(db.rosters.length, 2, 'one roster doc per month touched');
        // 31 Oct and 7 Nov 2026 are Saturdays; 1 Nov is a Sunday.
        assert.deepStrictEqual(await typesOf(RAVI, '2026-10-31', '2026-11-01'), [DAY_TYPE.WEEKLY_OFF, DAY_TYPE.WORKING]);
        assert.deepStrictEqual(await typesOf(RAVI, '2026-11-07', '2026-11-07'), [DAY_TYPE.WEEKLY_OFF]);
        // Sita has no roster: Saturday is a working day, Sunday the fallback off.
        assert.deepStrictEqual(await typesOf(SITA, '2026-10-31', '2026-11-01'), [DAY_TYPE.WORKING, DAY_TYPE.WEEKLY_OFF]);
    },

    // ---- A acceptance: leave counting ----------------------------------------------------
    'a leave crossing a roster WO day and a template holiday is charged for neither': async () => {
        rosterRaviAugust();
        // Mon 10 – Sun 16 Aug 2026: Wed 12 is a holiday, Sat 15 is Ravi's roster WO.
        const charged = await workingDayKeys(ADMIN, { personType: 'staff', personId: RAVI, fromKey: '2026-08-10', toKey: '2026-08-16', includeLeave: false });
        assert.deepStrictEqual(charged, ['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-14', '2026-08-16']);
        // Attendance's view of the same two days, from the same service.
        assert.deepStrictEqual(await typesOf(RAVI, '2026-08-12', '2026-08-12'), [DAY_TYPE.HOLIDAY]);
        assert.deepStrictEqual(await typesOf(RAVI, '2026-08-15', '2026-08-15'), [DAY_TYPE.WEEKLY_OFF]);
    },
    'an approved leave is Leave on its charged days, never on the WO/holiday inside its range': async () => {
        rosterRaviAugust();
        db.leaves = [{ personType: 'staff', personId: RAVI, status: 'Approved', fromDateKey: '2026-08-14', toDateKey: '2026-08-16', dateKeys: ['2026-08-14', '2026-08-16'] }];
        assert.deepStrictEqual(await typesOf(RAVI, '2026-08-14', '2026-08-16'), [DAY_TYPE.LEAVE, DAY_TYPE.WEEKLY_OFF, DAY_TYPE.LEAVE]);
        db.leaves = [];
    },

    // ---- C: every Overview status --------------------------------------------------------
    'Overview shows on-time, late, half, no punch, WO, holiday and approved leave correctly': async () => {
        rosterRaviAugust();
        db.records = new Map();
        const punch = (dateKey, hhmm) => ({ adminId: ADMIN, personType: 'staff', personId: RAVI, dateKey, punchTime: new Date(`${dateKey}T${hhmm}:00Z`), reconciled: false });
        db.punches = [
            punch('2026-08-10', '09:05'), punch('2026-08-10', '15:02'), // Mon on time
            punch('2026-08-11', '09:25'), punch('2026-08-11', '15:05'), // Tue late
            punch('2026-08-13', '11:30'), punch('2026-08-13', '15:05'), // Thu half day
            punch('2026-08-15', '09:00'), // Sat: punched on his weekly off
        ];
        // Fri 14: approved leave — Approve writes this mark, and the request's charged day.
        db.leaves = [{ personType: 'staff', personId: RAVI, status: 'Approved', fromDateKey: '2026-08-14', toDateKey: '2026-08-14', dateKeys: ['2026-08-14'] }];
        db.records.set(`staff|${RAVI}|2026-08-14`, { personType: 'staff', personId: RAVI, dateKey: '2026-08-14', status: 'Leave', isOverridden: true, updatedBy: 'leave' });

        for (let d = 10; d <= 16; d += 1) await reconcileDay(ADMIN, `2026-08-${d}`);
        const grid = await call(GetGrid, { query: { adminId: ADMIN, personType: 'staff', month: '2026-08' } });
        const cells = grid.rows.find((row) => row._id === RAVI).cells;
        const chip = (d) => cells[`2026-08-${d}`] && cells[`2026-08-${d}`].s;
        assert.deepStrictEqual([10, 11, 12, 13, 14, 15, 16].map(chip), ['P', 'L', 'H', 'HD', 'LV', 'WO', 'A']);
        // The worker stored the same answer, not a "Holiday" for the weekly off.
        assert.strictEqual(db.records.get(`staff|${RAVI}|2026-08-15`).status, 'WeeklyOff');
        assert.strictEqual(db.records.get(`staff|${RAVI}|2026-08-12`).status, 'Holiday');
        assert.strictEqual(db.records.get(`staff|${RAVI}|2026-08-16`).status, 'Absent');
        // Sita (no roster, no template): Sunday is her weekly off, Saturday is not.
        const sita = grid.rows.find((row) => row._id === SITA).cells;
        assert.strictEqual(sita['2026-08-16'].s, 'WO');
        // No roster that day → the dashed '—' cell (attendance-fix1.md §3c), never a status.
        assert.deepStrictEqual(sita['2026-08-15'], { s: '—', n: 1 });
        db.leaves = [];
        db.punches = [];
    },
};

(async () => {
    let failed = 0;
    for (const [name, fn] of Object.entries(tests)) {
        try {
            await fn();
            console.log(`  ok   ${name}`);
        } catch (error) {
            failed += 1;
            console.log(`  FAIL ${name}\n       ${error.stack}`);
        }
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${Object.keys(tests).length} passed`);
    process.exit(failed ? 1 : 0);
})();
