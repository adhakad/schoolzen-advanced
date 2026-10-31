'use strict';
// shared-fix1.md S2 + shared-fix2.md, live (real DB, read-only): the client's session (label
// or id) wins; an unknown or other-school one is a 404 SESSION_NOT_FOUND (never a silent
// switch); with nothing sent the default is the session covering today, else the latest —
// never the active flag alone; reconciliation picks the session that covers the day.
//
// Run: node scripts/test-session-resolution.js [adminId]
require('dotenv').config();
global.global_config = require('../config/config.js');
const assert = require('assert');
const mongoose = require('mongoose');
const AcademicSessionV2Model = require('../modules/models/settings/academic-session');
const { resolveRequestSessionId, findSessionIdForDate, getActiveSession, pickDefaultSession } = require('../modules/helpers/academic-session/session-resolver');

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
    await check('selected session id resolves to itself', async () =>
        assert.strictEqual(await resolveRequestSessionId(adminId, String(other._id), 'test'), String(other._id)));
    await check('other-school session id -> 404', async () => {
        const foreign = await AcademicSessionV2Model.findOne({ adminId: { $ne: adminId } }, '_id').lean();
        const id = foreign ? String(foreign._id) : '0123456789abcdef01234567';
        await assert.rejects(resolveRequestSessionId(adminId, id, 'test'), (e) => e.code === 'SESSION_NOT_FOUND' && e.statusCode === 404);
    });
    await check('no label -> the session covering today (else latest), not the active flag', async () => {
        const rows = sessions.map((s) => ({ _id: String(s._id), startDate: s.startDate, endDate: s.endDate }));
        assert.strictEqual(await resolveRequestSessionId(adminId, '', 'test'), pickDefaultSession(rows)._id);
    });
    await check('pickDefaultSession: covering beats latest; latest when none covers', async () => {
        const rows = [
            { _id: 'a', startDate: '2025-04-01', endDate: '2026-03-31' },
            { _id: 'b', startDate: '2026-04-01', endDate: '2027-03-31' },
            { _id: 'c', startDate: '2027-04-01', endDate: '2028-03-31' },
        ];
        assert.strictEqual(pickDefaultSession(rows, new Date('2026-10-21'))._id, 'b');
        assert.strictEqual(pickDefaultSession(rows, new Date('2030-01-01'))._id, 'c');
        assert.strictEqual(pickDefaultSession([], new Date()), null);
    });
    await check('a day resolves to the session covering it', async () => {
        const day = new Date(other.startDate.getTime() + 86400000);
        assert.strictEqual(await findSessionIdForDate(adminId, day), String(other._id));
    });
    await mongoose.disconnect();
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
