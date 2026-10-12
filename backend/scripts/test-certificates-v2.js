'use strict';
// Essential checks for the v2 Certificates rules — pure functions only, no DB or Redis.
// Run: node scripts/test-certificates-v2.js
const assert = require('assert');
const {
    nextSerial, isValidSerial, attendanceInRange, feesGate, buildSnapshot, dobWithWords, maskAadhar,
} = require('../modules/helpers/certificates/tc-rules');
const { TC_FIELDS } = require('../modules/helpers/certificates/tc-fields');
const { studentIdFilter } = require('../modules/controllers/certificates/transfer-certificate.controller');

const tests = {
    'serial increments keep prefix and zero-padding': () => {
        assert.strictEqual(nextSerial('TC-2026-0048'), 'TC-2026-0049');
        assert.strictEqual(nextSerial('TC-2026-0099'), 'TC-2026-0100');
        assert.strictEqual(nextSerial('TC-2026-9999'), 'TC-2026-10000');
        assert.strictEqual(nextSerial('TC-'), null);
    },
    'a serial must end in a number': () => {
        assert.ok(isValidSerial('TC-2026-0048'));
        assert.ok(!isValidSerial('TC-2026-'));
        assert.ok(!isValidSerial(''));
        assert.ok(!isValidSerial('<b>1'));
    },
    'attendance bounds (TC_ATTENDANCE_RANGE_INVALID)': () => {
        assert.ok(attendanceInRange(210, 193));
        assert.ok(attendanceInRange(0, 0));
        assert.ok(!attendanceInRange(210, 211));
        assert.ok(!attendanceInRange(366, 10));
        assert.ok(!attendanceInRange(-1, 0));
    },
    'pending fees block unless fees-waiver AND acknowledged': () => {
        assert.deepStrictEqual(feesGate(0, false, false), { allowed: true, override: false, canOverride: false });
        assert.deepStrictEqual(feesGate(5000, false, false), { allowed: false, override: false, canOverride: false });
        assert.deepStrictEqual(feesGate(5000, false, true), { allowed: false, override: false, canOverride: false });
        assert.deepStrictEqual(feesGate(5000, true, false), { allowed: false, override: false, canOverride: true });
        assert.deepStrictEqual(feesGate(5000, true, true), { allowed: true, override: true, canOverride: true });
    },
    'the snapshot is frozen — later profile edits never reach it': () => {
        const profile = {
            admissionNo: 2024142, name: 'Rohan Kapoor', motherName: 'Anita Kapoor', fatherName: 'Suresh Kapoor',
            dob: new Date(Date.UTC(2013, 2, 12)), aadharNumber: '123456784821', samagraId: 'MP0921456789',
            nationality: 'Indian', category: 'General', doa: new Date(Date.UTC(2022, 5, 12)),
        };
        const placement = { className: '8th', streamName: null, sectionName: 'A', nextClassName: '9th', subjects: ['Hindi', 'English'] };
        const inputs = { dateOfLeaving: new Date(Date.UTC(2026, 8, 5)), reasonForLeaving: 'transfer', qualifiedForPromotion: true, generalConduct: 'good', remarks: '' };
        const snapshot = buildSnapshot(profile, placement, inputs, { workingDays: 210, presentDays: 193 });
        profile.name = 'Changed Later';
        placement.subjects.push('Maths');
        assert.strictEqual(snapshot.name, 'Rohan Kapoor');
        assert.strictEqual(snapshot.subjects, 'Hindi, English');
        assert.strictEqual(snapshot.classLastStudied, '8th (Section A)');
        assert.strictEqual(snapshot.lastExamResult, '8th — Passed');
        assert.strictEqual(snapshot.promotion, 'Yes — to 9th');
        assert.strictEqual(snapshot.issueDate, '05/09/2026');
        assert.strictEqual(snapshot.reason, "Parent's Transfer");
        assert.strictEqual(snapshot.remarks, null);
        // Every one of the 19 printed fields has a snapshot key.
        TC_FIELDS.forEach((field) => assert.ok(field.key in snapshot, field.key));
    },
    'DOB in words and Aadhar masking match the reference': () => {
        assert.strictEqual(dobWithWords(new Date(Date.UTC(2013, 2, 12))), '12/03/2013 (Twelfth March, Two Thousand Thirteen)');
        assert.strictEqual(dobWithWords(new Date(Date.UTC(1999, 11, 21))), '21/12/1999 (Twenty First December, One Thousand Nine Hundred Ninety Nine)');
        assert.strictEqual(maskAadhar('1234 5678 4821'), 'XXXX-XXXX-4821');
        assert.strictEqual(maskAadhar(''), null);
    },
    'status filter narrows on top of search, never gates': () => {
        const a = '64b000000000000000000001';
        const b = '64b000000000000000000002';
        const issued = new Map([[a, {}]]);
        assert.strictEqual(studentIdFilter(null, issued, ''), null);
        assert.deepStrictEqual(studentIdFilter(null, issued, 'issued').$in.map(String), [a]);
        assert.deepStrictEqual(studentIdFilter(null, issued, 'notissued').$nin.map(String), [a]);
        assert.deepStrictEqual(studentIdFilter([a, b], issued, 'notissued').$in.map(String), [b]);
        assert.deepStrictEqual(studentIdFilter([b], issued, 'issued').$in, []);
    },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
    try {
        fn();
        console.log(`PASS  ${name}`);
    } catch (error) {
        failed += 1;
        console.log(`FAIL  ${name}\n      ${error.message}`);
    }
}
console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
