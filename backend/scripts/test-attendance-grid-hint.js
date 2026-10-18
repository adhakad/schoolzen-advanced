'use strict';
// attendance-fix3.md C, live (real DB + Redis, read-only except one cache key per case): the
// grid served from the Redis member hint (one DB stage) is byte-identical to the grid read
// without it, and a WRONG hint is detected and never changes a cell.
//
// Run: node scripts/test-attendance-grid-hint.js <adminId> [classId] [session]
require('dotenv').config();
global.global_config = require('../config/config.js');
const assert = require('assert');
const mongoose = require('mongoose');
const cacheService = require('../modules/services/cache/cache.service');
const cacheKeys = require('../modules/services/cache/cache-keys');
const { GetGrid } = require('../modules/controllers/attendance/overview.controller');

const [adminId, classId, session = '2026-2027'] = process.argv.slice(2);
const grid = async (query) => {
    const timing = { marks: [], mark: (name) => timing.marks.push(name) };
    const res = { locals: { timing }, status() { return res; }, json(body) { res.body = body; return res; } };
    await GetGrid({ query: { adminId, ...query }, adminId, user: { id: adminId } }, res);
    return { body: res.body, marks: timing.marks };
};

(async () => {
    assert.ok(adminId, 'usage: node scripts/test-attendance-grid-hint.js <adminId> [classId] [session]');
    await mongoose.connect(process.env.DB_URL);
    let failed = 0;
    const cases = [['staff', { personType: 'staff', month: '2026-10' }, 'staff', '|']];
    if (classId) cases.push(['student', { personType: 'student', month: '2026-10', session, classId }, 'student', [session, classId, '', '', ''].join('|')]);
    for (const [name, query, personType, filterKey] of cases) {
        const key = cacheKeys.attendance.gridMembers(adminId, personType, filterKey);
        try {
            await cacheService.del(key);
            const cold = await grid(query);
            assert.deepStrictEqual(cold.marks, ['grid-stage1'], 'no hint -> two stages');
            const warm = await grid(query);
            assert.deepStrictEqual(warm.marks, ['grid-hint-hit'], 'hint -> one stage');
            assert.deepStrictEqual(warm.body, cold.body, 'hint-hit grid differs from the fresh grid');
            // A wrong hint (a person missing) must be caught and re-read.
            const members = await cacheService.get(key);
            if (members.length > 1) {
                await cacheService.set(key, members.slice(1), 60);
                const wrong = await grid(query);
                assert.deepStrictEqual(wrong.marks, ['grid-stage1'], 'a stale hint must fall back');
                assert.deepStrictEqual(wrong.body, cold.body, 'a stale hint changed the grid');
            }
            console.log(`PASS  ${name}: hint hit = fresh read (${cold.body.rows.length} rows), stale hint falls back`);
        } catch (error) {
            failed += 1;
            console.log(`FAIL  ${name}: ${error.message}`);
        }
    }
    await mongoose.disconnect();
    process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
