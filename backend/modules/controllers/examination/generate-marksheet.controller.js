'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const MarksheetStructureV2Model = require('../../models/examination/marksheet-structure');
const ExamResultModel = require('../../models/examination/exam-result');
const { ConflictError, NotFoundError, ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/examination.messages');
const { logActivity } = require('../../services/activity-log.service');
const { buildLetterheadDocument } = require('../../services/pdf/letterhead.service');
const { buildEnrollmentMatch, resolveSearchStudentIds, loadClassIndex, describePlacement } = require('../../helpers/student/student.utils');
const {
    validateMarks, computeResult, normalizeCoScholastic, bulkRowErrors, passPercentOf,
} = require('../../helpers/examination/exam-rules');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, isObjectId, toObjectId, notFound, fieldErrors, requireSessionId,
    loadSubjectNames, findTemplate, loadCatalog, loadMarksheetStructures, structureKey, isSetUp, initialsOf,
} = require('../../helpers/examination/exam-context');

// Generate Marksheet (examination/generate-marksheet.md). Every student of the session is
// listed; a class without a set-up structure shows "No structure set". Marks are entered
// against that class's Marksheet Structure, validated SERVER-side (errors.md: legacy only
// validated in Angular), and stored as an ExamResult snapshot. Preview/print render the
// snapshot through the shared letterhead header.
//
// Not cached (examination/optimization.md): Marks Status must be right the instant a mark is
// saved. Entering marks needs the 'marksheet' edit grant (routes); every save is logged.

const PRINT_LIMIT = 200;

const shortSession = (label) => String(label || '').replace(/^(\d{4})-\d{2}(\d{2})$/, '$1-$2');

/** Terms of the templates in play: the filtered class(+stream)'s, else every structure's. */
const termsFor = (structures, catalog, { classId, streamId }) => {
    const terms = [];
    structures.forEach((structure) => {
        if (!isSetUp(structure)) return;
        if (classId && String(structure.classId) !== String(classId)) return;
        if (streamId && String(structure.streamId || '') !== String(streamId)) return;
        const template = findTemplate(catalog, structure.templateId);
        (template ? template.terms : []).forEach((term) => { if (!terms.includes(term)) terms.push(term); });
    });
    return terms;
};

/** A structure usable for `term`: set up, template present and includes the term. */
const usableFor = (structure, catalog, term) => {
    if (!isSetUp(structure)) return null;
    const template = findTemplate(catalog, structure.templateId);
    if (!template || !template.terms.includes(term)) return null;
    return template;
};

/** Enrollment match narrowed by "name, admission no. or roll number". */
const searchFilter = async (adminId, search) => {
    const ids = await resolveSearchStudentIds(adminId, search);
    if (ids === null) return null;
    const or = [{ studentId: { $in: ids } }];
    if (/^\d+$/.test(String(search).trim())) or.push({ rollNumber: Number(String(search).trim()) });
    return or;
};

