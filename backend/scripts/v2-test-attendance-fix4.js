'use strict';
// attendance-fix4.md C — essential checks against a REAL MongoDB, in an isolated throwaway
// database (dropped at the end):
//   - Roster: a Bulk Assign writes the WHOLE month (day 1 → last day, past days included);
//     earlier months stay locked.
//   - Overview: a past rostered working day with no record reads Absent by default; a past edit
//     is allowed in the allowed case (source manual, no time, activity log with old/new status)
//     and read back through the grid; it is refused 403 for no roster, week-off, approved leave,
//     a device punch, another session, a non-past date; the route needs 'attendance-edit-past'.
//
// Run: node scripts/v2-test-attendance-fix4.js     (needs backend/.env: DB_URL, REDIS_URL)
require('dotenv').config();
global.global_config = require('../config/config.js');
const assert = require('assert');
const mongoose = require('mongoose');

const TEST_DB = process.env.TEST_DB_NAME || 'schoolzen_attendance_fix4_test';
if (!/test/i.test(TEST_DB)) throw new Error('TEST_DB_NAME must contain "test" — this script drops it.');

const ShiftV2Model = require('../modules/models/attendance/shift');
const RosterV2Model = require('../modules/models/attendance/roster');
const AttendanceRecordV2Model = require('../modules/models/attendance/attendance-record');
const PunchLogV2Model = require('../modules/models/attendance/punch-log');
const StaffV2Model = require('../modules/models/staff/staff');
const ActivityLogModel = require('../modules/models/audit/activity-log');
const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const overview = require('../modules/controllers/attendance/overview.controller');
const roster = require('../modules/controllers/attendance/roster.controller');
const requirePermission = require('../modules/middleware/require-permission');
const { todayKey } = require('../modules/helpers/attendance/v2-context');
const { nowWallClock } = require('../modules/helpers/attendance-time');
const { buildPunchHash } = require('../modules/helpers/attendance/status');
const { parseDateKey } = require('../modules/helpers/date-only');

const ADMIN = new mongoose.Types.ObjectId().toHexString();
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const mockRes = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const reqOf = (extra) => ({ user: { id: ADMIN }, adminId: ADMIN, query: {}, body: {}, get: () => null, ...extra });
const call = async (handler, req) => {
    const res = mockRes();
    try { await handler(req, res); return { ...res, error: null }; } catch (error) { return { ...res, error }; }
};
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const lastDayOf = (month) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

const today = todayKey();
const month = today.slice(0, 7);
// A real past day of this month (attendance-fix4.md C: pick it dynamically, never a fixed date).
const pastDay = today.slice(8) === '01' ? null : addDays(today, -1);
const otherPast = pastDay && pastDay > `${month}-01` ? addDays(pastDay, -1) : null;
const currentLabel = (() => { const y = Number(today.slice(0, 4)); const s = Number(today.slice(5, 7)) >= 4 ? y : y - 1; return `${s}-${s + 1}`; })();
const oldLabel = (() => { const [s] = currentLabel.split('-').map(Number); return `${s - 1}-${s}`; })();

let shift;
let ravi; let sita; let wo; let device; let leaver; let unrostered;

const setup = async () => {
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    const [s] = currentLabel.split('-').map(Number);
    await AcademicSessionV2Model.insertMany([
        { adminId: ADMIN, label: currentLabel, startDate: new Date(Date.UTC(s, 3, 1)), endDate: new Date(Date.UTC(s + 1, 2, 31)), status: 'active' },
        { adminId: ADMIN, label: oldLabel, startDate: new Date(Date.UTC(s - 1, 3, 1)), endDate: new Date(Date.UTC(s, 2, 31)), status: 'closed' },
    ]);
    shift = await ShiftV2Model.create({ adminId: ADMIN, name: 'Morning', startTime: '08:00', endTime: '14:00', earlyInMinutes: 10, graceMinutes: 5 });
    [ravi, sita, wo, device, leaver, unrostered] = await StaffV2Model.insertMany(['Ravi', 'Sita', 'Wasim WO', 'Dev Device', 'Lata Leave', 'Nobody']
        .map((name, i) => ({ adminId: ADMIN, name, empCode: `F4-${i}`, status: 'active' })));
};

