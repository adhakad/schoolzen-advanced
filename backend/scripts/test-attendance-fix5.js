'use strict';
// attendance-fix5.md §2 — backend API tests for 'attendance-edit-past', over HTTP through the
// REAL /api/v2/attendance router (isAdminAuth, assertAdminScope, Joi, requirePermission,
// Idempotency-Key, error handler). Data lives in an isolated throwaway database on the
// configured cluster, dropped at the end (never the app's own data).
//   1. allowed case → 200, read back through the grid
//   2. one test per refusal (403 + clear message): no roster, Holiday, approved Leave, roster
//      week-off, device punch, no permission, other session, today, future
//   3. activity log: old/new status, user, source 'manual'; no time stored on the record
//   4. another tenant can not read or change the data
//   5. the key is seeded next to 'attendance-mark' and the backend refuses without it
//   6. route table (frontend service URLs ↔ real routes) — see also test-attendance-routes.js
//   7. v2 isolation: no write reaches a legacy collection; legacy `device` is read-only
//
// Run: node scripts/test-attendance-fix5.js     (needs backend/.env: DB_URL, REDIS_URL, ADMIN_ACCESS_SECRET)
require('dotenv').config();
global.global_config = require('../config/config.js');
require('express-async-errors');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_DB = process.env.TEST_DB_NAME || 'schoolzen_attendance_fix5_test';
if (!/test/i.test(TEST_DB)) throw new Error('TEST_DB_NAME must contain "test" — this script drops it.');

// Every write the run sends, by collection (§2.7). Registered before any model is used.
const writes = new Map();
const WRITE_OPS = /^(insert|update|replace|delete|findOneAndUpdate|findOneAndReplace|findOneAndDelete|findAndModify|bulkWrite)/i;
mongoose.set('debug', (collection, method) => {
    if (WRITE_OPS.test(method)) writes.set(collection, (writes.get(collection) || new Set()).add(method));
});

const ShiftV2Model = require('../modules/models/attendance/shift');
const RosterV2Model = require('../modules/models/attendance/roster');
const AttendanceRecordV2Model = require('../modules/models/attendance/attendance-record');
const PunchLogV2Model = require('../modules/models/attendance/punch-log');
const StaffV2Model = require('../modules/models/staff/staff');
const RoleModel = require('../modules/models/settings/role');
const RoleAssignmentModel = require('../modules/models/settings/role-assignment');
const ActivityLogModel = require('../modules/models/audit/activity-log');
const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const HolidayV2Model = require('../modules/models/holiday/holiday');
const HolidayTemplateV2Model = require('../modules/models/holiday/holiday-template');
const LeaveRequestV2Model = require('../modules/models/leave/leave-request');
const errorHandler = require('../modules/middleware/errorHandler');
const { ensureSeededRoles } = require('../modules/helpers/settings/owner-bootstrap');
const rolesController = require('../modules/controllers/settings/roles-permissions.controller');
const { todayKey } = require('../modules/helpers/attendance/context');
const { buildPunchHash } = require('../modules/helpers/attendance/status');
const { parseDateKey } = require('../modules/helpers/date-only');

const ROOT = path.join(__dirname, '..', '..');
const OID = () => new mongoose.Types.ObjectId();
const ADMIN = OID().toHexString();
const OTHER_ADMIN = OID().toHexString();
const tokenFor = (payload) => jwt.sign({ payload }, process.env.ADMIN_ACCESS_SECRET, { expiresIn: '1h' });
const OWNER = tokenFor({ id: ADMIN });
const OTHER = tokenFor({ id: OTHER_ADMIN });
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const today = todayKey();
// A real past day (yesterday), picked dynamically; its month's roster is written directly so
// the 1st of a month works too (earlier months are locked for Bulk Assign).
const pastDay = addDays(today, -1);
const pastMonth = pastDay.slice(0, 7);
const sessionStartYear = (key) => { const y = Number(key.slice(0, 4)); return Number(key.slice(5, 7)) >= 4 ? y : y - 1; };
const sy = sessionStartYear(pastDay);
const currentLabel = `${sy}-${sy + 1}`;
const oldLabel = `${sy - 1}-${sy}`;

let base;
let server;
const f = {};

