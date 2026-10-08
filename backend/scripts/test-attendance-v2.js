'use strict';
// Essential checks for the v2 Attendance rules — pure functions only, no DB or Redis.
// Run: node scripts/test-attendance-v2.js
const assert = require('assert');
const { computeDayStatus, buildPunchHash, isTimeRangeValid, shiftCode, isWeeklyOff } = require('../modules/helpers/attendance/status');
const { toPunchRows } = require('../modules/services/attendance-v2/ingest');
const { toWdmsEmpCode } = require('../modules/services/wdms-employee');

const shift = {
    startTime: '09:00', endTime: '15:00', earlyInMinutes: 30, graceMinutes: 10,
    halfDayAfterMinutes: 120, earlyOutMinutes: 30, lateOutMinutes: 60,
};
const at = (hhmm) => new Date(`2026-08-10T${hhmm}:00Z`);
const day = (personType, times, s = shift) => computeDayStatus({ dateKey: '2026-08-10', personType, shift: s, punchTimes: times.map(at) }).status;

const tests = {
    'on time within grace is Present': () => assert.strictEqual(day('staff', ['09:08', '15:05']), 'Present'),
    'past grace is Late': () => assert.strictEqual(day('staff', ['09:25', '15:05']), 'Late'),
    'staff past half-day threshold is HalfDay': () => assert.strictEqual(day('staff', ['11:30', '15:05']), 'HalfDay'),
    'student never gets HalfDay (staff-only rule)': () => assert.strictEqual(day('student', ['11:30']), 'Late'),
    'staff leaving early beyond earlyOut is HalfDay': () => assert.strictEqual(day('staff', ['09:00', '14:00']), 'HalfDay'),
    'no punch in the window is Absent': () => assert.strictEqual(day('staff', ['07:00']), 'Absent'),
    'early punch inside earlyIn window counts': () => assert.strictEqual(day('student', ['08:40']), 'Present'),
    'no shift: any punch is Present': () => assert.strictEqual(day('staff', ['13:00'], null), 'Present'),
    'start must be before end (SHIFT_TIME_RANGE_INVALID)': () => {
        assert.strictEqual(isTimeRangeValid('09:00', '15:00'), true);
        assert.strictEqual(isTimeRangeValid('15:00', '09:00'), false);
        assert.strictEqual(isTimeRangeValid('09:00', '09:00'), false);
    },
    'punchHash is stable and separator-safe': () => {
        const t = at('09:00');
        assert.strictEqual(buildPunchHash('a', 'p1', t), buildPunchHash('a', 'p1', new Date(t)));
        assert.notStrictEqual(buildPunchHash('1', '23', t), buildPunchHash('12', '3', t));
    },
    'a re-delivered punch maps to the same hash (dedup)': () => {
        const personId = '64b7f0c2a1b2c3d4e5f60718';
        const index = new Map([[toWdmsEmpCode(personId), { personType: 'staff', personId }]]);
        const txn = { emp_code: toWdmsEmpCode(personId), punch_time: '2026-08-10 09:01:00', terminal_sn: 'T1' };
        const rows = toPunchRows('admin1', [txn, { ...txn }, { emp_code: 'unknown', punch_time: '2026-08-10 09:02:00' }], index);
        assert.strictEqual(rows.length, 2);
        assert.strictEqual(rows[0].punchHash, rows[1].punchHash);
        assert.strictEqual(rows[0].dateKey, '2026-08-10');
    },
    'shift codes for roster chips': () => {
        assert.strictEqual(shiftCode('Morning Shift'), 'M');
        assert.strictEqual(shiftCode('Evening'), 'E');
        assert.strictEqual(shiftCode('Old Summer Shift'), 'OS');
    },
    'Sunday is the weekly off': () => {
        assert.strictEqual(isWeeklyOff('2026-08-09'), true);
        assert.strictEqual(isWeeklyOff('2026-08-10'), false);
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