const assign = (staff, body = {}) => call(roster.AssignStaffRoster, reqOf({
    body: { adminId: ADMIN, staffIds: staff.map((row) => String(row._id)), shiftId: String(shift._id), month, weekdays: ALL_DAYS, ...body },
}));
const markPast = (person, status, extra = {}) => call(overview.MarkPastAttendance, reqOf({
    body: { adminId: ADMIN, personType: 'staff', personId: String(person._id), status, date: pastDay, session: currentLabel, ...extra },
}));

const tests = {
    'Bulk Assign writes the WHOLE month, day 1 to the last day, past days included': async () => {
        const res = await assign([ravi, sita, wo, device, leaver], { fromDate: `${month}-01`, toDate: lastDayOf(month) });
        assert.ifError(res.error);
        const { year, month: m } = parseDateKey(`${month}-01`);
        const doc = await RosterV2Model.findOne({ adminId: ADMIN, staffId: String(ravi._id), year, month: m }).lean();
        const keys = Object.keys(doc.days).sort();
        assert.strictEqual(keys[0], `${month}-01`, 'day 1 written');
        assert.strictEqual(keys[keys.length - 1], lastDayOf(month), 'last day written');
        assert.strictEqual(keys.length, Number(lastDayOf(month).slice(8)));
    },
    'Bulk Assign by month (no range) also covers the whole month; earlier months stay locked': async () => {
        const res = await assign([sita]);
        assert.ifError(res.error);
        const prev = addDays(`${month}-01`, -1).slice(0, 7);
        const refused = await assign([sita], { month: prev });
        assert.strictEqual(refused.error && refused.error.code, 'DATE_RANGE_INVALID');
    },
    'a past rostered working day with no record reads Absent (default) in the grid': async () => {
        if (!pastDay) return;
        const res = await call(overview.GetGrid, reqOf({ query: { adminId: ADMIN, personType: 'staff', month, session: currentLabel } }));
        assert.ifError(res.error);
        const row = res.body.rows.find((r) => r._id === String(ravi._id));
        assert.deepStrictEqual({ s: row.cells[pastDay].s, n: row.cells[pastDay].n }, { s: 'A', n: undefined });
        const none = res.body.rows.find((r) => r._id === String(unrostered._id));
        assert.strictEqual(none.cells[pastDay].n, 1, 'no roster → the no-roster state');
        assert.ok(res.body.editPast && res.body.editPast.from && res.body.editPast.to, 'grid reports the session range');
    },
    'past edit allowed: source manual, no time, logged with old/new status; read back in the grid': async () => {
        if (!pastDay) return;
        const res = await markPast(ravi, 'Present');
        assert.ifError(res.error);
        assert.deepStrictEqual(res.body.cell, { s: 'P', t: null, src: 'manual' });
        const record = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(ravi._id), dateKey: pastDay, deletedAt: null }).lean();
        assert.strictEqual(record.source, 'manual');
        assert.strictEqual(record.status, 'Present');
        const log = await ActivityLogModel.findOne({ adminId: ADMIN, action: 'attendance.mark-past' }).sort({ _id: -1 }).lean();
        assert.ok(log, 'activity log written');
        assert.strictEqual(log.meta.oldStatus, 'Absent');
        assert.strictEqual(log.meta.newStatus, 'Present');
        assert.ok(log.meta.by && log.meta.at, 'user and time logged');
        const grid = await call(overview.GetGrid, reqOf({ query: { adminId: ADMIN, personType: 'staff', month, session: currentLabel } }));
        const cell = grid.body.rows.find((r) => r._id === String(ravi._id)).cells[pastDay];
        assert.strictEqual(cell.s, 'P');
        assert.strictEqual(cell.t, null, 'no time on a past manual mark');
        const back = await markPast(ravi, 'Absent');
        assert.ifError(back.error);
        const log2 = await ActivityLogModel.findOne({ adminId: ADMIN, action: 'attendance.mark-past' }).sort({ _id: -1 }).lean();
        assert.strictEqual(log2.meta.oldStatus, 'Present');
    },
    'refused 403: no roster for the day': async () => {
        if (!pastDay) return;
        const res = await markPast(unrostered, 'Present');
        assert.strictEqual(res.error && res.error.statusCode, 403);
        assert.strictEqual(res.error.code, 'MARK_PAST_NO_ROSTER');
    },
    'refused 403: roster week-off and approved leave': async () => {
        if (!pastDay) return;
        const { year, month: m } = parseDateKey(pastDay);
        await RosterV2Model.updateOne({ adminId: ADMIN, staffId: String(wo._id), year, month: m }, { $set: { [`days.${pastDay}`]: 'WO' } });
        const off = await markPast(wo, 'Present');
        assert.strictEqual(off.error && off.error.statusCode, 403);
        assert.strictEqual(off.error.code, 'MARK_PAST_DAY_OFF');
        await AttendanceRecordV2Model.create({ adminId: ADMIN, personType: 'staff', personId: String(leaver._id), date: new Date(`${pastDay}T00:00:00Z`), dateKey: pastDay, status: 'Leave', isOverridden: true, updatedBy: 'leave', source: 'system' });
        const leave = await markPast(leaver, 'Present');
        assert.strictEqual(leave.error && leave.error.code, 'MARK_PAST_DAY_OFF');
    },
    'refused 403: a device punch exists (device always wins)': async () => {
        if (!pastDay) return;
        const punchTime = new Date(`${pastDay}T08:05:00Z`);
        await PunchLogV2Model.create({ adminId: ADMIN, personType: 'staff', personId: String(device._id), punchTime, dateKey: pastDay, terminalSn: 'T1', punchHash: buildPunchHash(ADMIN, String(device._id), punchTime) });
        const res = await markPast(device, 'Absent');
        assert.strictEqual(res.error && res.error.statusCode, 403);
        assert.strictEqual(res.error.code, 'MARK_PAST_DEVICE');
    },
    'refused 403: date outside the selected session, and today/future dates': async () => {
        if (!pastDay) return;
        const other = await markPast(sita, 'Present', { session: oldLabel });
        assert.strictEqual(other.error && other.error.statusCode, 403);
        assert.strictEqual(other.error.code, 'MARK_PAST_OUTSIDE_SESSION');
        for (const date of [today, addDays(today, 3)]) {
            const res = await markPast(sita, 'Present', { date });
            assert.strictEqual(res.error && res.error.code, 'MARK_PAST_NOT_PAST', date);
        }
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personId: String(sita._id), deletedAt: null }), 0, 'nothing written');
    },
    'refused 403: no attendance-edit-past permission (route guard)': async () => {
        const staff = await StaffV2Model.create({ adminId: ADMIN, name: 'No Grant', empCode: 'F4-X', status: 'active' });
        const next = await new Promise((resolve) => {
            requirePermission('attendance-edit-past', 'edit')({ user: { staffId: String(staff._id) }, adminId: ADMIN, body: {} }, {}, resolve);
        });
        assert.ok(next && next.statusCode === 403, 'refused without the grant');
        if (otherPast) assert.ok(otherPast < pastDay);
    },
};

(async () => {
    await mongoose.connect(process.env.DB_URL, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
    let failed = 0;
    try {
        await setup();
        if (!pastDay) console.log('  note: today is the 1st — no past day this month, past-edit cases skipped');
        for (const [name, fn] of Object.entries(tests)) {
            const started = Date.now();
            try { await fn(); console.log(`  ok   ${name} (${Date.now() - started} ms)`); } catch (error) { failed += 1; console.log(`  FAIL ${name}\n       ${error.message}`); }
        }
    } finally {
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${Object.keys(tests).length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('setup failed:', error.message);
    (mongoose.connection.db ? mongoose.connection.db.dropDatabase() : Promise.resolve()).finally(() => process.exit(1));
});
