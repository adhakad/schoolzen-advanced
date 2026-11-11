'use strict';
// shared-fix5 live checks on the app's REAL database (DB_URL) through the REAL v2 routers:
//  A. Rule 23.7 staff delete guard reads v2 data only (v2-payroll-runs, v2-staff-salary-
//     assignments, the card on v2-staffs) — throwaway school, cleaned up and verified.
//  B. v2 school profile: "not set yet" letterhead + admission-form-fields return cleanly; once a
//     v2-school-profiles row exists the letterhead uses it — throwaway school.
//  C. Read-only smoke: one list endpoint per v2 module on the first real v2 school (no writes).
// Run: node scripts/v2-test-shared-fix5-live.js   (needs backend/.env: DB_URL, REDIS_URL, ADMIN_ACCESS_SECRET)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
global.global_config = require('../config/config.js');
require('express-async-errors');
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const StaffV2Model = require('../modules/models/staff/staff');
const PayrollRunV2Model = require('../modules/models/payroll/payroll-run');
const StaffSalaryAssignmentV2Model = require('../modules/models/payroll/staff-salary-assignment');
const SchoolProfileV2Model = require('../modules/models/settings/school-profile');
const errorHandler = require('../modules/middleware/errorHandler');
const { buildLetterheadDocument } = require('../modules/services/pdf/v2-letterhead.service');

