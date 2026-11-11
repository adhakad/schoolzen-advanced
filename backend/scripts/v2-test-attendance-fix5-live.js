'use strict';
// attendance-fix5.md §3 — Live DB tests against the app's REAL database (DB_URL as configured),
// scoped to a brand-new throwaway school id. Every row with that adminId (plus its Redis keys
// and queued jobs) is deleted at the end and the cleanup is verified (§3.5). Calls go through
// the real /api/v2/attendance router over HTTP.
//   3.1 roster for a whole month incl. past days; re-assign whole month; re-assign with a date
//       range; week-off toggle
//   3.2 past day with roster and no record reads Absent; edit, then read back
//   3.3 a device punch is added → device wins, edit refused
//   3.4 Bulk Assign / Bulk Edit / Bulk Delete write only the intended rows
//
// Run: node scripts/v2-test-attendance-fix5-live.js   (needs backend/.env: DB_URL, REDIS_URL, ADMIN_ACCESS_SECRET)
require('dotenv').config();
global.global_config = require('../config/config.js');
require('express-async-errors');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const ShiftV2Model = require('../modules/models/attendance/shift');
const RosterV2Model = require('../modules/models/attendance/roster');
const AttendanceRecordV2Model = require('../modules/models/attendance/attendance-record');
const PunchLogV2Model = require('../modules/models/attendance/punch-log');
const StaffV2Model = require('../modules/models/staff/staff');
const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const errorHandler = require('../modules/middleware/errorHandler');
const { reconcileDay } = require('../modules/services/attendance-v2/v2-reconcile');
const { todayKey } = require('../modules/helpers/attendance/v2-context');
const { buildPunchHash } = require('../modules/helpers/attendance/status');
const { parseDateKey } = require('../modules/helpers/date-only');

const ADMIN = new mongoose.Types.ObjectId().toHexString();
const OWNER = jwt.sign({ payload: { id: ADMIN } }, process.env.ADMIN_ACCESS_SECRET, { expiresIn: '1h' });
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const lastDayOf = (month) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const dowOf = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();

