'use strict';
const messages = require('../messages/examination.messages');

// Examination's business rules as PURE functions — no DB, no Redis — so they're unit
// tested directly (scripts/test-examination-v2.js) and the controllers stay thin.
// Each validator returns a list of { field, code, message } (empty = valid).

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// No hardcoded 100 ceiling (errors.md shape 1: some boards score a subject out of 150) —
// only a sanity bound.
const MAX_MARKS_LIMIT = 1000;
const GRADES_CO_SCHOLASTIC = Object.freeze(['A', 'B', 'C']);

const isBlank = (value) => value === null || value === undefined || value === '';
const round1 = (value) => Math.round(value * 10) / 10;
const toMinutes = (time) => {
    const [h, m] = String(time).split(':').map(Number);
    return h * 60 + m;
};

/** "Half-Yearly" → "Half-Yearly Exam"; "Final Exam" stays. The Exam Name `.dd`'s options. */
const examNameForTerm = (term) => (/\bexam$/i.test(String(term).trim()) ? String(term).trim() : `${String(term).trim()} Exam`);

/**
 * Marksheet Structure setup rows: [{ subjectId, theoryMax, practicalMax }] (null = part not
 * examined). Every subject must be a candidate, appear once, and examine at least one part
 * with a positive whole-number max.
 */
const validateMaxes = (subjects, candidateIds) => {
    const errors = [];
    if (!Array.isArray(subjects) || !subjects.length) {
        return [{ field: 'subjects', code: 'SUBJECTS_REQUIRED', message: messages.subjectsRequired() }];
    }
    const candidates = new Set((candidateIds || []).map(String));
    const seen = new Set();
    subjects.forEach((row, i) => {
        const id = String(row.subjectId);
        if (!candidates.has(id)) {
            errors.push({ field: `subjects.${i}.subjectId`, code: 'SUBJECT_NOT_FOUND', message: messages.subjectNotFound() });
            return;
        }
        if (seen.has(id)) {
            errors.push({ field: `subjects.${i}.subjectId`, code: 'SUBJECT_SCHEDULED_TWICE', message: messages.subjectScheduledTwice() });
            return;
        }
        seen.add(id);
        if (isBlank(row.theoryMax) && isBlank(row.practicalMax)) {
            errors.push({ field: `subjects.${i}.theoryMax`, code: 'MARKS_MAX_INVALID', message: messages.marksMaxInvalid() });
            return;
        }
        ['theoryMax', 'practicalMax'].forEach((part) => {
            if (isBlank(row[part])) return;
            const value = Number(row[part]);
            if (!Number.isInteger(value) || value <= 0 || value > MAX_MARKS_LIMIT) {
                errors.push({ field: `subjects.${i}.${part}`, code: 'MARKS_MAX_INVALID', message: messages.marksMaxInvalid() });
            }
        });
    });
    return errors;
};

/** One score against its max. Blank = 0, as the reference saves it. */
const scoreError = (value, max, field) => {
    if (isBlank(value)) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return { field, code: 'MARKS_NEGATIVE', message: messages.marksNegative() };
    // Half marks are allowed; more precision is a typo.
    if (Math.round(n * 2) !== n * 2) return { field, code: 'MARKS_NEGATIVE', message: messages.marksNegative() };
    if (n > max) return { field, code: 'MARKS_EXCEED_MAX', message: messages.marksExceedMax(max) };
    return null;
};

/**
 * Entered marks [{ subjectId, theory, practical }] against the structure's subjects
 * [{ subjectId, theoryMax, practicalMax }]. A part with no max can't carry a score.
 */
const validateMarks = (structureSubjects, entries, prefix = 'marks') => {
    const errors = [];
    const byId = new Map((structureSubjects || []).map((s) => [String(s.subjectId), s]));
    (entries || []).forEach((entry, i) => {
        const subject = byId.get(String(entry.subjectId));
        if (!subject) {
            errors.push({ field: `${prefix}.${i}.subjectId`, code: 'MARKS_SUBJECT_MISMATCH', message: messages.marksSubjectMismatch() });
            return;
        }
        ['theory', 'practical'].forEach((part) => {
            const max = subject[`${part}Max`];
            if (max == null) {
                if (!isBlank(entry[part]) && Number(entry[part]) !== 0) {
                    errors.push({ field: `${prefix}.${i}.${part}`, code: 'MARKS_SUBJECT_MISMATCH', message: messages.marksSubjectMismatch() });
                }
                return;
            }
            const error = scoreError(entry[part], max, `${prefix}.${i}.${part}`);
            if (error) errors.push(error);
        });
    });
    return errors;
};

