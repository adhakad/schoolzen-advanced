'use strict';
// Essential checks for the v2 Leave rules — pure functions only, no DB or Redis.
// Run: node scripts/test-leave-v2.js
const assert = require('assert');
const {
    expandWorkingDays, eachDayKey, rangesOverlap, actionsForStatus, isApplicable, effectiveLimit, remainingOf, exceedsBalance, releasedUsedDays, classKey,
} = require('../modules/helpers/leave/leave-rules');

const tests = {
    'working days skip Sundays (2026-08-09 is a Sunday)': () => {
        assert.deepStrictEqual(expandWorkingDays('2026-08-08', '2026-08-10'), ['2026-08-08', '2026-08-10']);
    },
    'a Sunday-only range has no working days (LEAVE_RANGE_EMPTY)': () => {
        assert.deepStrictEqual(expandWorkingDays('2026-08-09', '2026-08-09'), []);
    },
    'holiday keys are excluded once the Holiday module supplies them': () => {
        assert.deepStrictEqual(expandWorkingDays('2026-08-10', '2026-08-11', new Set(['2026-08-11'])), ['2026-08-10']);
    },
    'a reversed range is invalid (LEAVE_DATE_RANGE_INVALID)': () => {
        assert.deepStrictEqual(eachDayKey('2026-08-10', '2026-08-05'), []);
    },
    'overlap is inclusive on both ends': () => {
        assert.strictEqual(rangesOverlap('2026-08-05', '2026-08-06', '2026-08-06', '2026-08-08'), true);
        assert.strictEqual(rangesOverlap('2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'), false);
    },
    'one action set per status, never all at once': () => {
        const today = '2026-08-10';
        assert.deepStrictEqual(actionsForStatus('Pending', '2026-08-12', today), ['approve', 'reject']);
        assert.deepStrictEqual(actionsForStatus('Approved', '2026-08-12', today), ['cancel']);
        assert.deepStrictEqual(actionsForStatus('Rejected', '2026-08-12', today), ['delete']);
        assert.deepStrictEqual(actionsForStatus('Cancelled', '2026-08-12', today), []);
    },
    'a completed approved leave cannot be taken back': () => {
        assert.deepStrictEqual(actionsForStatus('Approved', '2026-08-09', '2026-08-10'), []);
    },
    'who-can-take applicability': () => {
        assert.strictEqual(isApplicable('everyone', 'student'), true);
        assert.strictEqual(isApplicable('staff', 'student'), false);
        assert.strictEqual(isApplicable('students', 'student'), true);
    },
    'own limit wins over the class default; class default is inherited when none': () => {
        assert.strictEqual(effectiveLimit({ allocatedDays: 5, usedDays: 1, source: 'override' }, { allocatedDays: 12 }).allocatedDays, 5);
        const inherited = effectiveLimit(null, { allocatedDays: 12 });
        assert.strictEqual(inherited.allocatedDays, 12);
        assert.strictEqual(inherited.inherited, true);
        assert.strictEqual(effectiveLimit(null, null), null);
    },
    'balance check: used + requested must not exceed allocated': () => {
        const limit = effectiveLimit({ allocatedDays: 12, usedDays: 10, source: 'staff' }, null);
        assert.strictEqual(exceedsBalance(limit, 2), false);
        assert.strictEqual(exceedsBalance(limit, 3), true);
        assert.strictEqual(remainingOf(limit), 2);
    },
    'take back gives days back, never below zero': () => {
        assert.strictEqual(releasedUsedDays(5, 2), 3);
        assert.strictEqual(releasedUsedDays(1, 3), 0);
    },
    'class key matches Roster target keys': () => {
        assert.strictEqual(classKey({ classId: 'c', streamId: null, sectionId: 's' }), 'c||s');
    },
};

let failed = 0;
Object.entries(tests).forEach(([name, fn]) => {
    try {
        fn();
        console.log(`  ok   ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`  FAIL ${name}\n       ${error.message}`);
    }
});
console.log(failed ? `\n${failed} failed` : `\nall ${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