const today = todayKey();
const month = today.slice(0, 7);
const monthKeys = Array.from({ length: Number(lastDayOf(month).slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
const pastDay = addDays(today, -1);
const sy = (() => { const y = Number(pastDay.slice(0, 4)); return Number(pastDay.slice(5, 7)) >= 4 ? y : y - 1; })();
const session = `${sy}-${sy + 1}`;

let base;
let server;
const f = {};

const api = async (method, urlPath, { body, query, headers = {} } = {}) => {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const res = await fetch(`${base}${urlPath}${qs}`, {
        method, headers: { 'Content-Type': 'application/json', authorization: `Bearer ${OWNER}`, ...headers }, body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { json = text; }
    return { status: res.status, body: json };
};
const key = () => `fix5-live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const ids = (rows) => rows.map((row) => String(row._id));
const assign = (rows, shift, extra = {}) => api('POST', '/roster/staff/assign', {
    body: { adminId: ADMIN, staffIds: ids(rows), shiftId: String(shift._id), fromDate: `${month}-01`, toDate: lastDayOf(month), weekdays: ALL_DAYS, ...extra },
});
const daysOf = async (staff, m = month) => {
    const { year, month: mm } = parseDateKey(`${m}-01`);
    const doc = await RosterV2Model.findOne({ adminId: ADMIN, staffId: String(staff._id), year, month: mm }).lean();
    return doc ? doc.days || {} : null;
};
const gridCell = async (staff, dateKey) => {
    const grid = await api('GET', '/grid', { query: { adminId: ADMIN, personType: 'staff', month: dateKey.slice(0, 7), session } });
    assert.strictEqual(grid.status, 200, JSON.stringify(grid.body));
    return grid.body.rows.find((r) => r._id === String(staff._id)).cells[dateKey];
};
const markPast = (staff, status) => api('POST', '/mark-past', {
    headers: { 'Idempotency-Key': key() },
    body: { adminId: ADMIN, personType: 'staff', personId: String(staff._id), status, date: pastDay, session },
});
const ok200 = (res) => assert.strictEqual(res.status, 200, JSON.stringify(res.body));

const setup = async () => {
    await AcademicSessionV2Model.create({ adminId: ADMIN, label: session, startDate: new Date(Date.UTC(sy, 3, 1)), endDate: new Date(Date.UTC(sy + 1, 2, 31)), status: 'active' });
    [f.a, f.b] = await ShiftV2Model.insertMany([
        { adminId: ADMIN, name: 'Fix5 Morning', startTime: '08:00', endTime: '14:00', earlyInMinutes: 10, graceMinutes: 5 },
        { adminId: ADMIN, name: 'Fix5 Evening', startTime: '14:00', endTime: '20:00', earlyInMinutes: 10, graceMinutes: 5 },
    ]);
    [f.s1, f.s2, f.s3, f.s4, f.p1, f.p2] = await StaffV2Model.insertMany(['Live One', 'Live Two', 'Live Three', 'Live Four', 'Live Past', 'Live Device']
        .map((name, i) => ({ adminId: ADMIN, name, empCode: `F5L-${i}`, status: 'active' })));
    // The past-day people: rostered for the past day's month (written directly when that month
    // is already locked for Bulk Assign — i.e. today is the 1st).
    if (pastDay.slice(0, 7) === month) ok200(await assign([f.p1, f.p2], f.a));
    else {
        const { year, month: mm } = parseDateKey(pastDay);
        await RosterV2Model.insertMany([f.p1, f.p2].map((s) => ({ adminId: ADMIN, staffId: String(s._id), year, month: mm, days: { [pastDay]: String(f.a._id) }, shiftIds: [String(f.a._id)] })));
    }
};

const tests = {
    '3.1 roster for the WHOLE month, past days included': async () => {
        ok200(await assign([f.s1], f.a));
        const days = await daysOf(f.s1);
        assert.deepStrictEqual(Object.keys(days).sort(), monthKeys, 'day 1 → last day');
        assert.ok(monthKeys.filter((k) => k < today).every((k) => days[k] === String(f.a._id)), 'past days written');
    },
    '3.1 re-assign changes the whole month': async () => {
        ok200(await assign([f.s1], f.b));
        const days = await daysOf(f.s1);
        assert.ok(monthKeys.every((k) => days[k] === String(f.b._id)), 'every day now Evening');
    },
    '3.1 re-assign with a date range changes only that range': async () => {
        const from = monthKeys[9];
        const to = monthKeys[14];
        ok200(await assign([f.s1], f.a, { fromDate: from, toDate: to }));
        const days = await daysOf(f.s1);
        monthKeys.forEach((k) => assert.strictEqual(days[k], k >= from && k <= to ? String(f.a._id) : String(f.b._id), k));
    },
    '3.1 week-off toggle: unticked weekdays become WO, re-ticking restores the shift': async () => {
        ok200(await assign([f.s1], f.a, { weekdays: [1, 2, 3, 4, 5] }));
        let days = await daysOf(f.s1);
        monthKeys.forEach((k) => assert.strictEqual(days[k], [0, 6].includes(dowOf(k)) ? 'WO' : String(f.a._id), k));
        ok200(await assign([f.s1], f.a));
        days = await daysOf(f.s1);
        assert.ok(monthKeys.every((k) => days[k] === String(f.a._id)), 'Sat/Sun back to the shift');
    },
    '3.2 past day with roster and no record reads Absent; edit, then read back': async () => {
        const before = await gridCell(f.p1, pastDay);
        assert.strictEqual(before.s, 'A');
        assert.strictEqual(before.n, undefined, 'rostered, not the no-roster state');
        ok200(await markPast(f.p1, 'Late'));
        const after = await gridCell(f.p1, pastDay);
        assert.deepStrictEqual({ s: after.s, t: after.t, src: after.src }, { s: 'L', t: null, src: 'manual' });
        const record = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(f.p1._id), dateKey: pastDay, deletedAt: null }).lean();
        assert.strictEqual(record.source, 'manual');
    },
    '3.3 device punch added → device wins, edit refused': async () => {
        ok200(await markPast(f.p2, 'Present'));
        const punchTime = new Date(`${pastDay}T08:02:00Z`);
        await PunchLogV2Model.create({ adminId: ADMIN, personType: 'staff', personId: String(f.p2._id), punchTime, dateKey: pastDay, terminalSn: 'FIX5-LIVE', punchHash: buildPunchHash(ADMIN, String(f.p2._id), punchTime) });
        await reconcileDay(ADMIN, pastDay);
        const cell = await gridCell(f.p2, pastDay);
        assert.strictEqual(cell.src, 'device', 'the punch replaced the manual mark');
        assert.ok(['P', 'L', 'HD'].includes(cell.s), cell.s);
        const refused = await markPast(f.p2, 'Absent');
        assert.strictEqual(refused.status, 403);
        assert.strictEqual(refused.body.error.code, 'MARK_PAST_DEVICE');
        const record = await AttendanceRecordV2Model.findOne({ adminId: ADMIN, personId: String(f.p2._id), dateKey: pastDay, deletedAt: null }).lean();
        assert.strictEqual(record.source, 'device');
    },
    '3.4 Bulk Assign / Bulk Edit / Bulk Delete write only the intended rows': async () => {
        ok200(await assign([f.s2, f.s3], f.a));
        assert.strictEqual(await daysOf(f.s4), null, 'Bulk Assign: unselected row untouched');
        const s1Before = await daysOf(f.s1);
        // Bulk Edit (re-assign) only s2.
        ok200(await assign([f.s2], f.b));
        const [s2, s3] = [await daysOf(f.s2), await daysOf(f.s3)];
        assert.ok(monthKeys.every((k) => s2[k] === String(f.b._id)), 'edited row changed');
        assert.ok(monthKeys.every((k) => s3[k] === String(f.a._id)), 'other selected-before row unchanged');
        assert.deepStrictEqual(await daysOf(f.s1), s1Before, 'unselected row unchanged');
        // Bulk Delete only s3: today onward cleared, past days kept; nobody else touched.
        const del = await api('POST', '/roster/staff/clear', { body: { adminId: ADMIN, staffIds: ids([f.s3]), month, confirmed: true } });
        ok200(del);
        const s3After = await daysOf(f.s3);
        monthKeys.forEach((k) => assert.strictEqual(s3After[k], k < today ? String(f.a._id) : undefined, k));
        assert.deepStrictEqual(await daysOf(f.s2), s2, 'Bulk Delete: other rows untouched');
        assert.deepStrictEqual(await daysOf(f.s1), s1Before);
        assert.strictEqual(await daysOf(f.s4), null);
    },
};

/** §3.5 — delete every row this run's throwaway school owns, then prove none is left. */
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
    return { removed, left };
};

(async () => {
    await mongoose.connect(process.env.DB_URL, { serverSelectionTimeoutMS: 20000 });
    console.log(`  live: database "${mongoose.connection.name}", throwaway adminId ${ADMIN}`);
    const app = express();
    app.use(express.json());
    app.use('/api/v2/attendance', require('../modules/routes/attendance/attendance.routes'));
    app.use(errorHandler);
    server = http.createServer(app).listen(0);
    base = `http://127.0.0.1:${server.address().port}/api/v2/attendance`;
    let failed = 0;
    const total = Object.keys(tests).length + 1;
    try {
        await setup();
        for (const [name, fn] of Object.entries(tests)) {
            const started = Date.now();
            try { await fn(); console.log(`  ok   ${name} (${Date.now() - started} ms)`); } catch (error) { failed += 1; console.log(`  FAIL ${name}\n       ${error.message}`); }
        }
    } finally {
        server.close();
        try { await cleanupLive(); console.log('  ok   3.5 every test record removed (verified 0 left)'); } catch (error) { failed += 1; console.log(`  FAIL 3.5 cleanup\n       ${error.message}`); }
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
