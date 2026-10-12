'use strict';
// Essential checks for the v2 Examination rules — pure functions only, no DB or Redis.
// Run: node scripts/test-examination-v2.js
const assert = require('assert');
const {
    examNameForTerm, validateMaxes, validateMarks, gradeFor, passPercentOf, computeResult,
    normalizeCoScholastic, bulkRowErrors, validateSchedule, datesOutside, intersectScopes, schedulesClash, time12,
} = require('../modules/helpers/examination/exam-rules');
const { MARKSHEET_CATALOG } = require('../modules/helpers/settings/marksheet-catalog');

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const C = '64b000000000000000000003';
const T1 = MARKSHEET_CATALOG.find((t) => t.code === 'T1');
const T3 = MARKSHEET_CATALOG.find((t) => t.code === 'T3');
const codes = (errors) => errors.map((e) => e.code);

const tests = {
    'exam names follow template terms': () => {
        assert.strictEqual(examNameForTerm('Half-Yearly'), 'Half-Yearly Exam');
        assert.strictEqual(examNameForTerm('Final Exam'), 'Final Exam');
        assert.strictEqual(examNameForTerm('Term 1'), 'Term 1 Exam');
    },
    'maxes: no hardcoded 100 ceiling, blanks/zero/negatives rejected (MARKS_MAX_INVALID)': () => {
        assert.deepStrictEqual(validateMaxes([{ subjectId: A, theoryMax: 150, practicalMax: null }], [A]), []);
        assert.deepStrictEqual(codes(validateMaxes([{ subjectId: A, theoryMax: 0 }], [A])), ['MARKS_MAX_INVALID']);
        assert.deepStrictEqual(codes(validateMaxes([{ subjectId: A, theoryMax: -5 }], [A])), ['MARKS_MAX_INVALID']);
        assert.deepStrictEqual(codes(validateMaxes([{ subjectId: A, theoryMax: 'x' }], [A])), ['MARKS_MAX_INVALID']);
        assert.deepStrictEqual(codes(validateMaxes([{ subjectId: A, theoryMax: null, practicalMax: null }], [A])), ['MARKS_MAX_INVALID']);
        assert.deepStrictEqual(codes(validateMaxes([], [A])), ['SUBJECTS_REQUIRED']);
        assert.deepStrictEqual(codes(validateMaxes([{ subjectId: B, theoryMax: 80 }], [A])), ['SUBJECT_NOT_FOUND']);
        assert.deepStrictEqual(codes(validateMaxes([{ subjectId: A, theoryMax: 80 }, { subjectId: A, theoryMax: 80 }], [A])), ['SUBJECT_SCHEDULED_TWICE']);
    },
    'marks: bounded by the structure, server-side (MARKS_EXCEED_MAX / NEGATIVE / SUBJECT_MISMATCH)': () => {
        const structure = [{ subjectId: A, theoryMax: 80, practicalMax: 20 }, { subjectId: B, theoryMax: 80, practicalMax: null }];
        assert.deepStrictEqual(validateMarks(structure, [{ subjectId: A, theory: 80, practical: 20 }, { subjectId: B, theory: '' }]), []);
        assert.deepStrictEqual(codes(validateMarks(structure, [{ subjectId: A, theory: 81 }])), ['MARKS_EXCEED_MAX']);
        assert.ok(validateMarks(structure, [{ subjectId: A, theory: 81 }])[0].message.includes('(80)'));
        assert.deepStrictEqual(codes(validateMarks(structure, [{ subjectId: A, theory: -1 }])), ['MARKS_NEGATIVE']);
        assert.deepStrictEqual(codes(validateMarks(structure, [{ subjectId: A, theory: 'abc' }])), ['MARKS_NEGATIVE']);
        assert.deepStrictEqual(codes(validateMarks(structure, [{ subjectId: A, theory: 10.3 }])), ['MARKS_NEGATIVE']);
        assert.deepStrictEqual(validateMarks(structure, [{ subjectId: A, theory: 10.5 }]), []);
        assert.deepStrictEqual(codes(validateMarks(structure, [{ subjectId: C, theory: 10 }])), ['MARKS_SUBJECT_MISMATCH']);
        assert.deepStrictEqual(codes(validateMarks(structure, [{ subjectId: B, theory: 10, practical: 5 }])), ['MARKS_SUBJECT_MISMATCH']);
    },
    'grades, pass mark and totals match the reference calculation': () => {
        assert.strictEqual(gradeFor(91, T1.gradeRows), 'A+');
        assert.strictEqual(gradeFor(85.4, T1.gradeRows), 'A');
        assert.strictEqual(gradeFor(32.9, T1.gradeRows), 'F');
        assert.strictEqual(gradeFor(95, T3.gradeRows), 'A1');
        assert.strictEqual(passPercentOf(T1), 33);
        assert.strictEqual(passPercentOf(T3), 33.75);
        const subjects = [
            { subjectId: A, name: 'English', theoryMax: 80, practicalMax: null },
            { subjectId: B, name: 'Science', theoryMax: 80, practicalMax: 20 },
        ];
        const result = computeResult(subjects, [{ subjectId: A, theory: 68 }, { subjectId: B, theory: 62, practical: 18 }], T1);
        assert.deepStrictEqual(result.totals, { obtained: 148, max: 180, percentage: 82.2, grade: 'A', result: 'Pass' });
        assert.strictEqual(result.subjects[0].practical, null);
        assert.strictEqual(result.subjects[1].total, 80);
        const fail = computeResult(subjects, [{ subjectId: A, theory: 10 }], T1);
        assert.strictEqual(fail.totals.result, 'Fail');
    },
    'a saved result is a snapshot — later structure edits never reach it': () => {
        const subjects = [{ subjectId: A, name: 'English', theoryMax: 80, practicalMax: null }];
        const result = computeResult(subjects, [{ subjectId: A, theory: 70 }], T1);
        subjects[0].theoryMax = 100;
        subjects[0].name = 'English Language';
        assert.strictEqual(result.subjects[0].theoryMax, 80);
        assert.strictEqual(result.subjects[0].name, 'English');
    },
    'co-scholastic grades follow the template areas, A/B/C only': () => {
        assert.deepStrictEqual(
            normalizeCoScholastic(['Work Education', 'Discipline'], [{ area: 'Work Education', grade: 'B' }, { area: 'Discipline', grade: 'Z' }, { area: 'Other', grade: 'C' }]),
            [{ area: 'Work Education', grade: 'B' }, { area: 'Discipline', grade: 'A' }]
        );
    },
    'bulk grid reports invalid cells per row (MARKS_ROW_INVALID)': () => {
        const structure = [{ subjectId: A, theoryMax: 80 }, { subjectId: B, theoryMax: null, practicalMax: 20 }];
        const bad = bulkRowErrors(structure, [
            { studentId: 's1', marks: [{ subjectId: A, theory: 70 }] },
            { studentId: 's2', marks: [{ subjectId: A, theory: 90 }] },
            { studentId: 's3', marks: [{ subjectId: B, theory: 5 }] },
        ]);
        assert.deepStrictEqual(bad.map((r) => r.studentId), ['s2', 's3']);
        assert.strictEqual(bad[0].cells[0].code, 'MARKS_EXCEED_MAX');
        assert.strictEqual(bad[1].cells[0].code, 'MARKS_SUBJECT_MISMATCH');
    },
    'schedule: complete, ordered, no duplicate, no clash': () => {
        const ok = [
            { subjectId: A, examDate: '2026-10-10', startTime: '09:00', endTime: '11:00' },
            { subjectId: B, examDate: '2026-10-10', startTime: '11:00', endTime: '13:00' },
        ];
        assert.deepStrictEqual(validateSchedule(ok, [A, B]), []);
        assert.deepStrictEqual(codes(validateSchedule([ok[0]], [A, B])), ['EXAM_SCHEDULE_INCOMPLETE']);
        assert.deepStrictEqual(codes(validateSchedule([{ ...ok[0], examDate: '' }, ok[1]], [A, B])), ['EXAM_SCHEDULE_INCOMPLETE']);
        assert.deepStrictEqual(codes(validateSchedule([{ ...ok[0], endTime: '09:00' }, ok[1]], [A, B])), ['EXAM_TIME_ORDER_INVALID']);
        assert.deepStrictEqual(codes(validateSchedule([ok[0], { ...ok[0] }, ok[1]], [A, B])), ['SUBJECT_SCHEDULED_TWICE']);
        assert.deepStrictEqual(codes(validateSchedule([ok[0], { ...ok[1], startTime: '10:00' }], [A, B])), ['SUBJECT_TIME_CLASH']);
        assert.deepStrictEqual(codes(validateSchedule([...ok, { subjectId: C, examDate: '2026-10-12', startTime: '09:00', endTime: '10:00' }], [A, B])), ['SUBJECT_NOT_FOUND']);
        // A subject kept from the saved structure (no longer in the group) is allowed.
        assert.deepStrictEqual(validateSchedule([...ok, { subjectId: C, examDate: '2026-10-12', startTime: '09:00', endTime: '10:00' }], [A, B], [A, B, C]), []);
    },
    'session bounds (EXAM_DATE_OUTSIDE_SESSION)': () => {
        assert.deepStrictEqual(datesOutside([{ examDate: '2026-03-31' }, { examDate: '2026-04-01' }, { examDate: '2027-04-01' }], '2026-04-01', '2027-03-31'), ['2026-03-31', '2027-04-01']);
    },
    'cross-structure clash: overlapping scope AND slot (CROSS_STRUCTURE_TIME_CLASH)': () => {
        assert.deepStrictEqual(intersectScopes({ sectionId: 'x' }, { sectionId: null }), { streamId: null, groupId: null, sectionId: 'x' });
        assert.strictEqual(intersectScopes({ sectionId: 'x' }, { sectionId: 'y' }), null);
        const slot = [{ examDate: '2026-10-10', startTime: '09:00', endTime: '11:00' }];
        assert.ok(schedulesClash(slot, [{ examDate: '2026-10-10', startTime: '10:30', endTime: '12:00' }]));
        assert.ok(!schedulesClash(slot, [{ examDate: '2026-10-10', startTime: '11:00', endTime: '12:00' }]));
        assert.ok(!schedulesClash(slot, [{ examDate: '2026-10-11', startTime: '09:00', endTime: '11:00' }]));
    },
    '12-hour display matches the reference': () => {
        assert.strictEqual(time12('09:00'), '09:00 AM');
        assert.strictEqual(time12('12:00'), '12:00 PM');
        assert.strictEqual(time12('14:30'), '02:30 PM');
        assert.strictEqual(time12('00:15'), '12:15 AM');
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
