'use strict';
// Failure / rollback suite (attendance-fix2.md Part C §4). A write is killed part-way through
// its transaction — the activity-log insert that follows the real change throws — and the
// suite proves nothing was half-saved. Plus: a re-delivered punch never duplicates
// (punchHash), and a dead worker / unreachable queue never breaks the grid or a roster write.
// Isolated throwaway database on the configured cluster, dropped at the end.
//
// Run: node scripts/test-attendance-failure.js      (needs backend/.env: DB_URL, REDIS_URL)
require('dotenv').config();
{
    const { DateTime } = require('luxon');
    const zones = [process.env.SCHOOL_TIMEZONE || 'Asia/Kolkata', 'UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'];
    process.env.SCHOOL_TIMEZONE = zones.find((zone) => { const h = DateTime.now().setZone(zone).hour; return h >= 2 && h <= 19; });
}
global.global_config = require('../config/config.js');
const assert = require('assert');
const mongoose = require('mongoose');

const TEST_DB = process.env.TEST_DB_NAME || 'schoolzen_attendance_failure_test';
if (!/test/i.test(TEST_DB)) throw new Error('TEST_DB_NAME must contain "test" — this script drops it.');

const ShiftV2Model = require('../modules/models/attendance/shift');
const RosterV2Model = require('../modules/models/attendance/roster');
const AttendanceRecordV2Model = require('../modules/models/attendance/attendance-record');
const PunchLogV2Model = require('../modules/models/attendance/punch-log');
const StaffV2Model = require('../modules/models/staff/staff');
const DeviceModel = require('../modules/models/devices/device');
const ActivityLogModel = require('../modules/models/audit/activity-log');
const overview = require('../modules/controllers/attendance/overview.controller');
const roster = require('../modules/controllers/attendance/roster.controller');
const shifts = require('../modules/controllers/attendance/shifts.controller');
const { insertPunchRows } = require('../modules/services/attendance-v2/ingest');
const { buildPunchHash } = require('../modules/helpers/attendance/status');
const { todayKey } = require('../modules/helpers/attendance/context');
const { nowWallClock } = require('../modules/helpers/attendance-time');
const heartbeat = require('../modules/workers/heartbeat');
const v2Queue = require('../modules/queues/attendance-v2-queue');

