'use strict';
// shared-fix2.md, live (real MongoDB, an isolated throwaway database dropped at the end): two
// sessions with different data; switching the header session (the `session` sent with every
// request) changes the Student list and the Attendance grid; an unknown session is a 404; no
// session sent = the session covering today.
//
// Run: node scripts/v2-test-session-switch.js      (needs backend/.env: DB_URL, REDIS_URL)
require('dotenv').config();
global.global_config = require('../config/config.js');
const assert = require('assert');
const mongoose = require('mongoose');

const TEST_DB = process.env.TEST_DB_NAME || 'schoolzen_session_switch_test';
if (!/test/i.test(TEST_DB)) throw new Error('TEST_DB_NAME must contain "test" — this script drops it.');

const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const StudentProfileModel = require('../modules/models/student/student');
const StudentEnrollmentModel = require('../modules/models/student/student-enrollment');
const manageStudents = require('../modules/controllers/student/manage-students.controller');
const overview = require('../modules/controllers/attendance/overview.controller');
const { todayKey } = require('../modules/helpers/attendance/v2-context');

const ADMIN = new mongoose.Types.ObjectId().toHexString();
const CLASS = new mongoose.Types.ObjectId();
const mockRes = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const call = async (handler, query) => {
    const res = mockRes();
    try { await handler({ user: { id: ADMIN }, adminId: ADMIN, query: { adminId: ADMIN, ...query }, body: {}, get: () => null }, res); return { ...res, error: null }; } catch (error) { return { ...res, error }; }
};

const today = todayKey();
const start = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
const CURRENT = `${start}-${start + 1}`;
const NEXT = `${start + 1}-${start + 2}`;

(async () => {
    await mongoose.connect(process.env.DB_URL, { dbName: TEST_DB, serverSelectionTimeoutMS: 20000 });
    let failed = 0;
    const check = async (name, fn) => {
        try { await fn(); console.log(`  ok   ${name}`); } catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
    };
    try {
        await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
        // The stale-flag shape from the live data: the LATER session is flagged active.
        const [cur, next] = await AcademicSessionV2Model.insertMany([
            { adminId: ADMIN, label: CURRENT, startDate: new Date(Date.UTC(start, 3, 1)), endDate: new Date(Date.UTC(start + 1, 2, 31)), status: 'closed' },
            { adminId: ADMIN, label: NEXT, startDate: new Date(Date.UTC(start + 1, 3, 1)), endDate: new Date(Date.UTC(start + 2, 2, 31)), status: 'active' },
        ]);
        const [a, b, c] = await StudentProfileModel.insertMany(['Asha', 'Bala', 'Chetan'].map((name) => ({ adminId: ADMIN, name })));
        await StudentEnrollmentModel.insertMany([
            { adminId: ADMIN, studentId: a._id, sessionId: cur._id, classId: CLASS, class: 8, rollNumber: 1, entryType: 'admission' },
            { adminId: ADMIN, studentId: b._id, sessionId: cur._id, classId: CLASS, class: 8, rollNumber: 2, entryType: 'admission' },
            { adminId: ADMIN, studentId: c._id, sessionId: next._id, classId: CLASS, class: 8, rollNumber: 1, entryType: 'admission' },
        ]);
        const names = (rows) => rows.map((row) => row.name || (row.student && row.student.name)).sort();

        await check('Student list follows the header session (2 rows → switch → 1 row)', async () => {
            const one = await call(manageStudents.ListStudents, { session: CURRENT, limit: 25 });
            assert.ifError(one.error);
            assert.strictEqual(one.body.total, 2);
            const two = await call(manageStudents.ListStudents, { session: NEXT, limit: 25 });
            assert.ifError(two.error);
            assert.strictEqual(two.body.total, 1);
        });
        await check('Attendance grid follows the header session', async () => {
            const month = today.slice(0, 7);
            const one = await call(overview.GetGrid, { personType: 'student', month, session: CURRENT, classId: String(CLASS) });
            assert.ifError(one.error);
            const two = await call(overview.GetGrid, { personType: 'student', month, session: NEXT, classId: String(CLASS) });
            assert.ifError(two.error);
            assert.deepStrictEqual(names(one.body.rows), ['Asha', 'Bala']);
            assert.deepStrictEqual(names(two.body.rows), ['Chetan']);
        });
        await check('no session sent → the session covering today, not the stale active flag', async () => {
            const res = await call(manageStudents.ListStudents, { limit: 25 });
            assert.ifError(res.error);
            assert.strictEqual(res.body.total, 2);
        });
        await check('unknown session → 404 SESSION_NOT_FOUND (no silent fall back)', async () => {
            const res = await call(manageStudents.ListStudents, { session: '1990-1991', limit: 25 });
            assert.strictEqual(res.error && res.error.statusCode, 404);
            assert.strictEqual(res.error.code, 'SESSION_NOT_FOUND');
        });
    } finally {
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : '\nall 4 passed');
    process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