const api = async (method, urlPath, { body, query, token = OWNER, headers = {} } = {}) => {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const res = await fetch(`${base}${urlPath}${qs}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { json = text; }
    return { status: res.status, body: json };
};
const key = () => `fix5-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const codeOf = (res) => res.body && res.body.error && res.body.error.code;
const messageOf = (res) => res.body && res.body.error && res.body.error.message;
const markPast = (person, status, { token = OWNER, ...extra } = {}) => api('POST', '/mark-past', {
    token,
    headers: { 'Idempotency-Key': key() },
    body: { adminId: ADMIN, personType: 'staff', personId: String(person._id), status, date: pastDay, session: currentLabel, ...extra },
});
const liveRecord = (person, dateKey = pastDay) => AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(person._id), dateKey, deletedAt: null }).lean();

/** A refusal: 403, its own code, a readable English message, and nothing written. */
const assertRefused = async (res, code, person) => {
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    if (code) assert.strictEqual(codeOf(res), code);
    const message = messageOf(res);
    assert.ok(typeof message === 'string' && message.length > 10 && !/^[A-Z_]+$/.test(message), `clear message, got ${JSON.stringify(message)}`);
    if (person) assert.strictEqual(await liveRecord(person), null, 'nothing written');
};

const setup = async () => {
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    await AcademicSessionV2Model.insertMany([
        { adminId: ADMIN, label: currentLabel, startDate: new Date(Date.UTC(sy, 3, 1)), endDate: new Date(Date.UTC(sy + 1, 2, 31)), status: 'active' },
        { adminId: ADMIN, label: oldLabel, startDate: new Date(Date.UTC(sy - 1, 3, 1)), endDate: new Date(Date.UTC(sy, 2, 31)), status: 'closed' },
    ]);
    f.shift = await ShiftV2Model.create({ adminId: ADMIN, name: 'Morning', startTime: '08:00', endTime: '14:00', earlyInMinutes: 10, graceMinutes: 5 });
    const holiday = await HolidayV2Model.create({ adminId: ADMIN, name: 'Fix5 Holiday', startDateKey: pastDay, endDateKey: pastDay });
    const template = await HolidayTemplateV2Model.create({ adminId: ADMIN, name: 'Fix5 Template', holidayIds: [holiday._id] });
    const names = ['Ravi OK', 'Nobody Rostered', 'Hari Holiday', 'Lata Leave', 'Wasim WeekOff', 'Dev Device', 'Sita Session', 'Mona MarkOnly', 'Tara Granted'];
    [f.ok, f.none, f.holiday, f.leave, f.wo, f.device, f.session, f.markOnly, f.granted] = await StaffV2Model.insertMany(names.map((name, i) => ({
        adminId: ADMIN, name, empCode: `F5-${i}`, status: 'active', holidayTemplateId: i === 2 ? template._id : null,
    })));
    // Whole-month roster for everyone but `none`, written directly for the past day's month.
    const { year, month } = parseDateKey(pastDay);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const fullMonth = Object.fromEntries(Array.from({ length: last }, (_, i) => [`${pastMonth}-${String(i + 1).padStart(2, '0')}`, String(f.shift._id)]));
    await RosterV2Model.insertMany([f.ok, f.holiday, f.leave, f.wo, f.device, f.session, f.markOnly, f.granted].map((staff) => ({
        adminId: ADMIN, staffId: String(staff._id), year, month,
        days: staff === f.wo ? { ...fullMonth, [pastDay]: 'WO' } : fullMonth,
        shiftIds: [String(f.shift._id)],
    })));
    await LeaveRequestV2Model.create({
        adminId: ADMIN, sessionId: OID().toHexString(), personType: 'staff', personId: String(f.leave._id), leaveTypeId: OID().toHexString(),
        fromDateKey: pastDay, toDateKey: pastDay, days: 1, status: 'Approved', chargedDays: 1, dateKeys: [pastDay],
    });
    const punchTime = new Date(`${pastDay}T08:05:00Z`);
    await PunchLogV2Model.create({ adminId: ADMIN, personType: 'staff', personId: String(f.device._id), punchTime, dateKey: pastDay, terminalSn: 'FIX5', punchHash: buildPunchHash(ADMIN, String(f.device._id), punchTime) });
    // Mona may mark TODAY only; Tara may also change past days.
    const [markOnly, editPast] = await RoleModel.insertMany([
        { adminId: ADMIN, name: 'Marker', permissions: [{ module: 'attendance', canView: true, canEdit: true }, { module: 'attendance-mark', canView: true, canEdit: true }] },
        { adminId: ADMIN, name: 'Past Editor', permissions: [{ module: 'attendance', canView: true, canEdit: true }, { module: 'attendance-edit-past', canView: true, canEdit: true }] },
    ]);
    await RoleAssignmentModel.insertMany([
        { adminId: ADMIN, staffId: f.markOnly._id, roleId: markOnly._id, scope: 'school' },
        { adminId: ADMIN, staffId: f.granted._id, roleId: editPast._id, scope: 'school' },
    ]);
};