/** [[grade, min, max], ...] → the grade for a percentage. */
const gradeFor = (percentage, gradeRows) => {
    const rows = (gradeRows || []).slice().sort((a, b) => Number(b[1]) - Number(a[1]));
    const hit = rows.find((row) => percentage >= Number(row[1]));
    return hit ? String(hit[0]) : (rows.length ? String(rows[rows.length - 1][0]) : null);
};

/** Pass mark as a percentage, from the template (T1: 33/100 → 33; T3: 27/80 → 33.75). */
const passPercentOf = (template) => {
    const max = Number(template && template.theoryMax);
    const pass = Number(template && template.theoryPass);
    return max > 0 && pass >= 0 ? (pass / max) * 100 : 33;
};

/**
 * The snapshot a result stores: per-subject totals/grades and the overall line.
 * @param {Array} structureSubjects [{ subjectId, name, theoryMax, practicalMax }]
 * @param {Array} entries           [{ subjectId, theory, practical }]
 * @param {Object} template         { gradeRows, theoryMax, theoryPass }
 */
const computeResult = (structureSubjects, entries, template) => {
    const byId = new Map((entries || []).map((e) => [String(e.subjectId), e]));
    let obtained = 0;
    let max = 0;
    const subjects = (structureSubjects || []).map((s) => {
        const entry = byId.get(String(s.subjectId)) || {};
        const theory = s.theoryMax == null ? null : Number(entry.theory) || 0;
        const practical = s.practicalMax == null ? null : Number(entry.practical) || 0;
        const total = (theory || 0) + (practical || 0);
        const subjectMax = (s.theoryMax || 0) + (s.practicalMax || 0);
        obtained += total;
        max += subjectMax;
        return {
            subjectId: s.subjectId,
            name: s.name,
            theoryMax: s.theoryMax == null ? null : s.theoryMax,
            practicalMax: s.practicalMax == null ? null : s.practicalMax,
            theory,
            practical,
            total,
            grade: gradeFor(subjectMax ? (total / subjectMax) * 100 : 0, template && template.gradeRows),
        };
    });
    const percentage = max ? round1((obtained / max) * 100) : 0;
    return {
        subjects,
        totals: {
            obtained,
            max,
            percentage,
            grade: gradeFor(percentage, template && template.gradeRows),
            result: percentage >= passPercentOf(template) ? 'Pass' : 'Fail',
        },
    };
};

/** Co-scholastic grades, one per template area, A/B/C. Missing → 'A' (the reference default). */
const normalizeCoScholastic = (areas, given) => {
    const byArea = new Map((given || []).map((g) => [String(g.area), String(g.grade)]));
    return (areas || []).map((area) => {
        const grade = byArea.get(area);
        return { area, grade: GRADES_CO_SCHOLASTIC.includes(grade) ? grade : 'A' };
    });
};

/**
 * Bulk Enter Marks rows [{ studentId, marks: [{ subjectId, theory }] }] — theory only.
 * Returns [{ studentId, cells: [{ subjectId, code, message }] }] for rows with any bad cell.
 */
const bulkRowErrors = (structureSubjects, rows) => {
    const byId = new Map((structureSubjects || []).map((s) => [String(s.subjectId), s]));
    const bad = [];
    (rows || []).forEach((row) => {
        const cells = [];
        (row.marks || []).forEach((mark) => {
            const subject = byId.get(String(mark.subjectId));
            if (!subject || subject.theoryMax == null) {
                cells.push({ subjectId: String(mark.subjectId), code: 'MARKS_SUBJECT_MISMATCH', message: messages.marksSubjectMismatch() });
                return;
            }
            const error = scoreError(mark.theory, subject.theoryMax, 'theory');
            if (error) cells.push({ subjectId: String(mark.subjectId), code: error.code, message: error.message });
        });
        if (cells.length) bad.push({ studentId: String(row.studentId), cells });
    });
    return bad;
};

