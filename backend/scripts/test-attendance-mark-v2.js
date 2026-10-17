'use strict';
// Live checks for attendance-fix1.md (manual marking, device-wins reconcile, roster delete →
// re-assign, grid cells, shift validation) against a REAL MongoDB — but an isolated,
// throwaway database on the configured cluster (never the app's own data), dropped at the end.
//
// Run: node scripts/test-attendance-mark-v2.js      (needs backend/.env: DB_URL, REDIS_URL)
//      TEST_DB_NAME=other_db node scripts/test-attendance-mark-v2.js
require('dotenv').config();
global.global_config = require('../config/config.js');
const assert = require('assert');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');

const TEST_DB = process.env.TEST_DB_NAME || 'schoolzen_attendance_fix1_test';
if (!/test/i.test(TEST_DB)) throw new Error('TEST_DB_NAME must contain "test" — this script drops it.');

const ShiftV2Model = require('../modules/models/attendance/shift');
const RosterV2Model = require('../modules/models/attendance/roster');
const AttendanceRecordV2Model = require('../modules/models/attendance/attendance-record');
const PunchLogV2Model = require('../modules/models/attendance/punch-log');
const StaffV2Model = require('../modules/models/staff/staff');
const RoleModel = require('../modules/models/settings/role');
const RoleAssignmentModel = require('../modules/models/settings/role-assignment');
const overview = require('../modules/controllers/attendance/overview.controller');
const roster = require('../modules/controllers/attendance/roster.controller');
const { reconcileDay } = require('../modules/services/attendance-v2/reconcile');
const { todayKey } = require('../modules/helpers/attendance/context');
const { nowWallClock } = require('../modules/helpers/attendance-time');
const { buildPunchHash } = require('../modules/helpers/attendance/status');
const requirePermission = require('../modules/middleware/require-permission');
const idempotency = require('../modules/middleware/idempotency');
const v = require('../modules/validators/attendance/attendance.validator');
const ActivityLogModel = require('../modules/models/audit/activity-log');

const ADMIN = new mongoose.Types.ObjectId().toHexString();
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (minutes) => `${pad(Math.floor(((minutes % 1440) + 1440) % 1440 / 60))}:${pad((((minutes % 1440) + 1440) % 1440) % 60)}`;

const mockRes = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const reqOf = (extra) => ({ user: { id: ADMIN }, adminId: ADMIN, query: {}, body: {}, get: () => null, ...extra });
const call = async (handler, req) => {
    const res = mockRes();
    try {
        await handler(req, res);
        return { ...res, error: null };
    } catch (error) {
        return { ...res, error };
    }
};

let staffOpen;
let staffClosed;
let staffNone;
let staffDevice;
let shiftOpen;
let shiftClosed;

const setup = async () => {
    const now = nowWallClock();
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (minutes < 60 || minutes > 1260) throw new Error('Run between 01:00 and 21:00 school time — the window tests build shifts around "now".');
    [shiftOpen, shiftClosed] = await ShiftV2Model.insertMany([
        { adminId: ADMIN, name: 'Open Now', startTime: hhmm(minutes - 30), endTime: hhmm(minutes + 90), earlyInMinutes: 10, graceMinutes: 5 },
        { adminId: ADMIN, name: 'Later', startTime: hhmm(minutes + 120), endTime: hhmm(minutes + 170), earlyInMinutes: 15, graceMinutes: 5 },
    ]);
    [staffOpen, staffClosed, staffNone, staffDevice] = await StaffV2Model.insertMany(['Asha Open', 'Ravi Later', 'Nina NoShift', 'Dev Device']
        .map((name, i) => ({ adminId: ADMIN, name, empCode: `T-${i}`, status: 'active' })));
    const today = todayKey();
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const cell = (shiftId) => ({ [today]: String(shiftId) });
    await RosterV2Model.insertMany([
        { adminId: ADMIN, staffId: String(staffOpen._id), year, month, days: cell(shiftOpen._id), shiftIds: [String(shiftOpen._id)] },
        { adminId: ADMIN, staffId: String(staffClosed._id), year, month, days: cell(shiftClosed._id), shiftIds: [String(shiftClosed._id)] },
        { adminId: ADMIN, staffId: String(staffDevice._id), year, month, days: cell(shiftOpen._id), shiftIds: [String(shiftOpen._id)] },
    ]);
    const punchTime = new Date(nowWallClock().getTime() - 5 * 60000);
    await PunchLogV2Model.create({
        adminId: ADMIN, personType: 'staff', personId: String(staffDevice._id), punchTime, dateKey: today, terminalSn: 'T1',
        punchHash: buildPunchHash(ADMIN, String(staffDevice._id), punchTime),
    });
};

const mark = (personId, status, extraReq = {}) => call(overview.MarkAttendance, reqOf({ body: { adminId: ADMIN, personType: 'staff', personId: String(personId), status }, ...extraReq }));

