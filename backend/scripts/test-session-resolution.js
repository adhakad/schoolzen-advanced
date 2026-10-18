'use strict';
// shared-fix1.md S2, live (real DB, read-only): the client's session label wins; an unknown
// label is a 404 SESSION_NOT_FOUND (never a silent switch); the active flag is only the
// default when no label is sent; reconciliation picks the session that covers the day.
//
// Run: node scripts/test-session-resolution.js [adminId]
require('dotenv').config();
global.global_config = require('../config/config.js');
const assert = require('assert');
const mongoose = require('mongoose');
const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const { resolveRequestSessionId, findSessionIdForDate, getActiveSession } = require('../modules/helpers/academic-session/session-resolver');

(async () => {
    await mongoose.connect(process.env.DB_URL);
    let failed = 0;
    const check = async (name, fn) => {
        try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed += 1; console.log(`FAIL  ${name}: ${e.message}`); }
    };
    // A school with more than one session, so "selected" and "active" can differ.
    const adminId = process.argv[2] || (await AcademicSessionV2Model.aggregate([
        { $group: { _id: '$adminId', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $limit: 1 },
    ]))[0]?._id;
    assert.ok(adminId, 'no school with two sessions to test against');
    const sessions = await AcademicSessionV2Model.find({ adminId }).lean();
    const active = await getActiveSession(adminId);
    const other = sessions.find((s) => !active || String(s._id) !== String(active._id));

    await check('selected (non-active) label resolves to ITS session', async () =>
        assert.strictEqual(await resolveRequestSessionId(adminId, other.label, 'test'), String(other._id)));
    await check('unknown label -> 404 SESSION_NOT_FOUND, no fall back', async () => {
        await assert.rejects(resolveRequestSessionId(adminId, '1990-1991', 'test'), (e) => e.code === 'SESSION_NOT_FOUND' && e.statusCode === 404);
    });
    await check('no label -> active session', async () =>
        assert.strictEqual(await resolveRequestSessionId(adminId, '', 'test'), active ? String(active._id) : null));
    await check('a day resolves to the session covering it', async () => {
        const day = new Date(other.startDate.getTime() + 86400000);
        assert.strictEqual(await findSessionIdForDate(adminId, day), String(other._id));
    });
    await mongoose.disconnect();
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