const overlaps = (a, b) => a.examDate === b.examDate
    && toMinutes(a.startTime) < toMinutes(b.endTime)
    && toMinutes(b.startTime) < toMinutes(a.endTime);

/**
 * Admit Card schedule rows [{ subjectId, examDate, startTime, endTime }]. Every required
 * subject must be scheduled exactly once, completely, start < end, no two overlapping.
 * @param {Array<string>} requiredIds the scope's current subjects
 * @param {Array<string>} allowedIds  required + any kept from the saved structure
 */
const validateSchedule = (rows, requiredIds, allowedIds) => {
    const errors = [];
    const allowed = new Set((allowedIds || requiredIds || []).map(String));
    const seen = new Set();
    (rows || []).forEach((row, i) => {
        const id = String(row.subjectId);
        if (!allowed.has(id)) {
            errors.push({ field: `subjects.${i}.subjectId`, code: 'SUBJECT_NOT_FOUND', message: messages.subjectNotFound() });
            return;
        }
        if (seen.has(id)) {
            errors.push({ field: `subjects.${i}.subjectId`, code: 'SUBJECT_SCHEDULED_TWICE', message: messages.subjectScheduledTwice() });
            return;
        }
        seen.add(id);
        if (!DATE_KEY.test(String(row.examDate || '')) || !TIME.test(String(row.startTime || '')) || !TIME.test(String(row.endTime || ''))) {
            errors.push({ field: `subjects.${i}.examDate`, code: 'EXAM_SCHEDULE_INCOMPLETE', message: messages.scheduleIncomplete() });
            return;
        }
        if (toMinutes(row.startTime) >= toMinutes(row.endTime)) {
            errors.push({ field: `subjects.${i}.endTime`, code: 'EXAM_TIME_ORDER_INVALID', message: messages.timeOrderInvalid() });
        }
    });
    (requiredIds || []).map(String).forEach((id) => {
        if (!seen.has(id)) errors.push({ field: `subjects.${id}`, code: 'EXAM_SCHEDULE_INCOMPLETE', message: messages.scheduleIncomplete() });
    });
    if (errors.length) return errors;
    for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
            if (overlaps(rows[i], rows[j])) {
                errors.push({ field: `subjects.${j}.startTime`, code: 'SUBJECT_TIME_CLASH', message: messages.subjectTimeClash() });
            }
        }
    }
    return errors;
};

/** Every exam date outside [startKey, endKey]. */
const datesOutside = (rows, startKey, endKey) => (rows || [])
    .filter((row) => row.examDate < startKey || row.examDate > endKey)
    .map((row) => row.examDate);

/**
 * Can two scopes of the SAME class share a student? Each null = "all". Returns the merged
 * filter (their intersection) or null when they're disjoint.
 */
const intersectScopes = (a, b) => {
    const merged = {};
    for (const key of ['streamId', 'groupId', 'sectionId']) {
        const x = a[key] ? String(a[key]) : null;
        const y = b[key] ? String(b[key]) : null;
        if (x && y && x !== y) return null;
        merged[key] = x || y || null;
    }
    return merged;
};

/** Does any slot of `schedule` overlap any slot of `other`? */
const schedulesClash = (schedule, other) => (schedule || []).some((a) => (other || []).some((b) => overlaps(a, b)));

/** "09:30" → "09:30 AM" (the reference's display). */
const time12 = (time) => {
    if (!TIME.test(String(time || ''))) return '';
    const [h, m] = String(time).split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

module.exports = {
    MAX_MARKS_LIMIT,
    GRADES_CO_SCHOLASTIC,
    examNameForTerm,
    validateMaxes,
    validateMarks,
    gradeFor,
    passPercentOf,
    computeResult,
    normalizeCoScholastic,
    bulkRowErrors,
    validateSchedule,
    datesOutside,
    intersectScopes,
    schedulesClash,
    time12,
};
