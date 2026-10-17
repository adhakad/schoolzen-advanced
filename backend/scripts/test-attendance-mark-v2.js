'use strict';
// Live checks for attendance-fix1.md (manual marking, device-wins reconcile, roster delete →
// re-assign, grid cells, shift validation) against a REAL MongoDB — but an isolated,
// throwaway database on the configured cluster (never the app's own data), dropped at the end.
//
// Run: node scripts/test-attendance-mark-v2.js      (needs backend/.env: DB_URL, REDIS_URL)
//      TEST_DB_NAME=other_db node scripts/test-attendance-mark-v2.js
//      LIVE_APP_DB=1 node scripts/test-attendance-mark-v2.js   — the Live suite (attendance-fix2.md
//        Part C §3): the app's REAL database, scoped to a brand-new throwaway school id; every
//        row with that adminId (and its Redis keys / queued jobs) is deleted at the end and the
//        cleanup is verified, instead of dropping a database.
require('dotenv').config();
// The window tests build shifts around "now"; at night in the school's zone there is no room,
// so the test clock moves to the first zone where it is daytime (the code reads SCHOOL_TIMEZONE).
{
    const { DateTime } = require('luxon');
    const zones = [process.env.SCHOOL_TIMEZONE || 'Asia/Kolkata', 'UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'];
    process.env.SCHOOL_TIMEZONE = zones.find((zone) => { const h = DateTime.now().setZone(zone).hour; return h >= 2 && h <= 19; });
}
global.global_config = require('../config/config.js');
const assert = require('assert');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');

const LIVE = process.env.LIVE_APP_DB === '1';
const TEST_DB = process.env.TEST_DB_NAME || 'schoolzen_attendance_fix1_test';
if (!LIVE && !/test/i.test(TEST_DB)) throw new Error('TEST_DB_NAME must contain "test" — this script drops it.');

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
const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const StudentProfileModel = require('../modules/models/student/student');
const StudentEnrollmentModel = require('../modules/models/student/student-enrollment');
const ClassShiftV2Model = require('../modules/models/attendance/class-shift');

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
// Students (attendance-fix2.md Part D): enrolled in a CLOSED session that the header shows,
// while another session is the server's "active" one — the live data shape that broke marking.
const OID = () => new mongoose.Types.ObjectId();
const CLASS_A = OID();
const CLASS_B = OID();
const SECTION_X = OID();
const SECTION_Y = OID();
const SHOWN_SESSION = '2026-2027';
let studentOpen;
let studentClosed;

const setup = async () => {
    // A fresh DB is still building indexes, and MongoDB aborts transactions on those catalog
    // changes — wait for every registered model's collection + indexes first.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
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

    const [shown] = await AcademicSessionV2Model.insertMany([
        { adminId: ADMIN, label: SHOWN_SESSION, startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), status: 'closed' },
        { adminId: ADMIN, label: '2027-2028', startDate: new Date('2027-04-01'), endDate: new Date('2028-03-31'), status: 'active' },
    ]);
    [studentOpen, studentClosed] = await StudentProfileModel.insertMany([{ adminId: ADMIN, name: 'Sita Student' }, { adminId: ADMIN, name: 'Raju Student' }]);
    await StudentEnrollmentModel.insertMany([
        { adminId: ADMIN, studentId: studentOpen._id, sessionId: shown._id, classId: CLASS_A, class: 8, sectionId: SECTION_X, rollNumber: 1, entryType: 'admission' },
        { adminId: ADMIN, studentId: studentClosed._id, sessionId: shown._id, classId: CLASS_B, class: 9, rollNumber: 1, entryType: 'admission' },
    ]);
    await ClassShiftV2Model.insertMany([
        { adminId: ADMIN, sessionId: String(shown._id), classId: String(CLASS_A), shiftId: String(shiftOpen._id) },
        { adminId: ADMIN, sessionId: String(shown._id), classId: String(CLASS_B), shiftId: String(shiftClosed._id) },
    ]);
};

