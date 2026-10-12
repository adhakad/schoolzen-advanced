'use strict';
// Essential checks for the v2 Payroll rules — pure functions only, no DB or Redis.
// Run: node scripts/test-payroll-v2.js
const assert = require('assert');
const {
    resolveEffectiveSalary, hasPersonalOverride, calculatePay, summarizeMonth, countsFor,
    actionsForStatus, paymentTotals, payoutStatus, remainingDue, effectiveConfirmation, monthRange, NO_WORKING_DAYS,
} = require('../modules/helpers/payroll/payroll-rules');

const group = { basic: 20000, hra: 4000, allowances: [{ name: 'Transport', amount: 2000 }], deductions: [{ name: 'PF', amount: 1200 }] };
const none = { basic: null, hra: null, allowances: null, deductions: null };

/** A month of days: `working` working days, the rest Sunday-style weekly offs. */
const days = (spec) => spec.map(([dateKey, dayType, status = null, leavePaid = true]) => ({ dateKey, dayType, status, leavePaid }));

const tests = {
    'override MERGES with the group: null keeps the group value, 0 is a real "none"': () => {
        const effective = resolveEffectiveSalary(group, { ...none, hra: 0 });
        assert.strictEqual(effective.basic, 20000);
        assert.strictEqual(effective.hra, 0);
        assert.deepStrictEqual(effective.allowances, group.allowances);
        assert.deepStrictEqual(resolveEffectiveSalary(group, { ...none, allowances: [] }).allowances, []);
    },
    'changing the group rates never overwrites a personal override': () => {
        const overrides = { ...none, basic: 25000 };
        const raised = { ...group, basic: 30000, hra: 5000 };
        const effective = resolveEffectiveSalary(raised, overrides);
        assert.strictEqual(effective.basic, 25000);   // the person's own figure survives
        assert.strictEqual(effective.hra, 5000);      // un-overridden fields follow the group
    },
    'personal override note only when a set field actually deviates': () => {
        assert.strictEqual(hasPersonalOverride(group, none), false);
        assert.strictEqual(hasPersonalOverride(group, { ...none, basic: 20000 }), false);
        assert.strictEqual(hasPersonalOverride(group, { ...none, hra: 0 }), true);
    },
    'monthly: unpaid days bite through a pro-rata deduction': () => {
        const pay = calculatePay(resolveEffectiveSalary(group, none), 'monthly',
            { presentDays: 24, paidLeaveDays: 0, unpaidLeaveDays: 1, absentDays: 1, totalWorkingDays: 26 });
        assert.strictEqual(pay.gross, 26000);
        assert.strictEqual(pay.attendanceDeduction, 2000);
        assert.strictEqual(pay.net, 26000 - 1200 - 2000);
    },
    'monthly with zero working days is refused, never a -Infinity net': () => {
        assert.strictEqual(calculatePay(group, 'monthly', { presentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, totalWorkingDays: 0 }).error, NO_WORKING_DAYS);
    },
    'daily: gross = rate × (present + paid leave), deductions flat': () => {
        const pay = calculatePay({ basic: 600, hra: 0, allowances: [], deductions: [{ name: 'PF', amount: 20 }] }, 'daily',
            { presentDays: 20, paidLeaveDays: 2, unpaidLeaveDays: 1, absentDays: 3, totalWorkingDays: 26 });
        assert.strictEqual(pay.gross, 13200);
        assert.strictEqual(pay.net, 13180);
    },
    'mid-month: working days are the FULL month; future leave counts, other future days do not': () => {
        const month = days([
            ['2026-08-03', 'Working', 'Present'],
            ['2026-08-04', 'Working', 'Late'],
            ['2026-08-05', 'Working', null],           // past, no record → absent
            ['2026-08-06', 'Working', 'HalfDay'],
            ['2026-08-07', 'Holiday'],
            ['2026-08-09', 'WeeklyOff'],
            ['2026-08-20', 'Leave', null, false],      // future, approved unpaid leave
            ['2026-08-21', 'Working'],                 // future, nothing yet
        ]);
        const summary = summarizeMonth(month, '2026-08-10');
        assert.strictEqual(summary.workingDays, 6);
        assert.strictEqual(summary.present, 2.5);
        assert.strictEqual(summary.late, 1);
        assert.strictEqual(summary.absent, 1.5);
        assert.strictEqual(summary.unpaidLeave, 1);
        assert.strictEqual(summary.holiday, 1);
        assert.strictEqual(summary.remainingDays, 2);
        assert.strictEqual(summary.remainingCoveredByLeave, 1);
        assert.strictEqual(countsFor(summary).totalWorkingDays, 6);
    },
    'month range is 1-12 and ends on the real last day': () => {
        assert.deepStrictEqual(monthRange(2028, 2), { fromKey: '2028-02-01', toKey: '2028-02-29' });
    },
    'one action set per status, matching the reference': () => {
        assert.deepStrictEqual(actionsForStatus('pending'), ['generate']);
        assert.deepStrictEqual(actionsForStatus('draft'), ['regenerate', 'lock']);
        assert.deepStrictEqual(actionsForStatus('locked'), ['slip', 'unlock']);
    },
    'payout status is derived from CONFIRMED payments only': () => {
        const totals = paymentTotals([
            { amountPaid: 12000, confirmationStatus: 'confirmed' },
            { amountPaid: 9800, confirmationStatus: 'pending' },
            { amountPaid: 500, confirmationStatus: 'disputed' },
        ]);
        assert.deepStrictEqual(totals, { confirmed: 12000, pending: 9800 });
        assert.strictEqual(payoutStatus(21800, totals.confirmed), 'partial');
        assert.strictEqual(payoutStatus(13800, 0), 'unpaid');
        assert.strictEqual(payoutStatus(13800, 13800), 'full');
    },
    'remaining due reserves pending payments, never below zero': () => {
        assert.strictEqual(remainingDue(21800, 12000, 9800), 0);
        assert.strictEqual(remainingDue(21800, 12000, 0), 9800);
        assert.strictEqual(remainingDue(100, 80, 50), 0);
    },
    'a pending payment past its window is expired even before the sweep': () => {
        const now = new Date('2026-08-10T12:00:00Z');
        assert.strictEqual(effectiveConfirmation({ confirmationStatus: 'pending', confirmationExpiresAt: '2026-08-10T11:00:00Z' }, now), 'expired');
        assert.strictEqual(effectiveConfirmation({ confirmationStatus: 'pending', confirmationExpiresAt: '2026-08-11T11:00:00Z' }, now), 'pending');
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
