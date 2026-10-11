'use strict';
// Essential checks for the v2 Holiday rules — pure functions only, no DB or Redis.
// Run: node scripts/test-holiday-v2.js
const assert = require('assert');
const { holidayDays, offKeysFor, classifySelection, dedupePublic, coversDay } = require('../modules/helpers/holiday/holiday-rules');

const tests = {
    'holiday day count is inclusive; a reversed range is 0 (HOLIDAY_DATE_RANGE_INVALID)': () => {
        assert.strictEqual(holidayDays('2026-11-01', '2026-11-03'), 3);
        assert.strictEqual(holidayDays('2026-11-03', '2026-11-01'), 0);
    },
    'calendar = weekly off-days + every day of each holiday range, clipped to the window': () => {
        // 2026-08-09 and 2026-08-16 are Sundays.
        const calendar = { weeklyOffDays: [0], ranges: [{ startDateKey: '2026-08-14', endDateKey: '2026-08-15' }, { startDateKey: '2026-07-30', endDateKey: '2026-08-10' }] };
        assert.deepStrictEqual([...offKeysFor(calendar, '2026-08-08', '2026-08-16')].sort(),
            ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-14', '2026-08-15', '2026-08-16']);
    },
    'a template with no weekly off and no holidays has no off-days': () => {
        assert.strictEqual(offKeysFor({ weeklyOffDays: [], ranges: [] }, '2026-08-01', '2026-08-31').size, 0);
    },
    'mixed selection is detected (Assign vs Edit)': () => {
        assert.strictEqual(classifySelection([{ templateId: null }, { templateId: null }]), 'assign');
        assert.strictEqual(classifySelection([{ templateId: 'a' }, { templateId: 'b' }]), 'edit');
        assert.strictEqual(classifySelection([{ templateId: 'a' }, { templateId: null }]), 'mixed');
        assert.strictEqual(classifySelection([]), 'empty');
    },
    'generate dedupes against existing (name ci + start) and within the dataset': () => {
        const existing = [{ name: 'Diwali', startDateKey: '2026-11-08' }];
        const incoming = [{ name: 'diwali ', date: '2026-11-08' }, { name: 'Holi', date: '2026-03-04' }, { name: 'Holi', date: '2026-03-04' }];
        const { fresh, skipped } = dedupePublic(existing, incoming);
        assert.deepStrictEqual(fresh, [{ name: 'Holi', startDateKey: '2026-03-04', endDateKey: '2026-03-04' }]);
        assert.strictEqual(skipped, 2);
    },
    'reconcile trigger only when a range covers today': () => {
        assert.strictEqual(coversDay({ startDateKey: '2026-10-08', endDateKey: '2026-10-10' }, '2026-10-09'), true);
        assert.strictEqual(coversDay({ startDateKey: '2026-10-10', endDateKey: '2026-10-10' }, '2026-10-09'), false);
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
