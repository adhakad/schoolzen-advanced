'use strict';
// Essential checks for the v2 Fees ledger — pure functions only, no DB or Redis.
// Run: node scripts/test-fees-v2.js
const assert = require('assert');
const {
    buildLedger, allocateOldestFirst, matchesReminder, paidPercent, rupeesInWords, STATUS,
} = require('../modules/helpers/fees/fee-ledger');

// 7th last year (₹38,000, ₹31,500 paid), 8th this year (₹42,000, ₹22,000 paid).
const r7 = { _id: 'r7', sessionId: 's25', sessionLabel: '2025-2026', totalFee: 38000, admissionFee: 0, concession: 0 };
const r8 = { _id: 'r8', sessionId: 's26', sessionLabel: '2026-2027', totalFee: 42000, admissionFee: 0, concession: 0 };
const r6 = { _id: 'r6', sessionId: 's24', sessionLabel: '2024-2025', totalFee: 34000, admissionFee: 0, concession: 0 };
const pay = (recordId, amount) => ({ _id: `p-${recordId}-${amount}`, studentFeeRecordId: recordId, amount });

const tests = {
    'a partial payment clears the old arrear BEFORE touching the current year': () => {
        const ledger = buildLedger([r8, r7], [pay('r7', 31500), pay('r8', 22000)], 'r8');
        assert.strictEqual(ledger.totals.arrearsDue, 6500);
        assert.strictEqual(ledger.totals.totalDue, 26500);
        const { allocations } = allocateOldestFirst(ledger, 10000);
        assert.deepStrictEqual(allocations, [
            { recordId: 'r7', sessionId: 's25', amount: 6500 },
            { recordId: 'r8', sessionId: 's26', amount: 3500 },
        ]);
    },
    'a payment smaller than the arrear never reaches the current year': () => {
        const ledger = buildLedger([r7, r8], [pay('r7', 31500)], 'r8');
        assert.deepStrictEqual(allocateOldestFirst(ledger, 4000).allocations, [{ recordId: 'r7', sessionId: 's25', amount: 4000 }]);
    },
    'allocations count where they say once recorded': () => {
        const allocated = { _id: 'p', studentFeeRecordId: 'r8', amount: 10000,
            allocations: [{ recordId: 'r7', sessionId: 's25', amount: 6500 }, { recordId: 'r8', sessionId: 's26', amount: 3500 }] };
        const ledger = buildLedger([r7, r8], [pay('r7', 31500), pay('r8', 22000), allocated], 'r8');
        assert.strictEqual(ledger.sessions[0].due, 0);
        assert.strictEqual(ledger.totals.paid, 25500);
        assert.strictEqual(ledger.totals.totalDue, 16500);
        assert.strictEqual(ledger.totals.status, STATUS.PARTIAL);
    },
    'more than the total due is refused (PAYMENT_EXCEEDS_DUE); zero/negative is invalid': () => {
        const ledger = buildLedger([r7, r8], [pay('r7', 31500), pay('r8', 22000)], 'r8');
        assert.strictEqual(allocateOldestFirst(ledger, 26501).error, 'PAYMENT_EXCEEDS_DUE');
        assert.strictEqual(allocateOldestFirst(ledger, 26500).allocations.length, 2);
        assert.strictEqual(allocateOldestFirst(ledger, 0).error, 'PAYMENT_AMOUNT_INVALID');
        assert.strictEqual(allocateOldestFirst(ledger, -5).error, 'PAYMENT_AMOUNT_INVALID');
    },
    'a fully-cleared past session is still listed, as Fully Paid': () => {
        const ledger = buildLedger([r6, r7, r8], [pay('r6', 34000), pay('r7', 31500)], 'r8');
        assert.strictEqual(ledger.sessions.length, 3);
        assert.strictEqual(ledger.sessions[0].status, STATUS.PAID);
        assert.strictEqual(ledger.arrears.length, 1);   // only 7th still owes
    },
    'status: has-arrears / partial / unpaid / paid': () => {
        assert.strictEqual(buildLedger([r7, r8], [pay('r8', 42000)], 'r8').totals.status, STATUS.HAS_ARREARS);
        assert.strictEqual(buildLedger([r8], [pay('r8', 1)], 'r8').totals.status, STATUS.PARTIAL);
        assert.strictEqual(buildLedger([r8], [], 'r8').totals.status, STATUS.UNPAID);
        assert.strictEqual(buildLedger([r8], [pay('r8', 42000)], 'r8').totals.status, STATUS.PAID);
    },
    'concession and admission fee shape the charge': () => {
        const rec = { ...r8, admissionFee: 5000, concession: 2000 };
        const ledger = buildLedger([rec], [], 'r8');
        assert.strictEqual(ledger.totals.gross, 47000);
        assert.strictEqual(ledger.totals.totalDue, 45000);
    },
    'viewing an earlier session ignores later ones': () => {
        const ledger = buildLedger([r7, r8], [], 'r7');
        assert.strictEqual(ledger.sessions.length, 1);
        assert.strictEqual(ledger.totals.totalDue, 38000);
    },
    'reminder filter: thresholds, no-payment window, reminder gap': () => {
        const now = new Date('2026-09-30T00:00:00Z');
        const totals = buildLedger([r8], [pay('r8', 22000)], 'r8').totals;
        assert.strictEqual(paidPercent(totals), 52);
        assert.strictEqual(matchesReminder({ paidBelowPercent: 50 }, { totals }, now), false);
        assert.strictEqual(matchesReminder({ paidBelowPercent: 60 }, { totals }, now), true);
        assert.strictEqual(matchesReminder({ noPaymentSinceDays: 30 }, { totals, lastPaymentAt: '2026-09-20' }, now), false);
        assert.strictEqual(matchesReminder({ noPaymentSinceDays: 30 }, { totals, lastPaymentAt: '2026-08-01' }, now), true);
        assert.strictEqual(matchesReminder({ gapSinceLastReminderDays: 7 }, { totals, lastReminderSentAt: '2026-09-28' }, now), false);
        const settled = buildLedger([r8], [pay('r8', 42000)], 'r8').totals;
        assert.strictEqual(matchesReminder({}, { totals: settled }, now), false);
    },
    'amount in words (Indian grouping)': () => {
        assert.strictEqual(rupeesInWords(20000), 'Rupees Twenty Thousand Only');
        assert.strictEqual(rupeesInWords(126500), 'Rupees One Lakh Twenty Six Thousand Five Hundred Only');
    },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`FAIL  ${name}\n      ${error.message}`);
    }
}
console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