const tests = {
    // ---- 2.1 allowed ---------------------------------------------------------------------
    '2.1 allowed: past + roster + working day + no punch + permission + in session → 200, read back': async () => {
        const res = await markPast(f.ok, 'Present');
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        assert.deepStrictEqual(res.body.cell, { s: 'P', t: null, src: 'manual' });
        const grid = await api('GET', '/grid', { query: { adminId: ADMIN, personType: 'staff', month: pastMonth, session: currentLabel } });
        assert.strictEqual(grid.status, 200);
        const cell = grid.body.rows.find((r) => r._id === String(f.ok._id)).cells[pastDay];
        assert.strictEqual(cell.s, 'P');
        assert.strictEqual(cell.src, 'manual');
        assert.strictEqual(cell.t, null, 'no time shown');
        const late = await markPast(f.ok, 'Late');
        assert.strictEqual(late.status, 200);
        assert.strictEqual((await liveRecord(f.ok)).status, 'Late');
    },
    // ---- 2.2 refusals, one each ----------------------------------------------------------
    '2.2 refused: no roster': async () => assertRefused(await markPast(f.none, 'Present'), 'MARK_PAST_NO_ROSTER', f.none),
    '2.2 refused: Holiday': async () => assertRefused(await markPast(f.holiday, 'Present'), 'MARK_PAST_DAY_OFF', f.holiday),
    '2.2 refused: approved Leave': async () => assertRefused(await markPast(f.leave, 'Present'), 'MARK_PAST_DAY_OFF', f.leave),
    '2.2 refused: roster week-off': async () => assertRefused(await markPast(f.wo, 'Present'), 'MARK_PAST_DAY_OFF', f.wo),
    '2.2 refused: device punch exists': async () => {
        await assertRefused(await markPast(f.device, 'Absent'), 'MARK_PAST_DEVICE');
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personId: String(f.device._id), source: 'manual' }), 0);
    },
    '2.2 refused: no permission (has attendance-mark, not attendance-edit-past)': async () => {
        const token = tokenFor({ id: ADMIN, staffId: String(f.markOnly._id) });
        await assertRefused(await markPast(f.ok, 'Absent', { token }));
        assert.strictEqual((await liveRecord(f.ok)).status, 'Late', 'unchanged');
    },
    '2.2 refused: other session': async () => assertRefused(await markPast(f.session, 'Present', { session: oldLabel }), 'MARK_PAST_OUTSIDE_SESSION', f.session),
    '2.2 refused: today': async () => assertRefused(await markPast(f.session, 'Present', { date: today }), 'MARK_PAST_NOT_PAST', f.session),
    '2.2 refused: future date': async () => {
        await assertRefused(await markPast(f.session, 'Present', { date: addDays(today, 2) }), 'MARK_PAST_NOT_PAST');
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personId: String(f.session._id) }), 0);
    },
    // ---- 2.3 activity log ----------------------------------------------------------------
    '2.3 activity log: old/new status, user, source manual; no time stored on the record': async () => {
        const res = await markPast(f.session, 'Present');
        assert.strictEqual(res.status, 200);
        const log = await ActivityLogModel.findOne({ adminId: ADMIN, action: 'attendance.mark-past', targetId: String(f.session._id) }).sort({ _id: -1 }).lean();
        assert.ok(log, 'logged');
        assert.strictEqual(log.meta.oldStatus, 'Absent');
        assert.strictEqual(log.meta.newStatus, 'Present');
        assert.strictEqual(log.meta.source, 'manual');
        assert.strictEqual(log.meta.date, pastDay);
        assert.strictEqual(log.actorId, ADMIN, 'the user');
        assert.ok(log.meta.by, 'user in meta');
        const record = await liveRecord(f.session);
        assert.strictEqual(record.source, 'manual');
        assert.strictEqual(record.inTime, null, 'no in time');
        assert.strictEqual(record.outTime, null, 'no out time');
        assert.deepStrictEqual(record.punches, [], 'no punch times');
        // Granted staff (not the owner): the log names that staff member.
        const token = tokenFor({ id: ADMIN, staffId: String(f.granted._id) });
        const asStaff = await markPast(f.session, 'Late', { token });
        assert.strictEqual(asStaff.status, 200, JSON.stringify(asStaff.body));
        const log2 = await ActivityLogModel.findOne({ adminId: ADMIN, action: 'attendance.mark-past', targetId: String(f.session._id) }).sort({ _id: -1 }).lean();
        assert.strictEqual(log2.meta.oldStatus, 'Present');
        assert.strictEqual(log2.meta.newStatus, 'Late');
        assert.strictEqual(String(log2.meta.by), String(f.granted._id));
    },
    // ---- 2.4 tenant isolation ------------------------------------------------------------
    '2.4 another tenant can not read or change this data': async () => {
        const before = await liveRecord(f.ok);
        const spoof = await markPast(f.ok, 'Absent', { token: OTHER });
        assert.strictEqual(spoof.status, 403, 'adminId ≠ token → 403');
        const own = await api('POST', '/mark-past', {
            token: OTHER, headers: { 'Idempotency-Key': key() },
            body: { adminId: OTHER_ADMIN, personType: 'staff', personId: String(f.ok._id), status: 'Absent', date: pastDay, session: currentLabel },
        });
        assert.ok([403, 404].includes(own.status), `other school's person id refused, got ${own.status}`);
        assert.deepStrictEqual((await liveRecord(f.ok)).status, before.status, 'unchanged');
        const read = await api('GET', '/grid', { token: OTHER, query: { adminId: ADMIN, personType: 'staff', month: pastMonth } });
        assert.strictEqual(read.status, 403);
        const ownGrid = await api('GET', '/grid', { token: OTHER, query: { adminId: OTHER_ADMIN, personType: 'staff', month: pastMonth } });
        assert.ok(ownGrid.status === 200 || ownGrid.status === 404, String(ownGrid.status));
        // Its own grid may hold its own auto-created owner row — never one of this school's people.
        const ours = new Set(Object.values(f).filter((row) => row && row.empCode).map((row) => String(row._id)));
        if (ownGrid.status === 200) assert.deepStrictEqual((ownGrid.body.rows || []).filter((r) => ours.has(r._id)).map((r) => r.name), [], 'no rows of the other school');
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: OTHER_ADMIN }), 0, 'nothing written under the other tenant');
    },
    // ---- 2.5 seed + UI + refusal ---------------------------------------------------------
    '2.5 attendance-edit-past seeded next to attendance-mark (API + UI), refused without it': async () => {
        await ensureSeededRoles(ADMIN);
        const res = { body: null, status() { return this; }, json(b) { this.body = b; return this; } };
        await rolesController.GetRoles({ query: { adminId: ADMIN }, adminId: ADMIN }, res);
        const modules = res.body.modules;
        assert.strictEqual(modules.indexOf('attendance-edit-past'), modules.indexOf('attendance-mark') + 1, 'right after attendance-mark');
        const superAdmin = res.body.roles.find((r) => r.isSuperAdmin);
        assert.deepStrictEqual(superAdmin.permissions.find((p) => p.module === 'attendance-edit-past'), { module: 'attendance-edit-past', canView: true, canEdit: true });
        for (const role of res.body.roles.filter((r) => !r.isSuperAdmin && ['Accountant', 'Class Teacher', 'Subject Teacher'].includes(r.name))) {
            assert.strictEqual(role.permissions.find((p) => p.module === 'attendance-edit-past').canEdit, false, `${role.name}: explicit grant only`);
        }
        const ui = fs.readFileSync(path.join(ROOT, 'src/app/settings/roles-permissions/roles-permissions.component.ts'), 'utf8');
        assert.match(ui, /'attendance-mark': 'Mark Attendance \(manual\)', 'attendance-edit-past': 'Edit Past Attendance'/, 'UI label next to attendance-mark');
        assert.match(ui, /'attendance-edit-past': '[a-z-]+'/, 'UI icon');
        const routes = fs.readFileSync(path.join(__dirname, '../modules/routes/attendance/attendance.routes.js'), 'utf8');
        assert.match(routes, /markPastGuard = \[[^\]]*requirePermission\('attendance-edit-past', 'edit'\)/);
        const denied = await markPast(f.ok, 'Present', { token: tokenFor({ id: ADMIN, staffId: String(f.markOnly._id) }) });
        assert.strictEqual(denied.status, 403);
        const allowed = await markPast(f.ok, 'Present', { token: tokenFor({ id: ADMIN, staffId: String(f.granted._id) }) });
        assert.strictEqual(allowed.status, 200, JSON.stringify(allowed.body));
    },
    // ---- 2.6 route table -----------------------------------------------------------------
    '2.6 every Attendance frontend service URL exists in the real route table': async () => {
        const { execFileSync } = require('child_process');
        const out = execFileSync(process.execPath, [path.join(__dirname, 'test-attendance-routes.js')], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
        assert.match(out, /POST\s+\/api\/v2\/attendance\/mark-past/);
        assert.match(out, /(\d+)\/\1 frontend calls match a registered route/);
    },
    // ---- 2.7 v2 isolation ----------------------------------------------------------------
    '2.7 v2 isolation: no write to a legacy collection; legacy device is read-only': async () => {
        const legacy = new Set();
        // Read the legacy models' collection names only — no index build / collection creation
        // (it would race the final dropDatabase and leave empty collections behind).
        mongoose.set('autoIndex', false);
        mongoose.set('autoCreate', false);
        const dirs = ['', 'users', 'devices', 'whatsapp-message'];
        dirs.forEach((dir) => {
            const full = path.join(__dirname, '../modules/models', dir);
            fs.readdirSync(full).filter((name) => name.endsWith('.js')).forEach((name) => {
                try {
                    const model = require(path.join(full, name));
                    if (model && model.collection) legacy.add(model.collection.collectionName);
                } catch (error) { /* not a model file */ }
            });
        });
        assert.ok(legacy.has('devices') || [...legacy].some((n) => /device/.test(n)), 'legacy device collection found');
        const touched = [...writes.keys()].filter((name) => legacy.has(name));
        assert.deepStrictEqual(touched, [], `legacy collections written: ${touched.map((n) => `${n}(${[...writes.get(n)]})`).join(', ')}`);
        // Static: attendance v2 code never writes through the legacy device model.
        // (workers/attendance-sync-worker.js + attendance-reconcile-worker.js are the legacy v1 pipeline, not scanned.)
        const files = ['controllers/attendance', 'services/attendance-v2', 'helpers/attendance', 'routes/attendance']
            .flatMap((dir) => { const full = path.join(__dirname, '../modules', dir); return fs.existsSync(full) ? fs.readdirSync(full).filter((n) => n.endsWith('.js')).map((n) => path.join(full, n)) : []; })
            .concat(['workers/attendance-v2-worker.js', 'queues/attendance-v2-queue.js'].map((n) => path.join(__dirname, '../modules', n)));
        const legacyRequire = /require\(['"]\.\.\/(?:\.\.\/)?models\/(?!attendance\/|staff\/|settings\/|student\/|audit\/|holiday\/|leave\/|academic-setup\/|payroll\/|fees\/|certificates\/|examination\/)([^'"]+)['"]\)/g;
        files.forEach((file) => {
            const source = fs.readFileSync(file, 'utf8');
            let match;
            while ((match = legacyRequire.exec(source))) {
                assert.strictEqual(match[1], 'devices/device', `${path.basename(file)} requires legacy model ${match[1]}`);
                assert.ok(!/DeviceModel\.(create|insertMany|update\w*|delete\w*|findOneAndUpdate|findByIdAndUpdate|bulkWrite|replaceOne)\(/.test(source), `${path.basename(file)} writes the legacy device`);
            }
        });
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
    (mongoose.connection.db ? mongoose.connection.db.dropDatabase() : Promise.resolve()).finally(() => process.exit(1));
});
