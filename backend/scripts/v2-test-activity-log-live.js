'use strict';
// Live check that real actions are written to the activity log. App's REAL database (DB_URL),
// scoped to a brand-new throwaway school id: real requests through the REAL v2 routers
// (auth, scope, validation, permissions, idempotency, error handler), then each entry is read
// back RAW from the `v2-activity-logs` collection — the one you see in Compass — not through the
// model. Every row of the throwaway school is deleted at the end and the cleanup is verified.
// Run: node scripts/v2-test-activity-log-live.js   (needs backend/.env: DB_URL, REDIS_URL, ADMIN_ACCESS_SECRET)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
global.global_config = require('../config/config.js');
require('express-async-errors');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const ActivityLogV2Model = require('../modules/models/audit/activity-log');
const ShiftV2Model = require('../modules/models/attendance/shift');
const RosterV2Model = require('../modules/models/attendance/roster');
const StaffV2Model = require('../modules/models/staff/staff');
const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const StudentProfileModel = require('../modules/models/student/student');
const errorHandler = require('../modules/middleware/errorHandler');
const { todayKey } = require('../modules/helpers/attendance/v2-context');
const { parseDateKey } = require('../modules/helpers/date-only');

const ADMIN = new mongoose.Types.ObjectId().toHexString();
const OWNER = jwt.sign({ payload: { id: ADMIN } }, process.env.ADMIN_ACCESS_SECRET, { expiresIn: '1h' });
const addDays = (k, n) => new Date(Date.parse(`${k}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const today = todayKey();
const month = today.slice(0, 7);
const pastDay = addDays(today, -1);
const sy = (() => { const y = Number(pastDay.slice(0, 4)); return Number(pastDay.slice(5, 7)) >= 4 ? y : y - 1; })();
const session = `${sy}-${sy + 1}`;

let base;
let server;
const f = {};
let seq = 0;
const api = async (method, urlPath, { body, query } = {}) => {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const res = await fetch(`${base}${urlPath}${qs}`, {
        method,
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${OWNER}`, 'Idempotency-Key': `log-live-${Date.now()}-${seq += 1}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { json = text; }
    return { status: res.status, body: json };
};
const ok = (res) => assert.ok(res.status >= 200 && res.status < 300, `${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);

// RAW read of the collection the app writes to — what an admin sees in the database.
const rawLogs = (filter) => mongoose.connection.db.collection('v2-activity-logs').find({ adminId: ADMIN, ...filter }).sort({ timestamp: 1 }).toArray();
const expectLog = async (action, extra = {}) => {
    const rows = await rawLogs({ action, ...extra });
    assert.strictEqual(rows.length, 1, `expected 1 '${action}' entry in v2-activity-logs, got ${rows.length}`);
    assert.strictEqual(rows[0].actorId, ADMIN, 'actorId');
    // shared-fix5: every entry stores WHO did it, by name (owner's v2 Staff row for an admin login).
    assert.ok(typeof rows[0].actorName === 'string' && rows[0].actorName.trim(), `actorName empty on '${action}'`);
    assert.ok(rows[0].timestamp instanceof Date, 'timestamp');
    return rows[0];
};

const setup = async () => {
    await AcademicSessionV2Model.create({ adminId: ADMIN, label: session, startDate: new Date(Date.UTC(sy, 3, 1)), endDate: new Date(Date.UTC(sy + 1, 2, 31)), status: 'active' });
    f.shift = await ShiftV2Model.create({ adminId: ADMIN, name: 'Log Morning', startTime: '08:00', endTime: '14:00', earlyInMinutes: 10, graceMinutes: 5 });
    [f.past, f.roster] = await StaffV2Model.insertMany([
        { adminId: ADMIN, name: 'Log Past', empCode: 'LOG-2', status: 'active' },
        { adminId: ADMIN, name: 'Log Roster', empCode: 'LOG-3', status: 'active' },
    ]);
    const { year, month: mm } = parseDateKey(pastDay);
    await RosterV2Model.create({ adminId: ADMIN, staffId: String(f.past._id), year, month: mm, days: { [pastDay]: String(f.shift._id) }, shiftIds: [String(f.shift._id)] });
    // Raw insert: the Student create API needs a full admission form; the DELETE is the real action.
    const { insertedId } = await mongoose.connection.db.collection(StudentProfileModel.collection.collectionName)
        .insertOne({ adminId: ADMIN, name: 'Log Student', createdAt: new Date(), updatedAt: new Date() });
    f.studentId = String(insertedId);
};

const tests = {
    'logger writes to v2-activity-logs': () => {
        assert.strictEqual(ActivityLogV2Model.collection.collectionName, 'v2-activity-logs');
    },
    // --- Attendance ---
    'attendance: past edit -> attendance.mark-past': async () => {
        ok(await api('POST', '/attendance/mark-past', { body: { adminId: ADMIN, personType: 'staff', personId: String(f.past._id), status: 'Present', date: pastDay, session } }));
        const row = await expectLog('attendance.mark-past');
        assert.strictEqual(row.module, 'attendance');
    },
    'attendance: roster Bulk Assign / Bulk Edit / Bulk Delete -> roster.assign x2, roster.clear': async () => {
        ok(await api('POST', '/attendance/roster/staff/assign', { body: { adminId: ADMIN, staffIds: [String(f.roster._id)], shiftId: String(f.shift._id), month, weekdays: [0, 1, 2, 3, 4, 5, 6] } }));
        ok(await api('POST', '/attendance/roster/staff/assign', { body: { adminId: ADMIN, staffIds: [String(f.roster._id)], shiftId: String(f.shift._id), month, weekdays: [1, 2, 3, 4, 5] } }));
        assert.strictEqual((await rawLogs({ action: 'attendance.roster.assign' })).length, 2);
        ok(await api('POST', '/attendance/roster/staff/clear', { body: { adminId: ADMIN, staffIds: [String(f.roster._id)], month, confirmed: true } }));
        await expectLog('attendance.roster.clear');
    },
    'attendance: Create Shift -> attendance.shift.create (was missing)': async () => {
        ok(await api('POST', '/attendance/shifts', { body: { adminId: ADMIN, name: 'Log Evening', startTime: '14:00', endTime: '20:00', earlyInMinutes: 10, graceMinutes: 5 } }));
        await expectLog('attendance.shift.create');
    },
    // --- Staff ---
    'staff: create, name-only edit, status change -> staff.create / staff.update / staff.status (were missing)': async () => {
        const created = await api('POST', '/staff/members', { body: { adminId: ADMIN, name: 'Log Edit', empCode: 'LOG-1' } });
        ok(created);
        const id = created.body.staff._id;
        await expectLog('staff.create', { targetId: String(id) });
        ok(await api('PUT', `/staff/members/${id}`, { body: { adminId: ADMIN, name: 'Log Edited', empCode: 'LOG-1' } }));
        const update = await expectLog('staff.update', { targetId: String(id) });
        assert.deepStrictEqual(update.changes, { before: { name: 'Log Edit' }, after: { name: 'Log Edited' } });
        ok(await api('PATCH', `/staff/members/${id}/status`, { body: { adminId: ADMIN, status: 'inactive' } }));
        const status = await expectLog('staff.status', { targetId: String(id) });
        assert.deepStrictEqual(status.changes, { before: { status: 'active' }, after: { status: 'inactive' } });
    },
    'staff: Create Department -> staff.department.create (was missing)': async () => {
        ok(await api('POST', '/staff/departments', { body: { adminId: ADMIN, name: 'Log Dept' } }));
        await expectLog('staff.department.create');
    },
    // --- Student ---
    'student: delete -> student.delete (was missing)': async () => {
        ok(await api('DELETE', `/student/students/${f.studentId}`, { query: { adminId: ADMIN, confirmed: 'true', session } }));
        await expectLog('student.delete', { targetId: f.studentId });
    },
    // --- Academic Setup ---
    'academic setup: subject create + edit -> academic-setup.subject.create / .update (were missing)': async () => {
        ok(await api('POST', '/academic-setup/subjects', { body: { adminId: ADMIN, name: 'Log Science' } }));
        const created = await expectLog('academic-setup.subject.create');
        ok(await api('PUT', `/academic-setup/subjects/${created.targetId}`, { body: { adminId: ADMIN, name: 'Log Physics', type: 'core', status: 'active' } }));
        const update = await expectLog('academic-setup.subject.update');
        assert.strictEqual(update.changes.after.name, 'Log Physics');
    },
    // --- Settings ---
    'settings: create + delete session -> settings.session.create / .delete (were missing)': async () => {
        const created = await api('POST', '/settings/academic-sessions', { body: { adminId: ADMIN, startDate: `${sy + 1}-04-01`, endDate: `${sy + 2}-03-31`, copyForward: [] } });
        ok(created);
        const id = created.body.session._id;
        await expectLog('settings.session.create', { targetId: String(id) });
        ok(await api('DELETE', `/settings/academic-sessions/${id}`, { query: { adminId: ADMIN, confirm: 'DELETE' } }));
        await expectLog('settings.session.delete', { targetId: String(id) });
    },
    // --- Roles & Permissions ---
    'roles: create, edit, delete a role -> settings.role.* (were missing)': async () => {
        const created = await api('POST', '/settings/roles', { body: { adminId: ADMIN, name: 'Log Clerk', permissions: [{ module: 'student', canView: true, canEdit: false }] } });
        ok(created);
        const id = created.body.role._id;
        await expectLog('settings.role.create', { targetId: String(id) });
        ok(await api('PUT', `/settings/roles/${id}`, { body: { adminId: ADMIN, name: 'Log Clerk 2' } }));
        const update = await expectLog('settings.role.update', { targetId: String(id) });
        assert.deepStrictEqual(update.changes, { before: { name: 'Log Clerk' }, after: { name: 'Log Clerk 2' } });
        ok(await api('DELETE', `/settings/roles/${id}`, { query: { adminId: ADMIN } }));
        await expectLog('settings.role.delete', { targetId: String(id) });
    },
};

const cleanupLive = async () => {
    const db = mongoose.connection.db;
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
    let removed = 0;
    for (const name of names) removed += (await db.collection(name).deleteMany({ adminId: ADMIN })).deletedCount;
    let left = 0;
    for (const name of names) left += await db.collection(name).countDocuments({ adminId: ADMIN });
    try { await require('../modules/services/cache/cache.service').delPattern(`${ADMIN}:*`); } catch (error) { /* cache optional */ }
    try {
        const q = require('../modules/queues/attendance-v2-queue');
        for (const day of [today, pastDay]) {
            const job = await q.attendanceV2Queue.getJob(q.reconcileJobId(ADMIN, day));
            if (job) await job.remove().catch(() => undefined);
        }
    } catch (error) { /* queue optional */ }
    console.log(`  live cleanup: ${removed} rows removed across ${names.length} collections, ${left} left`);
    if (left) throw new Error(`live cleanup left ${left} rows for ${ADMIN}`);
};

(async () => {
    await mongoose.connect(process.env.DB_URL, { serverSelectionTimeoutMS: 20000 });
    console.log(`  live: database "${mongoose.connection.name}", throwaway adminId ${ADMIN}`);
    const app = express();
    app.use(express.json());
    require('../routes')(app);
    app.use(errorHandler);
    server = http.createServer(app).listen(0);
    base = `http://127.0.0.1:${server.address().port}/api/v2`;
    let failed = 0;
    const total = Object.keys(tests).length + 1;
    try {
        await setup();
        for (const [name, fn] of Object.entries(tests)) {
            try { await fn(); console.log(`  ok   ${name}`); } catch (error) { failed += 1; console.log(`  FAIL ${name}\n       ${error.message}`); }
        }
        const all = await rawLogs({});
        console.log(`  read back from v2-activity-logs: ${all.length} entries -> ${[...new Set(all.map((r) => r.action))].join(', ')}`);
    } finally {
        server.close();
        try { await cleanupLive(); console.log('  ok   every test record removed (verified 0 left)'); } catch (error) { failed += 1; console.log(`  FAIL cleanup\n       ${error.message}`); }
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${total} passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('setup failed:', error.message);
    if (server) server.close();
    // NEVER drop — this is the app's own database; delete this run's rows only.
    cleanupLive().catch((e) => console.error('cleanup failed:', e.message)).finally(() => process.exit(1));
});