const ADMIN = new mongoose.Types.ObjectId().toHexString();
const tokenFor = (id) => jwt.sign({ payload: { id } }, process.env.ADMIN_ACCESS_SECRET, { expiresIn: '1h' });
let base;
let server;
let seq = 0;
const api = async (method, urlPath, { adminId = ADMIN, query } = {}) => {
    const qs = `?${new URLSearchParams({ adminId, ...(query || {}) })}`;
    const res = await fetch(`${base}${urlPath}${qs}`, {
        method,
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${tokenFor(adminId)}`, 'Idempotency-Key': `fix5-live-${Date.now()}-${seq += 1}` },
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch (error) { body = text; }
    return { status: res.status, body };
};

const f = {};
const setup = async () => {
    [f.paid, f.carded, f.free, f.assigned] = await StaffV2Model.insertMany([
        { adminId: ADMIN, name: 'Fix5 Paid', status: 'active' },
        { adminId: ADMIN, name: 'Fix5 Card', status: 'active', cardNumber: '990001' },
        { adminId: ADMIN, name: 'Fix5 Free', status: 'active' },
        { adminId: ADMIN, name: 'Fix5 Assigned', status: 'active' },
    ]);
    await PayrollRunV2Model.create({ adminId: ADMIN, staffId: String(f.paid._id), year: 2026, month: 4, salaryGroupId: 'g', mode: 'monthly' });
    await StaffSalaryAssignmentV2Model.create({ adminId: ADMIN, staffId: String(f.assigned._id), salaryGroupId: 'g', effectiveFrom: '2026-04' });
};

const blockedWith = (res, code) => {
    assert.strictEqual(res.status, 409, `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    assert.ok(JSON.stringify(res.body).includes(code), `expected ${code}: ${JSON.stringify(res.body).slice(0, 200)}`);
};

const tests = {
    'A. staff with a v2 payroll run is blocked (STAFF_IN_USE_PAYROLL)': async () => blockedWith(await api('DELETE', `/staff/members/${f.paid._id}`), 'STAFF_IN_USE_PAYROLL'),
    'A. staff with a v2 salary assignment is blocked (STAFF_IN_USE_PAYROLL)': async () => blockedWith(await api('DELETE', `/staff/members/${f.assigned._id}`), 'STAFF_IN_USE_PAYROLL'),
    'A. staff with a card on the v2 row is blocked (STAFF_IN_USE_BIOMETRIC)': async () => blockedWith(await api('DELETE', `/staff/members/${f.carded._id}`), 'STAFF_IN_USE_BIOMETRIC'),
    'A. staff with no v2 dependents is terminated': async () => {
        const res = await api('DELETE', `/staff/members/${f.free._id}`);
        assert.strictEqual(res.status, 200, `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
        assert.strictEqual((await StaffV2Model.findById(f.free._id).lean()).status, 'terminated');
    },
    'B. letterhead with no v2 school profile: clean "SCHOOL" header, no crash': async () => {
        const doc = await buildLetterheadDocument({ adminId: ADMIN, title: 'T', fields: [{ label: 'a', value: null }] });
        assert.strictEqual(doc.header.schoolName, 'SCHOOL');
        assert.deepStrictEqual(doc.header.metaLines, []);
        assert.strictEqual(doc.header.logoUrl, null);
    },
    'B. admission-form-fields with no v2 school profile: 200, schoolState null': async () => {
        const res = await api('GET', '/settings/admission-form-fields');
        assert.strictEqual(res.status, 200, `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
        assert.strictEqual(res.body.schoolState, null);
        assert.ok(Array.isArray(res.body.fields) && res.body.fields.length > 0);
    },
    'B. letterhead reads v2-school-profiles once set': async () => {
        await SchoolProfileV2Model.create({ adminId: ADMIN, schoolName: 'Fix5 Public School', board: 'cbse', affiliationNumber: 'AFF-1', city: 'Indore', state: 'Madhya Pradesh' });
        const doc = await buildLetterheadDocument({ adminId: ADMIN, title: 'T', fields: [] });
        assert.strictEqual(doc.header.schoolName, 'FIX5 PUBLIC SCHOOL');
        assert.strictEqual(doc.header.affiliationNumber, 'AFF-1');
    },
};

const SMOKE = [
    '/academic-setup/classes', '/academic-setup/subjects', '/academic-setup/subject-groups',
    '/student/students', '/staff/members', '/staff/departments', '/attendance/shifts',
    '/leave/types', '/holiday/holidays', '/payroll/salary-groups', '/fees/structures',
    '/examination/admit-card-structures', '/certificates/tc-structure', '/approvals/requests',
    '/settings/academic-sessions', '/settings/roles', '/settings/admission-form-fields', '/dashboard',
];

const cleanupLive = async () => {
    const db = mongoose.connection.db;
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
    for (const name of names) await db.collection(name).deleteMany({ adminId: ADMIN });
    let left = 0;
    for (const name of names) left += await db.collection(name).countDocuments({ adminId: ADMIN });
    try { await require('../modules/services/cache/cache.service').delPattern(`${ADMIN}:*`); } catch (error) { /* cache optional */ }
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
    let total = 0;
    const run = async (name, fn) => {
        total += 1;
        try { await fn(); console.log(`  ok   ${name}`); } catch (error) { failed += 1; console.log(`  FAIL ${name}\n       ${error.message}`); }
    };
    try {
        await setup();
        for (const [name, fn] of Object.entries(tests)) await run(name, fn);
        const owner = await StaffV2Model.findOne({ isOwner: true, adminId: { $ne: ADMIN } }, 'adminId').lean();
        if (!owner) console.log('  skip C. smoke: no real v2 school in this database');
        else {
            // Session-scoped lists need the school's active session, as the pages send it.
            const active = await mongoose.connection.db.collection('v2-academic-sessions').findOne({ adminId: owner.adminId, status: 'active' });
            const needsSession = new Set(['/student/students', '/fees/structures', '/examination/admit-card-structures']);
            for (const p of SMOKE) {
                await run(`C. smoke GET ${p} (real school, read-only)`, async () => {
                    const query = needsSession.has(p) && active ? { session: active.label } : undefined;
                    const res = await api('GET', p, { adminId: owner.adminId, query });
                    assert.strictEqual(res.status, 200, `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
                });
            }
        }
    } finally {
        server.close();
        total += 1;
        try { await cleanupLive(); console.log('  ok   every test record removed (verified 0 left)'); } catch (error) { failed += 1; console.log(`  FAIL cleanup\n       ${error.message}`); }
        await mongoose.disconnect();
    }
    console.log(failed ? `\n${failed} failed` : `\nall ${total} passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('setup failed:', error.message);
    if (server) server.close();
    cleanupLive().catch((e) => console.error('cleanup failed:', e.message)).finally(() => process.exit(1));
});