const markStudent = (student, status, context = {}) => call(overview.MarkAttendance, reqOf({
    body: { adminId: ADMIN, personType: 'student', personId: String(student._id), status, ...context },
}));
const ctxA = { session: SHOWN_SESSION, classId: String(CLASS_A), sectionId: String(SECTION_X) };

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
        assert.strictEqual(closed.idLine, 'EMP ID T-1', 'identity line is the employee ID');
        assert.ok(closed.sub && closed.sub === closed.shift, 'staff second line is today\'s shift');
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
    'student: mark Present in the shown session + class → written, grid reads it back': async () => {
        const res = await markStudent(studentOpen, 'Present', ctxA);
        assert.ifError(res.error);
        assert.strictEqual(res.body.cell.s, 'P');
        const record = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personType: 'student', personId: String(studentOpen._id), deletedAt: null }).lean();
        assert.strictEqual(record && record.status, 'Present');
        const grid = await call(overview.GetGrid, reqOf({ query: { adminId: ADMIN, personType: 'student', month: todayKey().slice(0, 7), session: SHOWN_SESSION, classId: String(CLASS_A), search: '' } }));
        assert.ifError(grid.error);
        const row = grid.body.rows.find((r) => r._id === String(studentOpen._id));
        assert.ok(row, 'student is in the class grid');
        assert.strictEqual(row.cells[todayKey()].s, 'P');
        assert.strictEqual(row.cells[todayKey()].src, 'manual');
        assert.strictEqual(row.mark.open, true, 'class shift window is open');
    },
    'student: no class → 400 MARK_CLASS_REQUIRED; grid with no class → no rows, needsClass': async () => {
        const res = await markStudent(studentOpen, 'Present', { session: SHOWN_SESSION });
        assert.strictEqual(res.error && res.error.statusCode, 400);
        assert.strictEqual(res.error.code, 'MARK_CLASS_REQUIRED');
        const grid = await call(overview.GetGrid, reqOf({ query: { adminId: ADMIN, personType: 'student', month: todayKey().slice(0, 7), session: SHOWN_SESSION, search: '' } }));
        assert.ifError(grid.error);
        assert.strictEqual(grid.body.needsClass, true);
        assert.strictEqual(grid.body.rows.length, 0);
    },
    'student: wrong class / wrong section / other session → 403 MARK_NOT_ENROLLED, nothing written': async () => {
        const before = await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personType: 'student' });
        for (const context of [
            { session: SHOWN_SESSION, classId: String(CLASS_B) },
            { session: SHOWN_SESSION, classId: String(CLASS_A), sectionId: String(SECTION_Y) },
            { session: '2027-2028', classId: String(CLASS_A) },
        ]) {
            const res = await markStudent(studentOpen, 'Late', context);
            assert.strictEqual(res.error && res.error.code, 'MARK_NOT_ENROLLED', JSON.stringify(context));
            assert.strictEqual(res.error.statusCode, 403);
        }
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personType: 'student' }), before);
    },
    'student: past/future refused MARK_NOT_TODAY; outside the class shift window refused': async () => {
        for (const date of ['2020-01-01', '2099-12-31']) {
            const res = await markStudent(studentOpen, 'Present', { ...ctxA, date });
            assert.strictEqual(res.error && res.error.code, 'MARK_NOT_TODAY');
        }
        const res = await markStudent(studentClosed, 'Present', { session: SHOWN_SESSION, classId: String(CLASS_B) });
        assert.strictEqual(res.error && res.error.code, 'MARK_OUTSIDE_WINDOW');
        assert.match(res.error.message, /(AM|PM)/);
    },
    'student: the mark route is behind attendance-mark (no grant → 403)': async () => {
        const denied = await new Promise((resolve) => {
            requirePermission('attendance-mark', 'edit')({ user: { staffId: String(staffClosed._id) }, adminId: ADMIN, body: { personType: 'student' } }, {}, resolve);
        });
        assert.ok(denied && denied.statusCode === 403);
    },
    'shift validation: Early Punch and Grace are required': async () => {
        const base = { adminId: ADMIN, name: 'X', startTime: '08:00', endTime: '14:00' };
        assert.ok(v.shiftSchema.validate(base).error, 'both missing → refused');
        assert.ok(v.shiftSchema.validate({ ...base, earlyInMinutes: 10 }).error, 'grace missing → refused');
        assert.ok(!v.shiftSchema.validate({ ...base, earlyInMinutes: 0, graceMinutes: 0 }).error, '0 is a valid answer');
        assert.ok(v.shiftSchema.validate({ ...base, earlyInMinutes: -1, graceMinutes: 5 }).error, 'negative refused');
    },
};

/** Live suite: delete every row this run's throwaway school owns, then prove none is left. */
const cleanupLive = async () => {
    const db = mongoose.connection.db;
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
    let removed = 0;
    for (const name of names) removed += (await db.collection(name).deleteMany({ adminId: ADMIN })).deletedCount;
    let left = 0;
    for (const name of names) left += await db.collection(name).countDocuments({ adminId: ADMIN });
    const cache = require('../modules/services/cache/cache.service');
    await cache.delPattern(`${ADMIN}:*`);
    try {
        const q = require('../modules/queues/attendance-v2-queue');
        const job = await q.attendanceV2Queue.getJob(q.reconcileJobId(ADMIN, todayKey()));
        if (job) await job.remove().catch(() => undefined);
    } catch (error) { /* queue optional */ }
    console.log(`  live cleanup: ${removed} rows removed across ${names.length} collections, ${left} left`);
    if (left) throw new Error(`live cleanup left ${left} rows for ${ADMIN}`);
};

(async () => {
    await mongoose.connect(process.env.DB_URL, LIVE ? { serverSelectionTimeoutMS: 20000 } : { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
    if (LIVE) console.log(`  live: database "${mongoose.connection.name}", throwaway adminId ${ADMIN}`);
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
        if (LIVE) await cleanupLive();
        else await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${Object.keys(tests).length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('setup failed:', error.message);
    // NEVER drop in live mode — that is the app's own database; delete this run's rows only.
    const cleanup = LIVE ? cleanupLive() : (mongoose.connection.db ? mongoose.connection.db.dropDatabase() : Promise.resolve());
    cleanup.catch((e) => console.error('cleanup failed:', e.message)).finally(() => process.exit(1));
});
