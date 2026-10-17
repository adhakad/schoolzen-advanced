'use strict';
// Backend API suite (attendance-fix2.md Part C §2): the REAL /api/v2/attendance router —
// isAdminAuth, assertAdminScope, Joi validation, requirePermission, Idempotency-Key and the
// error handler — exercised over HTTP. Data lives in an isolated, throwaway database on the
// configured cluster, dropped at the end (never the app's own data).
//
// Run: node scripts/test-attendance-api.js      (needs backend/.env: DB_URL, REDIS_URL, ADMIN_ACCESS_SECRET)
require('dotenv').config();
// The window tests build shifts around "now"; move the school clock to a daytime zone if needed.
{
    const { DateTime } = require('luxon');
    const zones = [process.env.SCHOOL_TIMEZONE || 'Asia/Kolkata', 'UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'];
    process.env.SCHOOL_TIMEZONE = zones.find((zone) => { const h = DateTime.now().setZone(zone).hour; return h >= 2 && h <= 19; });
}
global.global_config = require('../config/config.js');
require('express-async-errors');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_DB = process.env.TEST_DB_NAME || 'schoolzen_attendance_api_test';
if (!/test/i.test(TEST_DB)) throw new Error('TEST_DB_NAME must contain "test" — this script drops it.');

const ShiftV2Model = require('../modules/models/attendance/shift');
const RosterV2Model = require('../modules/models/attendance/roster');
const AttendanceRecordV2Model = require('../modules/models/attendance/attendance-record');
const StaffV2Model = require('../modules/models/staff/staff');
const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const StudentProfileModel = require('../modules/models/student/student');
const StudentEnrollmentModel = require('../modules/models/student/student-enrollment');
const ClassShiftV2Model = require('../modules/models/attendance/class-shift');
const DeviceModel = require('../modules/models/devices/device');
const ActivityLogModel = require('../modules/models/audit/activity-log');
const errorHandler = require('../modules/middleware/errorHandler');
const { todayKey } = require('../modules/helpers/attendance/context');
const { nowWallClock } = require('../modules/helpers/attendance-time');