const tests = {
    'mark Present inside the window: source manual, server time, AM/PM chip': async () => {
        const before = nowWallClock().getTime();
        const res = await mark(staffOpen._id, 'Present');
        assert.ifError(res.error);
        const record = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(staffOpen._id) }).lean();
        assert.strictEqual(record.status, 'Present');
        assert.strictEqual(record.source, 'manual');
        assert.strictEqual(record.dateKey, todayKey());
        assert.ok(Math.abs(record.markedAt.getTime() - before) < 120000, 'markedAt is the server wall clock');
        assert.match(res.body.cell.t, /^\d{1,2}:\d{2} (AM|PM)$/);
        assert.strictEqual(res.body.cell.s, 'P');
    },
    'mark Late again the same day: markedAt updates, previous value in the activity log': async () => {
        const res = await mark(staffOpen._id, 'Late');
        assert.ifError(res.error);
        const record = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(staffOpen._id) }).lean();
        assert.strictEqual(record.status, 'Late');
        const log = await ActivityLogModel.findOne({ adminId: ADMIN, action: 'attendance.mark' }).sort({ _id: -1 }).lean();
        assert.ok(log, 'every mark is logged');
        assert.strictEqual(log.meta.previous.status, 'Present', 'the previous value is kept');
        assert.strictEqual(log.meta.status, 'Late');
    },
    'mark Absent clears the manual mark (default Absent)': async () => {
        const res = await mark(staffOpen._id, 'Absent');
        assert.ifError(res.error);
        assert.strictEqual(res.body.cell.s, 'A');
        const record = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(staffOpen._id), deletedAt: null }).lean();
        assert.strictEqual(record, null);
    },
    'outside the window is refused 403 MARK_OUTSIDE_WINDOW with an AM/PM window': async () => {
        const res = await mark(staffClosed._id, 'Present');
        assert.ok(res.error, 'refused');
        assert.strictEqual(res.error.statusCode, 403);
        assert.strictEqual(res.error.code, 'MARK_OUTSIDE_WINDOW');
        assert.match(res.error.message, /(AM|PM)/);
    },
    'no shift today is refused 403 MARK_NO_SHIFT': async () => {
        const res = await mark(staffNone._id, 'Present');
        assert.strictEqual(res.error && res.error.code, 'MARK_NO_SHIFT');
    },
    'a device punch is never overwritten: 409 MARK_DEVICE_RECORDED': async () => {
        const res = await mark(staffDevice._id, 'Absent');
        assert.strictEqual(res.error && res.error.statusCode, 409);
        assert.strictEqual(res.error.code, 'MARK_DEVICE_RECORDED');
        assert.match(res.error.message, /(AM|PM)/);
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personId: String(staffDevice._id), source: 'manual' }), 0);
    },
    'today only: a past or future date is refused 403 MARK_NOT_TODAY': async () => {
        const body = { adminId: ADMIN, personType: 'staff', personId: String(staffOpen._id), status: 'Present' };
        for (const date of ['2020-01-01', '2099-12-31']) {
            const res = await call(overview.MarkAttendance, reqOf({ body: { ...body, date } }));
            assert.ok(res.error && res.error.statusCode === 403, 'refused ' + date);
            assert.strictEqual(res.error.code, 'MARK_NOT_TODAY');
        }
        const { value } = v.markSchema.validate({ ...body, date: '2020-01-01' }, { stripUnknown: true });
        assert.strictEqual(value.date, '2020-01-01', 'the date reaches the controller so it can be refused');
        const bad = v.markSchema.validate({ adminId: ADMIN, personType: 'staff', personId: String(staffOpen._id), status: 'HalfDay' });
        assert.ok(bad.error, 'only Present / Late / Absent');
    },
    'permission: attendance-mark is required (no grant → 403, grant → allowed)': async () => {
        const run = (staffId) => new Promise((resolve) => {
            requirePermission('attendance-mark', 'edit')({ user: { staffId: String(staffId) }, adminId: ADMIN }, {}, resolve);
        });
        const denied = await run(staffClosed._id);
        assert.ok(denied && denied.statusCode === 403, 'denied without the grant');
        const role = await RoleModel.create({ adminId: ADMIN, name: 'Attendance Marker', permissions: [{ module: 'attendance-mark', canView: true, canEdit: true }] });
        await RoleAssignmentModel.create({ adminId: ADMIN, staffId: staffNone._id, roleId: role._id, scope: 'school' });
        const allowed = await run(staffNone._id);
        assert.strictEqual(allowed, undefined, 'next() with no error');
    },
    'idempotency: a double click with one key writes once': async () => {
        let writes = 0;
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => { req.user = { id: ADMIN }; req.adminId = ADMIN; next(); });
        app.post('/mark', idempotency('attendance'), async (req, res) => { writes += 1; await new Promise((r) => setTimeout(r, 50)); res.status(200).json({ n: writes }); });
        const server = http.createServer(app).listen(0);
        const port = server.address().port;
        const key = `test-${Date.now()}-key`;
        const post = () => fetch(`http://127.0.0.1:${port}/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ adminId: ADMIN }) });
        const first = await post();
        const second = await post();
        server.close();
        assert.strictEqual(first.status, 200);
        assert.strictEqual(second.status, 200);
        assert.strictEqual(writes, 1, 'the second request replays, never re-executes');
    },
    'reconcile: a device punch replaces a manual mark; a manual mark without punches stays': async () => {
        await mark(staffOpen._id, 'Present');
        // A manual mark that predates the device punch (written directly — the API refuses it).
        await AttendanceRecordV2Model.updateOne(
            { adminId: ADMIN, personType: 'staff', personId: String(staffDevice._id), date: new Date(`${todayKey()}T00:00:00Z`) },
            { $set: { dateKey: todayKey(), status: 'Absent', source: 'manual', markedAt: nowWallClock(), deletedAt: null } },
            { upsert: true }
        );
        await reconcileDay(ADMIN, todayKey());
        const manual = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(staffOpen._id) }).lean();
        assert.strictEqual(manual.source, 'manual', 'no punch → manual mark kept');
        const device = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(staffDevice._id) }).lean();
        assert.ok(device, 'the punch was reconciled');
        assert.strictEqual(device.source, 'device');
        assert.ok(['Present', 'Late'].includes(device.status));
    },
    'grid: today default Absent, future roster codes, no-roster dash, canMark + window': async () => {
        const month = todayKey().slice(0, 7);
        const res = await call(overview.GetGrid, reqOf({ query: { adminId: ADMIN, personType: 'staff', month, search: '' } }));
        assert.ifError(res.error);
        const rows = new Map(res.body.rows.map((row) => [row._id, row]));
        const today = todayKey();
        const closed = rows.get(String(staffClosed._id));
        assert.strictEqual(closed.cells[today].s, 'A', 'rostered, nothing marked → Absent');
        assert.strictEqual(closed.mark.open, false);
        assert.match(closed.mark.from, /(AM|PM)$/);
        assert.strictEqual(rows.get(String(staffOpen._id)).mark.open, true);
        assert.strictEqual(rows.get(String(staffNone._id)).cells[today].n, 1, 'no roster → dash');
        assert.strictEqual(rows.get(String(staffDevice._id)).cells[today].src, 'device');
        assert.strictEqual(closed.sub, 'ID T-1', 'identity line is the employee ID');
        assert.strictEqual(typeof res.body.canMark, 'boolean');
        const future = Object.entries(closed.cells).find(([key]) => key > today);
        if (future) assert.ok(future[1].f === 1 || future[1].n === 1, 'future days are expected/no-roster, never a real status');
    },
    'roster: delete clears today onward in ONE write, then re-assign works': async () => {
        const month = todayKey().slice(0, 7);
        const staffIds = [String(staffClosed._id)];
        const assign = await call(roster.AssignStaffRoster, reqOf({ body: { adminId: ADMIN, staffIds, shiftId: String(shiftOpen._id), fromDate: todayKey(), toDate: todayKey(), weekdays: [0, 1, 2, 3, 4, 5, 6] } }));
        assert.ifError(assign.error);
        const clear = await call(roster.ClearStaffRoster, reqOf({ body: { adminId: ADMIN, staffIds, month, confirmed: true } }));
        assert.ifError(clear.error);
        let doc = await RosterV2Model.findOne({ adminId: ADMIN, staffId: staffIds[0] }).lean();
        assert.strictEqual((doc.days || {})[todayKey()], undefined, 'today cleared');
        assert.deepStrictEqual(doc.shiftIds, [], 'shiftIds recomputed in the same write');
        const again = await call(roster.AssignStaffRoster, reqOf({ body: { adminId: ADMIN, staffIds, shiftId: String(shiftClosed._id), fromDate: todayKey(), toDate: todayKey(), weekdays: [0, 1, 2, 3, 4, 5, 6] } }));
        assert.ifError(again.error);
        doc = await RosterV2Model.findOne({ adminId: ADMIN, staffId: staffIds[0] }).lean();
        assert.strictEqual(doc.days[todayKey()], String(shiftClosed._id), 're-assigned over the deleted cell');
    },
    'shift validation: Early Punch and Grace are required': async () => {
        const base = { adminId: ADMIN, name: 'X', startTime: '08:00', endTime: '14:00' };
        assert.ok(v.shiftSchema.validate(base).error, 'both missing → refused');
        assert.ok(v.shiftSchema.validate({ ...base, earlyInMinutes: 10 }).error, 'grace missing → refused');
        assert.ok(!v.shiftSchema.validate({ ...base, earlyInMinutes: 0, graceMinutes: 0 }).error, '0 is a valid answer');
        assert.ok(v.shiftSchema.validate({ ...base, earlyInMinutes: -1, graceMinutes: 5 }).error, 'negative refused');
    },
};

(async () => {
    await mongoose.connect(process.env.DB_URL, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
    let failed = 0;
    try {
        await setup();
        for (const [name, fn] of Object.entries(tests)) {
            const started = Date.now();
            try {
                await fn();
                console.log(`  ok   ${name} (${Date.now() - started} ms)`);
            } catch (error) {
                failed += 1;
                console.log(`  FAIL ${name}\n       ${error.message}`);
            }
        }
    } finally {
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${Object.keys(tests).length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('setup failed:', error.message);
    mongoose.connection.db && mongoose.connection.db.dropDatabase().finally(() => process.exit(1));
});