/** GET /marksheets — keyset page of the session's students with their Marks Status. */
let ListMarksheets = async (req, res) => {
    const { adminId, session, search, after, limit } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const [catalog, structures] = await Promise.all([loadCatalog(), loadMarksheetStructures(adminId, sessionId)]);
    const terms = termsFor(structures, catalog, req.query);
    const term = terms.includes(req.query.term) ? req.query.term : (terms[0] || '');

    const baseMatch = buildEnrollmentMatch(adminId, sessionId, { classId: req.query.classId, streamId: req.query.streamId });
    const match = { ...baseMatch };
    const or = await searchFilter(adminId, search);
    if (or) match.$or = or;
    const total = after ? null : await StudentEnrollmentModel.countDocuments(match);
    if (after) match._id = { $gt: toObjectId(after) };

    const found = await StudentEnrollmentModel.find(match, 'studentId classId class streamId sectionId rollNumber')
        .sort({ _id: 1 }).limit(limit + 1).lean();
    const page = found.slice(0, limit);
    const studentIds = page.map((row) => row.studentId);
    const [classIndex, profiles, results] = await Promise.all([
        loadClassIndex(adminId),
        StudentProfileModel.find({ adminId, _id: { $in: studentIds } }, 'name').lean()
            .then((rows) => new Map(rows.map((row) => [String(row._id), row]))),
        term
            ? ExamResultModel.find({ adminId, sessionId: toObjectId(sessionId), term, studentId: { $in: studentIds } }, 'studentId updatedAt').lean()
                .then((rows) => new Map(rows.map((row) => [String(row.studentId), row])))
            : new Map(),
    ]);

    const rows = page.map((enrollment) => {
        const structure = structures.get(structureKey(enrollment.classId, enrollment.streamId));
        const template = term ? usableFor(structure, catalog, term) : null;
        const profile = profiles.get(String(enrollment.studentId)) || {};
        const placement = describePlacement(classIndex, enrollment);
        const result = results.get(String(enrollment.studentId));
        return {
            studentId: String(enrollment.studentId),
            name: profile.name || '—',
            initials: initialsOf(profile.name),
            rollNumber: enrollment.rollNumber,
            classId: String(enrollment.classId),
            streamId: enrollment.streamId ? String(enrollment.streamId) : null,
            className: placement.className,
            streamName: placement.streamName,
            status: !template ? 'nostructure' : (result && template ? 'entered' : 'pending'),
        };
    });

    let summary = null;
    if (!after) {
        // Overview over the class/stream filters (not the search box): one $group of the
        // session's enrollments + one of its results for the term.
        const [byClass, resultsByClass] = await Promise.all([
            StudentEnrollmentModel.aggregate([
                { $match: baseMatch },
                { $group: { _id: { classId: '$classId', streamId: '$streamId' }, count: { $sum: 1 } } },
            ]),
            term ? ExamResultModel.aggregate([
                { $match: { adminId, sessionId: toObjectId(sessionId), term, ...(baseMatch.classId ? { classId: baseMatch.classId } : {}), ...(baseMatch.streamId ? { streamId: baseMatch.streamId } : {}) } },
                { $group: { _id: { classId: '$classId', streamId: '$streamId' }, count: { $sum: 1 } } },
            ]) : [],
        ]);
        const entered = new Map(resultsByClass.map((g) => [structureKey(g._id.classId, g._id.streamId), g.count]));
        summary = { entered: 0, pending: 0, missing: 0 };
        byClass.forEach((group) => {
            const key = structureKey(group._id.classId, group._id.streamId);
            if (term && usableFor(structures.get(key), catalog, term)) {
                const done = Math.min(entered.get(key) || 0, group.count);
                summary.entered += done;
                summary.pending += group.count - done;
            } else {
                summary.missing += group.count;
            }
        });
    }

    return res.status(200).json({
        rows,
        nextCursor: found.length > limit && page.length ? String(page[page.length - 1]._id) : null,
        total,
        summary,
        terms,
        term,
        canEdit: canEditOf(req, PERMISSIONS.MARKSHEET),
    });
};

/**
 * One student's marks context: enrollment (tenant-checked → NOT_FOUND), the class's
 * structure + template for `term` (STRUCTURE_NOT_CONFIGURED), named subjects
 * (SUBJECT_NOT_FOUND if one was deleted).
 */
const loadMarksContext = async (adminId, sessionId, studentId, term) => {
    if (!isObjectId(studentId)) throw notFound({ studentId });
    const [profile, enrollment] = await Promise.all([
        StudentProfileModel.findOne({ adminId, _id: studentId }, 'name fatherName').lean(),
        StudentEnrollmentModel.findOne({ adminId, studentId: toObjectId(studentId), sessionId: toObjectId(sessionId) }).lean(),
    ]);
    if (!profile) throw notFound({ studentId });
    if (!enrollment) throw new NotFoundError(messages.notEnrolled(), { module: MODULE, code: 'NOT_FOUND', context: { studentId } });
    return loadClassContext(adminId, sessionId, enrollment, term, profile);
};

const loadClassContext = async (adminId, sessionId, enrollment, term, profile = null) => {
    const [catalog, structure, classIndex] = await Promise.all([
        loadCatalog(),
        MarksheetStructureV2Model.findOne({ adminId, sessionId: toObjectId(sessionId), classId: enrollment.classId, streamId: enrollment.streamId || null }).lean(),
        loadClassIndex(adminId),
    ]);
    const template = usableFor(structure, catalog, term);
    if (!template) {
        throw new ValidationError(messages.structureNotConfigured(), { module: MODULE, code: 'STRUCTURE_NOT_CONFIGURED' });
    }
    const names = await loadSubjectNames(adminId, structure.subjects.map((s) => s.subjectId));
    if (structure.subjects.some((s) => !names.has(String(s.subjectId)))) {
        throw new NotFoundError(messages.subjectNotFound(), { module: MODULE, code: 'SUBJECT_NOT_FOUND' });
    }
    const subjects = structure.subjects.map((s) => ({
        subjectId: String(s.subjectId), name: names.get(String(s.subjectId)), theoryMax: s.theoryMax, practicalMax: s.practicalMax,
    }));
    return { profile, enrollment, structure, template, subjects, placement: describePlacement(classIndex, enrollment) };
};

