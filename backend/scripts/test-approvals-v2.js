'use strict';
// Essential checks for the v2 Approvals inbox — pure functions and wiring only, no DB or Redis.
// Run: node scripts/test-approvals-v2.js
const assert = require('assert');
const {
    encodeCursor, decodeCursor, cursorMatch, shortRange, leaveDetail, personCode, mapSourceCode, INBOX_STATUSES,
} = require('../modules/helpers/approvals/approval-rules');
const { SOURCES, sourceFor } = require('../modules/helpers/approvals/sources');
const leaveRequests = require('../modules/controllers/leave/leave-requests.controller');
const { PERMISSION_MODULES } = require('../modules/models/settings/role');
const { listSchema } = require('../modules/validators/approvals/approvals.validator');

const ID = '64b000000000000000000001';

const tests = {
    'cursor round-trips (createdAt, _id) and rejects foreign tokens': () => {
        const createdAt = new Date('2026-08-05T10:00:00.000Z');
        const decoded = decodeCursor(encodeCursor({ createdAt, _id: ID }));
        assert.strictEqual(decoded.createdAt.getTime(), createdAt.getTime());
        assert.strictEqual(decoded._id, ID);
        assert.strictEqual(decodeCursor('not-a-cursor'), null);
        assert.strictEqual(decodeCursor(Buffer.from('abc|xyz').toString('base64url')), null);
        assert.strictEqual(decodeCursor(''), null);
    },
    'keyset match is strictly after the cursor, ties broken by _id': () => {
        const createdAt = new Date('2026-08-05T10:00:00.000Z');
        const match = cursorMatch({ createdAt, _id: ID });
        assert.deepStrictEqual(match.$or[0], { createdAt: { $lt: createdAt } });
        assert.strictEqual(match.$or[1].createdAt, createdAt);
        assert.strictEqual(String(match.$or[1]._id.$lt), ID);
    },
    'details line matches the reference': () => {
        assert.strictEqual(shortRange('2026-08-05', '2026-08-06'), '05–06 Aug');
        assert.strictEqual(shortRange('2026-08-12', '2026-08-12'), '12 Aug');
        assert.strictEqual(shortRange('2026-07-30', '2026-08-02'), '30 Jul–02 Aug');
        assert.strictEqual(leaveDetail('Casual Leave', '2026-08-05', '2026-08-06', 2), 'Casual Leave · 05–06 Aug (2 days)');
        assert.strictEqual(leaveDetail('Casual Leave', '2026-08-12', '2026-08-12', 1), 'Casual Leave · 12 Aug (1 day)');
        assert.strictEqual(leaveDetail('', '2026-08-12', '2026-08-12', 1), 'Leave · 12 Aug (1 day)');
    },
    'name second line: staff code, student class · Student': () => {
        assert.strictEqual(personCode('staff', { code: 'STF-0142', sub: 'Teacher' }), 'STF-0142');
        assert.strictEqual(personCode('staff', { code: null, sub: 'Teacher' }), 'Teacher');
        assert.strictEqual(personCode('student', { sub: '6th · B' }), '6th · B · Student');
        assert.strictEqual(personCode('student', null), 'Student');
    },
    'leave source: status mapping, Cancelled never in the inbox': () => {
        const leave = sourceFor('leave');
        const base = { adminId: 'a1', sessionId: 's1', personType: null, personIds: null };
        assert.deepStrictEqual(leave.match({ ...base, status: null }).status, { $in: ['Pending', 'Approved', 'Rejected'] });
        assert.strictEqual(leave.match({ ...base, status: 'pending' }).status, 'Pending');
        const narrowed = leave.match({ ...base, status: 'approved', personType: 'staff', personIds: [ID] });
        assert.strictEqual(narrowed.personType, 'staff');
        assert.deepStrictEqual(narrowed.personId, { $in: [ID] });
        assert.deepStrictEqual(INBOX_STATUSES, ['pending', 'approved', 'rejected']);
    },
    'every source exposes the union contract': () => {
        SOURCES.forEach((source) => {
            assert.ok(source.project.createdAt && source.project._id, `${source.type} projects the sort key`);
            assert.ok(source.project.type && source.project.status, `${source.type} projects type/status`);
            assert.strictEqual(typeof source.describe, 'function');
            assert.ok(source.permission, `${source.type} names its own grant`);
        });
        assert.strictEqual(sourceFor('fees'), null);
        assert.strictEqual(sourceFor(''), null);
    },
    'approve/reject ARE the Leave module actions (no parallel copy)': () => {
        assert.strictEqual(typeof leaveRequests.approveLeaveRequest, 'function');
        assert.strictEqual(typeof leaveRequests.rejectLeaveRequest, 'function');
        // The descriptor calls through the controller's exported functions.
        const source = sourceFor('leave');
        assert.ok(String(source.approve).includes('approveLeaveRequest'));
        assert.ok(String(source.approve).includes('forceApprove: false'));
        assert.ok(String(source.reject).includes('rejectLeaveRequest'));
    },
    'source error codes map to the inbox codes; others pass through': () => {
        const { codeMap } = sourceFor('leave');
        assert.strictEqual(mapSourceCode('LEAVE_REQUEST_NOT_FOUND', codeMap), 'REQUEST_NOT_FOUND');
        assert.strictEqual(mapSourceCode('LEAVE_NOT_PENDING', codeMap), 'REQUEST_NOT_PENDING');
        assert.strictEqual(mapSourceCode('LEAVE_ALREADY_ACTIONED', codeMap), 'REQUEST_NOT_PENDING');
        assert.strictEqual(mapSourceCode('LEAVE_BALANCE_EXCEEDED', codeMap), null);
        assert.strictEqual(mapSourceCode(undefined, codeMap), null);
    },
    'explicit permission keys exist': () => {
        assert.ok(PERMISSION_MODULES.includes('approvals'));
        assert.ok(PERMISSION_MODULES.includes('approvals-action'));
    },
    'list query: unknown type/status refused, limit restricted to 10/25/50': () => {
        assert.ok(listSchema.validate({ adminId: 'a', type: 'fees' }).error);
        assert.ok(listSchema.validate({ adminId: 'a', status: 'cancelled' }).error);
        assert.ok(listSchema.validate({ adminId: 'a', limit: 1000 }).error);
        const { value, error } = listSchema.validate({ adminId: 'a' });
        assert.ok(!error);
        assert.strictEqual(value.limit, 10);
        assert.strictEqual(value.type, '');
    },
};

(async () => {
    let failed = 0;
    for (const [name, fn] of Object.entries(tests)) {
        try {
            await fn();
            console.log(`PASS  ${name}`);
        } catch (error) {
            failed += 1;
            console.log(`FAIL  ${name}\n      ${error.message}`);
        }
    }
    console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
    process.exit(failed ? 1 : 0);
})();