const ADMIN = new mongoose.Types.ObjectId().toHexString();
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (minutes) => { const m = ((minutes % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
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

/** Kill the transaction mid-way: the activity-log insert that follows the real write throws. */
const failLogInsideTransactions = async (fn) => {
    const original = ActivityLogModel.create;
    ActivityLogModel.create = function create(docs, options) {
        if (options && options.session) return Promise.reject(new Error('injected: DB write killed mid-transaction'));
        return original.apply(this, arguments);
    };
    try {
        return await fn();
    } finally {
        ActivityLogModel.create = original;
    }
};

const f = {};
const setup = async () => {
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    const now = nowWallClock();
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const today = todayKey();
    [f.open, f.spare] = await ShiftV2Model.insertMany([
        { adminId: ADMIN, name: 'Open Now', startTime: hhmm(minutes - 30), endTime: hhmm(minutes + 90), earlyInMinutes: 10, graceMinutes: 5 },
        { adminId: ADMIN, name: 'Spare', startTime: '06:00', endTime: '07:00', earlyInMinutes: 5, graceMinutes: 5 },
    ]);
    [f.asha, f.ravi, f.dev] = await StaffV2Model.insertMany(['Asha', 'Ravi', 'Dev'].map((name, i) => ({ adminId: ADMIN, name, empCode: `F-${i}`, status: 'active' })));
    await RosterV2Model.create({ adminId: ADMIN, staffId: String(f.asha._id), year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), days: { [today]: String(f.open._id) }, shiftIds: [String(f.open._id)] });
};

const tests = {
    'mark + activity log: killed mid-transaction → no record, no log; retry succeeds': async () => {
        const body = { adminId: ADMIN, personType: 'staff', personId: String(f.asha._id), status: 'Present' };
        const res = await failLogInsideTransactions(() => call(overview.MarkAttendance, reqOf({ body })));
        assert.ok(res.error && /injected/.test(res.error.message), 'the mark failed');
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personId: String(f.asha._id) }), 0, 'record rolled back');
        assert.strictEqual(await ActivityLogModel.countDocuments({ adminId: ADMIN, action: 'attendance.mark' }), 0, 'no log entry');
        const ok = await call(overview.MarkAttendance, reqOf({ body }));
        assert.ifError(ok.error);
        assert.strictEqual(await AttendanceRecordV2Model.countDocuments({ adminId: ADMIN, personId: String(f.asha._id), deletedAt: null }), 1);
        assert.strictEqual(await ActivityLogModel.countDocuments({ adminId: ADMIN, action: 'attendance.mark' }), 1);
    },
    'roster bulk write (2 people, 2 months) killed mid-transaction → no cell, no shiftIds, no log': async () => {
        const before = await RosterV2Model.find({ adminId: ADMIN }).lean();
        const today = todayKey();
        const toDate = new Date(Date.parse(`${today}T00:00:00Z`) + 40 * 86400000).toISOString().slice(0, 10);
        const body = { adminId: ADMIN, staffIds: [String(f.ravi._id), String(f.dev._id)], shiftId: String(f.spare._id), fromDate: today, toDate, weekdays: [0, 1, 2, 3, 4, 5, 6] };
        const res = await failLogInsideTransactions(() => call(roster.AssignStaffRoster, reqOf({ body })));
        assert.ok(res.error && /injected/.test(res.error.message));
        const after = await RosterV2Model.find({ adminId: ADMIN }).lean();
        assert.strictEqual(after.length, before.length, 'no roster doc was upserted');
        assert.deepStrictEqual(after.map((doc) => doc.days), before.map((doc) => doc.days), 'existing cells untouched');
        assert.strictEqual(await ActivityLogModel.countDocuments({ adminId: ADMIN, action: 'attendance.roster.assign' }), 0);
        const ok = await call(roster.AssignStaffRoster, reqOf({ body }));
        assert.ifError(ok.error);
        assert.strictEqual(await RosterV2Model.countDocuments({ adminId: ADMIN, staffId: { $in: body.staffIds } }), 4, '2 people x 2 months');
    },
    'roster delete killed mid-transaction → the cells are all still there': async () => {
        const staffIds = [String(f.ravi._id), String(f.dev._id)];
        const snapshot = await RosterV2Model.find({ adminId: ADMIN, staffId: { $in: staffIds } }).sort({ _id: 1 }).lean();
        const res = await failLogInsideTransactions(() => call(roster.ClearStaffRoster, reqOf({ body: { adminId: ADMIN, staffIds, month: todayKey().slice(0, 7), confirmed: true } })));
        assert.ok(res.error);
        const after = await RosterV2Model.find({ adminId: ADMIN, staffId: { $in: staffIds } }).sort({ _id: 1 }).lean();
        assert.deepStrictEqual(after.map((doc) => [doc.days, doc.shiftIds]), snapshot.map((doc) => [doc.days, doc.shiftIds]));
    },
    'shift delete killed mid-transaction → the shift still exists, no log': async () => {
        const temp = await ShiftV2Model.create({ adminId: ADMIN, name: 'Temp', startTime: '05:00', endTime: '05:30', earlyInMinutes: 0, graceMinutes: 0 });
        const res = await failLogInsideTransactions(() => call(shifts.DeleteShift, reqOf({ query: { adminId: ADMIN }, params: { id: String(temp._id) } })));
        assert.ok(res.error && /injected/.test(res.error.message));
        assert.strictEqual(await ShiftV2Model.countDocuments({ _id: temp._id }), 1, 'delete rolled back');
        assert.strictEqual(await ActivityLogModel.countDocuments({ adminId: ADMIN, action: 'attendance.shift.delete' }), 0);
        const ok = await call(shifts.DeleteShift, reqOf({ query: { adminId: ADMIN }, params: { id: String(temp._id) } }));
        assert.ifError(ok.error);
        assert.strictEqual(await ShiftV2Model.countDocuments({ _id: temp._id }), 0);
    },
    'queue retry: the same punches ingested twice are stored once (punchHash)': async () => {
        const today = todayKey();
        const times = [0, 1, 2].map((i) => new Date(nowWallClock().getTime() - (10 + i) * 60000));
        const rows = times.map((punchTime) => ({
            adminId: ADMIN, personType: 'staff', personId: String(f.dev._id), punchTime, dateKey: today, terminalSn: 'T-F',
            punchHash: buildPunchHash(ADMIN, String(f.dev._id), punchTime),
        }));
        const first = await insertPunchRows(rows);
        const retry = await insertPunchRows(rows.map((row) => ({ ...row })));
        assert.strictEqual(first.length, 3);
        assert.strictEqual(retry.length, 0, 'the retried job inserts nothing new');
        assert.strictEqual(await PunchLogV2Model.countDocuments({ adminId: ADMIN }), 3);
    },
    'worker down / queue unreachable: grid still 200, Sync says SYNC_WORKER_DOWN, roster write still saves': async () => {
        const originalBeat = heartbeat.readHeartbeat;
        const originalAdd = v2Queue.addReconcileJob;
        heartbeat.readHeartbeat = async () => ({ alive: false, lastBeatAgoMs: null });
        v2Queue.addReconcileJob = async () => { throw new Error('injected: Redis unreachable'); };
        try {
            const grid = await call(overview.GetGrid, reqOf({ query: { adminId: ADMIN, personType: 'staff', month: todayKey().slice(0, 7), search: '' } }));
            assert.ifError(grid.error);
            assert.strictEqual(grid.code, 200);
            assert.strictEqual(grid.body.rows.length, 3);
            await DeviceModel.create({ terminalSn: `FAIL-${ADMIN.slice(-6)}`, assignedSchoolId: ADMIN, status: 'active', active: true });
            const sync = await call(overview.SyncNow, reqOf({ body: { adminId: ADMIN, confirmed: true } }));
            assert.strictEqual(sync.error && sync.error.code, 'SYNC_WORKER_DOWN');
            const assign = await call(roster.AssignStaffRoster, reqOf({ body: { adminId: ADMIN, staffIds: [String(f.dev._id)], shiftId: String(f.open._id), fromDate: todayKey(), toDate: todayKey(), weekdays: [0, 1, 2, 3, 4, 5, 6] } }));
            assert.ifError(assign.error);
            const doc = await RosterV2Model.findOne({ adminId: ADMIN, staffId: String(f.dev._id), month: Number(todayKey().slice(5, 7)) }).lean();
            assert.strictEqual(doc.days[todayKey()], String(f.open._id), 'saved even though the reconcile enqueue failed');
        } finally {
            heartbeat.readHeartbeat = originalBeat;
            v2Queue.addReconcileJob = originalAdd;
        }
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