const resultView = (result) => (result ? {
    subjects: result.subjects.map((s) => ({ subjectId: String(s.subjectId), theory: s.theory, practical: s.practical })),
    coScholastic: result.coScholastic,
    totals: result.totals,
    updatedAt: result.updatedAt,
} : null);

/** GET /marksheets/:studentId/form?term — what Enter/Edit Marks needs. */
let GetMarksForm = async (req, res) => {
    const { adminId, session, term } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const ctx = await loadMarksContext(adminId, sessionId, req.params.studentId, term);
    const result = await ExamResultModel.findOne({ adminId, sessionId: toObjectId(sessionId), studentId: ctx.enrollment.studentId, term }).lean();
    return res.status(200).json({
        studentId: String(ctx.enrollment.studentId),
        name: ctx.profile.name,
        term,
        terms: ctx.template.terms,
        subjects: ctx.subjects,
        coScholasticAreas: ctx.template.coScholasticAreas,
        gradeRows: ctx.template.gradeRows,
        passPercent: passPercentOf(ctx.template),
        result: resultView(result),
        canEdit: canEditOf(req, PERMISSIONS.MARKSHEET),
    });
};

/** The ExamResult document for one student's validated marks. */
const resultDocument = (adminId, sessionId, ctx, term, marks, coScholastic, actor) => {
    const computed = computeResult(ctx.subjects, marks, ctx.template);
    const terms = ctx.template.terms;
    return {
        adminId,
        sessionId: toObjectId(sessionId),
        studentId: ctx.enrollment.studentId,
        enrollmentId: ctx.enrollment._id,
        classId: ctx.enrollment.classId,
        class: ctx.enrollment.class,
        streamId: ctx.enrollment.streamId || null,
        structureId: ctx.structure._id,
        templateId: ctx.structure.templateId,
        templateCode: ctx.template.code,
        term,
        isAnnual: terms[terms.length - 1] === term,
        className: ctx.placement.className,
        streamName: ctx.placement.streamName,
        subjects: computed.subjects.map((s) => ({ ...s, subjectId: toObjectId(s.subjectId) })),
        coScholastic: normalizeCoScholastic(ctx.template.coScholasticAreas, coScholastic),
        totals: computed.totals,
        updatedBy: actor,
        updatedAt: new Date(),
    };
};

const alreadyEntered = () => new ConflictError(messages.marksAlreadyEntered(), { module: MODULE, code: 'MARKS_ALREADY_ENTERED' });

const sameTime = (a, b) => Boolean(a && b) && new Date(a).getTime() === new Date(b).getTime();

/**
 * PUT /marksheets/:studentId — save one student's marks. A result that exists but wasn't
 * the one the form loaded (`expectedUpdatedAt`) needs `overwrite: true` — never a silent
 * overwrite (errors.md MARKS_ALREADY_ENTERED).
 */
let SaveMarks = async (req, res) => {
    const { adminId, session, term, marks, coScholastic, expectedUpdatedAt, overwrite } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const ctx = await loadMarksContext(adminId, sessionId, req.params.studentId, term);
    const errors = validateMarks(ctx.subjects, marks);
    if (errors.length) throw fieldErrors(errors);

    const filter = { adminId, sessionId: toObjectId(sessionId), studentId: ctx.enrollment.studentId, term };
    const existing = await ExamResultModel.findOne(filter, 'updatedAt').lean();
    if (existing && !overwrite && !sameTime(existing.updatedAt, expectedUpdatedAt)) throw alreadyEntered();

    const actor = actorOf(req);
    const doc = resultDocument(adminId, sessionId, ctx, term, marks, coScholastic, actor);
    let saved;
    try {
        saved = await ExamResultModel.findOneAndUpdate(
            filter,
            { $set: doc, $setOnInsert: { createdBy: actor, createdAt: new Date() } },
            { upsert: true, new: true }
        ).lean();
    } catch (error) {
        // Two first saves racing: the unique index lets one win; the other re-confirms.
        if (error.code === 11000) throw alreadyEntered();
        throw error;
    }
    await logActivity(req, {
        module: MODULE,
        action: 'examination.marks.save',
        targetId: String(saved._id),
        meta: { studentId: String(ctx.enrollment.studentId), term, sessionId: String(sessionId), overwrite: Boolean(existing) },
    });
    return res.status(200).json({ message: messages.marksSaved(ctx.profile.name), result: resultView(saved) });
};