const OID = () => new mongoose.Types.ObjectId();
const ADMIN = OID().toHexString();
const OTHER_ADMIN = OID().toHexString();
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (minutes) => { const m = ((minutes % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const tokenFor = (payload) => jwt.sign({ payload }, process.env.ADMIN_ACCESS_SECRET, { expiresIn: '1h' });
const OWNER = tokenFor({ id: ADMIN });

let base;
let server;
const f = { };

const api = async (method, path, { body, query, token = OWNER, headers = {} } = {}) => {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const res = await fetch(`${base}${path}${qs}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { json = text; }
    return { status: res.status, body: json };
};
const key = () => `api-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const codeOf = (res) => res.body && res.body.error && res.body.error.code;

const setup = async () => {
    // A fresh DB is still building indexes, and MongoDB aborts transactions on those catalog
    // changes — wait for every registered model's collection + indexes first.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    const now = nowWallClock();
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const today = todayKey();
    const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    [f.open, f.closed] = await ShiftV2Model.insertMany([
        { adminId: ADMIN, name: 'Open Now', startTime: hhmm(minutes - 30), endTime: hhmm(minutes + 90), earlyInMinutes: 10, graceMinutes: 5 },
        { adminId: ADMIN, name: 'Later', startTime: hhmm(minutes + 120), endTime: hhmm(minutes + 170), earlyInMinutes: 15, graceMinutes: 5 },
    ]);
    [f.asha, f.ravi, f.nogrant] = await StaffV2Model.insertMany(['Asha', 'Ravi', 'No Grant'].map((name, i) => ({ adminId: ADMIN, name, empCode: `A-${i}`, status: 'active' })));
    await RosterV2Model.insertMany([
        { adminId: ADMIN, staffId: String(f.asha._id), year: y, month: m, days: { [today]: String(f.open._id) }, shiftIds: [String(f.open._id)] },
        { adminId: ADMIN, staffId: String(f.ravi._id), year: y, month: m, days: { [today]: String(f.closed._id) }, shiftIds: [String(f.closed._id)] },
    ]);
    const [session] = await AcademicSessionV2Model.insertMany([
        { adminId: ADMIN, label: '2026-2027', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), status: 'active' },
    ]);
    f.classA = OID();
    [f.sita] = await StudentProfileModel.insertMany([{ adminId: ADMIN, name: 'Sita' }]);
    await StudentEnrollmentModel.create({ adminId: ADMIN, studentId: f.sita._id, sessionId: session._id, classId: f.classA, class: 8, rollNumber: 3, entryType: 'admission' });
    await ClassShiftV2Model.create({ adminId: ADMIN, sessionId: String(session._id), classId: String(f.classA), shiftId: String(f.open._id) });
};

const tests = {
    'auth: no token → 403; another school\'s adminId → 403 PermissionError (shaped)': async () => {
        const none = await api('GET', '/grid', { token: null, query: { adminId: ADMIN, personType: 'staff', month: todayKey().slice(0, 7) } });
        assert.strictEqual(none.status, 403);
        const other = await api('GET', '/grid', { query: { adminId: OTHER_ADMIN, personType: 'staff', month: todayKey().slice(0, 7) } });
        assert.strictEqual(other.status, 403);
        assert.strictEqual(other.body.error.category, 'PermissionError');
    },
    'grid: 200, every person row, canMark for the owner, validation 400 on a bad month': async () => {
        const res = await api('GET', '/grid', { query: { adminId: ADMIN, personType: 'staff', month: todayKey().slice(0, 7) } });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.body.rows.map((r) => r.name).sort(), ['Asha', 'No Grant', 'Ravi']);
        assert.strictEqual(res.body.canMark, true);
        const bad = await api('GET', '/grid', { query: { adminId: ADMIN, personType: 'staff', month: '2026-13' } });
        assert.strictEqual(bad.status, 400);
        assert.strictEqual(bad.body.error.category, 'ValidationError');
    },
    'grid student: no class → needsClass, no rows; with class → the student': async () => {
        const month = todayKey().slice(0, 7);
        const none = await api('GET', '/grid', { query: { adminId: ADMIN, personType: 'student', month, session: '2026-2027' } });
        assert.strictEqual(none.status, 200);
        assert.strictEqual(none.body.needsClass, true);
        assert.strictEqual(none.body.rows.length, 0);
        const withClass = await api('GET', '/grid', { query: { adminId: ADMIN, personType: 'student', month, session: '2026-2027', classId: String(f.classA) } });
        assert.deepStrictEqual(withClass.body.rows.map((r) => r.idLine), ['Roll 3']);
    },
    'mark today: 200 + cell; same Idempotency-Key replays, writes and logs once': async () => {
        const k = key();
        const body = { adminId: ADMIN, personType: 'staff', personId: String(f.asha._id), status: 'Present' };
        const first = await api('POST', '/mark', { body, headers: { 'Idempotency-Key': k } });
        assert.strictEqual(first.status, 200, JSON.stringify(first.body));
        assert.strictEqual(first.body.cell.s, 'P');
        const again = await api('POST', '/mark', { body, headers: { 'Idempotency-Key': k } });
        assert.strictEqual(again.status, 200);
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personId: String(f.asha._id), deletedAt: null }), 1);
        assert.strictEqual(await ActivityLogModel.countDocuments({ adminId: ADMIN, action: 'attendance.mark', targetId: String(f.asha._id) }), 1);
    },
    'mark past / future → 403 MARK_NOT_TODAY; outside window → 403 MARK_OUTSIDE_WINDOW': async () => {
        for (const date of ['2020-01-01', '2099-12-31']) {
            const res = await api('POST', '/mark', { body: { adminId: ADMIN, personType: 'staff', personId: String(f.asha._id), status: 'Late', date }, headers: { 'Idempotency-Key': key() } });
            assert.strictEqual(res.status, 403);
            assert.strictEqual(codeOf(res), 'MARK_NOT_TODAY');
        }
        const late = await api('POST', '/mark', { body: { adminId: ADMIN, personType: 'staff', personId: String(f.ravi._id), status: 'Present' }, headers: { 'Idempotency-Key': key() } });
        assert.strictEqual(late.status, 403);
        assert.strictEqual(codeOf(late), 'MARK_OUTSIDE_WINDOW');
        assert.match(late.body.error.message, /(AM|PM)/);
    },
    'mark without the attendance-mark grant → 403, nothing written': async () => {
        const token = tokenFor({ id: ADMIN, staffId: String(f.nogrant._id) });
        const res = await api('POST', '/mark', { token, body: { adminId: ADMIN, personType: 'staff', personId: String(f.asha._id), status: 'Late' }, headers: { 'Idempotency-Key': key() } });
        assert.strictEqual(res.status, 403);
        const record = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(f.asha._id) }).lean();
        assert.strictEqual(record.status, 'Present', 'unchanged');
    },
    'mark student: class required (400), with class → 200': async () => {
        const body = { adminId: ADMIN, personType: 'student', personId: String(f.sita._id), status: 'Present', session: '2026-2027' };
        const none = await api('POST', '/mark', { body, headers: { 'Idempotency-Key': key() } });
        assert.strictEqual(none.status, 400);
        assert.strictEqual(codeOf(none), 'MARK_CLASS_REQUIRED');
        const ok = await api('POST', '/mark', { body: { ...body, classId: String(f.classA) }, headers: { 'Idempotency-Key': key() } });
        assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    },
    'roster: assign → delete → re-assign over HTTP': async () => {
        const staffIds = [String(f.nogrant._id)];
        const today = todayKey();
        const assign = await api('POST', '/roster/staff/assign', { body: { adminId: ADMIN, staffIds, shiftId: String(f.open._id), fromDate: today, toDate: today, weekdays: [0, 1, 2, 3, 4, 5, 6] } });
        assert.strictEqual(assign.status, 200, JSON.stringify(assign.body));
        let doc = await RosterV2Model.findOne({ adminId: ADMIN, staffId: staffIds[0] }).lean();
        assert.strictEqual(doc.days[today], String(f.open._id));
        assert.deepStrictEqual(doc.shiftIds, [String(f.open._id)], 'shiftIds written with the cells');
        const clear = await api('POST', '/roster/staff/clear', { body: { adminId: ADMIN, staffIds, month: today.slice(0, 7), confirmed: true } });
        assert.strictEqual(clear.status, 200);
        doc = await RosterV2Model.findOne({ adminId: ADMIN, staffId: staffIds[0] }).lean();
        assert.strictEqual((doc.days || {})[today], undefined);
        const again = await api('POST', '/roster/staff/assign', { body: { adminId: ADMIN, staffIds, shiftId: String(f.closed._id), fromDate: today, toDate: today, weekdays: [0, 1, 2, 3, 4, 5, 6] } });
        assert.strictEqual(again.status, 200);
        doc = await RosterV2Model.findOne({ adminId: ADMIN, staffId: staffIds[0] }).lean();
        assert.strictEqual(doc.days[today], String(f.closed._id));
    },
    'shifts: create, duplicate 409, bad range 400, edit, delete-in-use 409, delete unused': async () => {
        const shift = { adminId: ADMIN, name: 'Evening', startTime: '16:00', endTime: '18:00', earlyInMinutes: 5, graceMinutes: 5 };
        const created = await api('POST', '/shifts', { body: shift });
        assert.strictEqual(created.status, 200, JSON.stringify(created.body));
        const id = created.body.shift._id;
        const dup = await api('POST', '/shifts', { body: { ...shift, name: 'evening' } });
        assert.strictEqual(dup.status, 409);
        const range = await api('POST', '/shifts', { body: { ...shift, name: 'Backwards', startTime: '18:00', endTime: '16:00' } });
        assert.strictEqual(range.status, 400);
        const edit = await api('PUT', `/shifts/${id}`, { body: { ...shift, endTime: '19:00' } });
        assert.strictEqual(edit.status, 200);
        assert.strictEqual(edit.body.shift.endTime, '19:00');
        const inUse = await api('DELETE', `/shifts/${f.open._id}`, { query: { adminId: ADMIN } });
        assert.strictEqual(inUse.status, 409);
        assert.strictEqual(codeOf(inUse), 'SHIFT_IN_USE');
        const del = await api('DELETE', `/shifts/${id}`, { query: { adminId: ADMIN } });
        assert.strictEqual(del.status, 200);
        assert.strictEqual(await ShiftV2Model.countDocuments({ _id: id }), 0);
        const list = await api('GET', '/shifts', { query: { adminId: ADMIN, page: 1, limit: 10 } });
        assert.ok(!list.body.rows.some((row) => row._id === id), 'the cached list no longer shows it');
    },
    'sync: needs confirmed; no device → 400 SYNC_NO_DEVICES; with a device → 202 (or a clear 502 when no worker)': async () => {
        const unconfirmed = await api('POST', '/sync', { body: { adminId: ADMIN } });
        assert.strictEqual(unconfirmed.status, 400);
        const none = await api('POST', '/sync', { body: { adminId: ADMIN, confirmed: true } });
        assert.strictEqual(none.status, 400);
        assert.strictEqual(codeOf(none), 'SYNC_NO_DEVICES');
        await DeviceModel.create({ terminalSn: `TEST-${ADMIN.slice(-6)}`, assignedSchoolId: ADMIN, status: 'active', active: true });
        const res = await api('POST', '/sync', { body: { adminId: ADMIN, confirmed: true } });
        assert.ok([202, 502].includes(res.status), JSON.stringify(res.body));
        if (res.status === 502) assert.strictEqual(codeOf(res), 'SYNC_WORKER_DOWN');
        const status = await api('GET', '/sync-status', { query: { adminId: ADMIN } });
        assert.strictEqual(status.status, 200);
    },
};

(async () => {
    await mongoose.connect(process.env.DB_URL, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
    const app = express();
    app.use(express.json());
    app.use('/api/v2/attendance', require('../modules/routes/attendance/attendance.routes'));
    app.use(errorHandler);
    server = http.createServer(app).listen(0);
    base = `http://127.0.0.1:${server.address().port}/api/v2/attendance`;
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
        server.close();
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${Object.keys(tests).length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('setup failed:', error.message);
    if (server) server.close();
    mongoose.connection.db && mongoose.connection.db.dropDatabase().finally(() => process.exit(1));
});