/** POST /marksheets/bulk-form { studentIds, term } — the Bulk Enter grid (one class only). */
let GetBulkForm = async (req, res) => {
    const { adminId, session, term, studentIds } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const { enrollments, ctx } = await loadBulkContext(adminId, sessionId, studentIds, term);
    const [profiles, results] = await Promise.all([
        StudentProfileModel.find({ adminId, _id: { $in: enrollments.map((e) => e.studentId) } }, 'name').lean()
            .then((rows) => new Map(rows.map((row) => [String(row._id), row]))),
        ExamResultModel.find({ adminId, sessionId: toObjectId(sessionId), term, studentId: { $in: enrollments.map((e) => e.studentId) } }).lean()
            .then((rows) => new Map(rows.map((row) => [String(row.studentId), row]))),
    ]);
    return res.status(200).json({
        term,
        className: [ctx.placement.className, ctx.placement.streamName].filter(Boolean).join(' '),
        subjects: ctx.subjects.filter((s) => s.theoryMax != null),
        rows: enrollments.map((e) => {
            const result = results.get(String(e.studentId));
            return {
                studentId: String(e.studentId),
                name: (profiles.get(String(e.studentId)) || {}).name || '—',
                marks: result ? result.subjects.map((s) => ({ subjectId: String(s.subjectId), theory: s.theory })) : [],
                updatedAt: result ? result.updatedAt : null,
            };
        }),
    });
};

/** Enrollments for the selected students — all of ONE class(+stream) — and that class's context. */
const loadBulkContext = async (adminId, sessionId, studentIds, term) => {
    const ids = [...new Set((studentIds || []).filter(isObjectId))];
    const enrollments = await StudentEnrollmentModel.find(
        { adminId, sessionId: toObjectId(sessionId), studentId: { $in: ids.map(toObjectId) } }
    ).lean();
    if (!enrollments.length || enrollments.length !== ids.length) throw notFound({ studentIds: ids });
    const classes = new Set(enrollments.map((e) => structureKey(e.classId, e.streamId)));
    if (classes.size > 1) {
        throw new ValidationError(messages.bulkOneClass(), { module: MODULE, code: 'BULK_ONE_CLASS' });
    }
    const ctx = await loadClassContext(adminId, sessionId, enrollments[0], term);
    return { enrollments, ctx };
};

/**
 * POST /marksheets/bulk — theory marks for many students of one class in ONE bulkWrite.
 * Any invalid cell rejects the whole save with row-level errors (MARKS_ROW_INVALID); the
 * grid highlights them inline. Practical and co-scholastic values already saved are kept.
 */
let SaveBulkMarks = async (req, res) => {
    const { adminId, session, term, rows, overwrite } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const { enrollments, ctx } = await loadBulkContext(adminId, sessionId, rows.map((r) => r.studentId), term);

    const bad = bulkRowErrors(ctx.subjects, rows);
    if (bad.length) {
        throw new ValidationError(messages.marksRowInvalid(bad.length), {
            module: MODULE, code: 'MARKS_ROW_INVALID',
            // Shape #7 rows: one per student, one field per bad cell (field = subjectId).
            rows: bad.map((row) => ({
                studentId: row.studentId, code: 'MARKS_ROW_INVALID', message: row.cells[0].message,
                fields: row.cells.map((cell) => ({ field: cell.subjectId, code: cell.code, message: cell.message })),
            })),
        });
    }

    const byStudent = new Map(enrollments.map((e) => [String(e.studentId), e]));
    const existing = await ExamResultModel.find(
        { adminId, sessionId: toObjectId(sessionId), term, studentId: { $in: enrollments.map((e) => e.studentId) } }
    ).lean();
    const existingBy = new Map(existing.map((r) => [String(r.studentId), r]));
    const stale = rows.filter((row) => {
        const current = existingBy.get(String(row.studentId));
        return current && !sameTime(current.updatedAt, row.expectedUpdatedAt);
    });
    if (stale.length && !overwrite) throw alreadyEntered();

    const actor = actorOf(req);
    const operations = rows.map((row) => {
        const enrollment = byStudent.get(String(row.studentId));
        const previous = existingBy.get(String(row.studentId));
        const previousBy = new Map(((previous && previous.subjects) || []).map((s) => [String(s.subjectId), s]));
        const theoryBy = new Map((row.marks || []).map((m) => [String(m.subjectId), m.theory]));
        const marks = ctx.subjects.map((s) => ({
            subjectId: s.subjectId,
            theory: theoryBy.has(s.subjectId) ? theoryBy.get(s.subjectId) : (previousBy.get(s.subjectId) || {}).theory,
            practical: (previousBy.get(s.subjectId) || {}).practical,
        }));
        const doc = resultDocument(adminId, sessionId, { ...ctx, enrollment }, term, marks, previous ? previous.coScholastic : [], actor);
        return {
            updateOne: {
                filter: { adminId, sessionId: toObjectId(sessionId), studentId: enrollment.studentId, term },
                update: { $set: doc, $setOnInsert: { createdBy: actor, createdAt: new Date() } },
                upsert: true,
            },
        };
    });
    await ExamResultModel.bulkWrite(operations, { ordered: false });
    await logActivity(req, {
        module: MODULE,
        action: 'examination.marks.bulk-save',
        meta: { term, sessionId: String(sessionId), studentIds: rows.map((r) => String(r.studentId)), overwritten: stale.length },
    });
    return res.status(200).json({ message: messages.bulkMarksSaved(rows.length), saved: rows.length });
};

/**
 * POST /marksheets/print { studentIds, term } — the printable marksheets (snapshots + the
 * shared letterhead header once). Students without a saved result are skipped and reported
 * (PRINT_SELECTION_INCOMPLETE).
 */
let PrintMarksheets = async (req, res) => {
    const { adminId, session, term, studentIds } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const ids = [...new Set((studentIds || []).filter(isObjectId))].slice(0, PRINT_LIMIT);
    const [results, profiles, enrollments, letterhead] = await Promise.all([
        ExamResultModel.find({ adminId, sessionId: toObjectId(sessionId), term, studentId: { $in: ids.map(toObjectId) } }).lean(),
        StudentProfileModel.find({ adminId, _id: { $in: ids.map(toObjectId) } }, 'name fatherName').lean()
            .then((rows) => new Map(rows.map((row) => [String(row._id), row]))),
        StudentEnrollmentModel.find({ adminId, sessionId: toObjectId(sessionId), studentId: { $in: ids.map(toObjectId) } }, 'studentId rollNumber').lean()
            .then((rows) => new Map(rows.map((row) => [String(row.studentId), row]))),
        buildLetterheadDocument({ adminId, title: `${String(term).toUpperCase()} EXAM MARKSHEET ${shortSession(session)}`.replace(/EXAM EXAM/, 'EXAM'), fields: [] }),
    ]);
    const byStudent = new Map(results.map((r) => [String(r.studentId), r]));
    const documents = ids.filter((id) => byStudent.has(id)).map((id) => {
        const result = byStudent.get(id);
        const profile = profiles.get(id) || {};
        return {
            studentId: id,
            name: profile.name || '—',
            fatherName: profile.fatherName || '—',
            rollNumber: (enrollments.get(id) || {}).rollNumber,
            className: [result.className, result.streamName].filter(Boolean).join(' '),
            subjects: result.subjects.map((s) => ({
                name: s.name, theory: s.theory, theoryMax: s.theoryMax, practical: s.practical, practicalMax: s.practicalMax, total: s.total, grade: s.grade,
            })),
            totals: result.totals,
            coScholastic: result.coScholastic,
        };
    });
    const skipped = ids.length - documents.length;
    return res.status(200).json({
        header: letterhead.header,
        title: letterhead.title,
        documents,
        skipped: skipped ? { count: skipped, code: 'PRINT_SELECTION_INCOMPLETE', message: messages.printSelectionIncomplete(skipped) } : null,
    });
};

module.exports = { ListMarksheets, GetMarksForm, SaveMarks, GetBulkForm, SaveBulkMarks, PrintMarksheets };
