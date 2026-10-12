'use strict';
const MarksheetStructureV2Model = require('../../models/examination/marksheet-structure');
const ExamResultModel = require('../../models/examination/exam-result');
const { ConflictError, NotFoundError, ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/examination.messages');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { withTransaction } = require('../../helpers/with-transaction');
const { logActivity } = require('../../services/activity-log.service');
const { loadClassTree, resolveScope } = require('../../helpers/settings/class-options');
const { validateMaxes } = require('../../helpers/examination/exam-rules');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, toObjectId, notFound, fieldErrors, requireSessionId,
    loadSubjectNames, loadScopeSubjectIds, classStreamRows, findTemplate, loadCatalog,
    loadMarksheetStructures, structureKey, isSetUp,
} = require('../../helpers/examination/exam-context');

// Marksheet Structure (examination/marksheet-structure.md). EVERY Class(+Stream) is shown,
// always — an existence-based grid, not a list of what's configured. The template is
// Settings' (Marksheet Templates); this page picks the subjects and their maxes on the SAME
// v2-marksheet-structure row, never a second model.
//
// Writes need the explicit 'marksheet-structure' edit grant (routes) and are activity-logged.

const labelOf = (row) => [row.className, row.streamName].filter(Boolean).join(' ');

// Rows Settings created before this module existed have no `version` yet — 0 matches them.
const versionMatch = (value) => (Number(value) ? Number(value) : { $in: [0, null] });

const invalidate = (adminId) => cacheService.delPattern(cacheKeys.examination.marksheetStructurePattern(adminId));

/** GET /marksheet-structure — the grid (cached per school+session) + overview. */
let GetMarksheetStructures = async (req, res) => {
    const { adminId, session } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const body = await cacheService.wrap(
        cacheKeys.examination.marksheetStructure(adminId, sessionId),
        cacheService.TTL.NEAR_STATIC_45,
        async () => {
            const [tree, catalog, structures] = await Promise.all([
                loadClassTree(adminId), loadCatalog(), loadMarksheetStructures(adminId, sessionId),
            ]);
            const rows = classStreamRows(tree).map((row) => {
                const structure = structures.get(structureKey(row.classId, row.streamId));
                const template = structure ? findTemplate(catalog, structure.templateId) : null;
                return {
                    ...row,
                    templateCode: template ? template.code : null,
                    subjectsSet: structure ? (structure.subjects || []).length : 0,
                    subjectsTotal: structure ? (structure.subjectIds || []).length : 0,
                    setUp: isSetUp(structure),
                    version: structure ? structure.version || 0 : 0,
                };
            });
            return {
                rows,
                classes: tree.map((cls) => ({ _id: cls._id, label: cls.label, streams: cls.streams.map((s) => ({ _id: s._id, label: s.label })) })),
                summary: { classesTotal: rows.length, setUp: rows.filter((row) => row.setUp).length },
            };
        }
    );
    return res.status(200).json({ ...body, canEdit: canEditOf(req, PERMISSIONS.MARKSHEET_STRUCTURE) });
};

/** The class(+stream)'s structure + template, tenant-checked; throws NOT_FOUND for a foreign class. */
const loadSetupContext = async (adminId, sessionId, classId, streamId) => {
    const scope = await resolveScope(adminId, { classId, streamId }, { requireStream: true });
    const [tree, catalog, structure] = await Promise.all([
        loadClassTree(adminId),
        loadCatalog(),
        MarksheetStructureV2Model.findOne({
            adminId, sessionId: toObjectId(sessionId), classId: toObjectId(scope.classId), streamId: scope.streamId ? toObjectId(scope.streamId) : null,
        }).lean(),
    ]);
    const row = classStreamRows(tree).find((r) => String(r.classId) === String(scope.classId) && String(r.streamId || '') === String(scope.streamId || ''));
    if (!row) throw notFound({ classId, streamId });
    const template = structure ? findTemplate(catalog, structure.templateId) : null;
    if (structure && !template) {
        throw new NotFoundError(messages.templateNotFound(), { module: MODULE, code: 'TEMPLATE_NOT_FOUND' });
    }
    return { scope, row, structure, template };
};

/**
 * GET /marksheet-structure/setup?classId&streamId — what the Set Up modal shows: the template
 * strip, the candidate subjects (Settings' snapshot of the group; the live group when no
 * template is assigned yet, display only), and the current subjects + maxes.
 */
let GetSetup = async (req, res) => {
    const { adminId, session, classId, streamId } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const { scope, row, structure, template } = await loadSetupContext(adminId, sessionId, classId, streamId);
    const candidateIds = structure
        ? (structure.subjectIds || []).map(String)
        : await loadScopeSubjectIds(adminId, { classId: scope.classId, streamId: scope.streamId });
    const names = await loadSubjectNames(adminId, candidateIds);
    const missing = candidateIds.filter((id) => !names.has(id));
    return res.status(200).json({
        classId: String(scope.classId),
        streamId: scope.streamId,
        label: labelOf(row),
        template: template ? {
            code: template.code, terms: template.terms, gradeScale: template.gradeScale,
            theoryMax: template.theoryMax, practicalMax: template.practicalMax,
        } : null,
        // Settings hasn't assigned a template: the page says so and Submit stays disabled.
        notConfigured: template ? null : { code: 'STRUCTURE_NOT_CONFIGURED', message: messages.structureNotConfigured() },
        candidates: candidateIds.filter((id) => names.has(id)).map((id) => ({ subjectId: id, name: names.get(id) })),
        subjectsMissing: missing.length ? { code: 'SUBJECT_NOT_FOUND', message: messages.subjectNotFound() } : null,
        subjects: structure ? (structure.subjects || []).map((s) => ({
            subjectId: String(s.subjectId), theoryMax: s.theoryMax, practicalMax: s.practicalMax,
        })) : [],
        version: structure ? structure.version || 0 : 0,
        canEdit: canEditOf(req, PERMISSIONS.MARKSHEET_STRUCTURE),
    });
};

/**
 * PUT /marksheet-structure — save subjects + maxes. Server-side checks (MARKS_MAX_INVALID,
 * SUBJECT_NOT_FOUND, STRUCTURE_NOT_CONFIGURED), then a conditional write on `version`
 * (STRUCTURE_CHANGED). Results already saved keep their own snapshot.
 */
let SaveSetup = async (req, res) => {
    const { adminId, session, classId, streamId, subjects, version } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const { row, structure, template } = await loadSetupContext(adminId, sessionId, classId, streamId);
    if (!structure || !template) {
        throw new ValidationError(messages.structureNotConfigured(), { module: MODULE, code: 'STRUCTURE_NOT_CONFIGURED' });
    }
    const candidateIds = (structure.subjectIds || []).map(String);
    const names = await loadSubjectNames(adminId, candidateIds);
    const live = candidateIds.filter((id) => names.has(id));
    const errors = validateMaxes(subjects, live);
    if (errors.length) throw fieldErrors(errors, errors[0].code === 'SUBJECTS_REQUIRED' ? messages.subjectsRequired() : undefined);

    const next = subjects.map((s) => ({
        subjectId: toObjectId(s.subjectId),
        theoryMax: s.theoryMax == null || s.theoryMax === '' ? null : Number(s.theoryMax),
        practicalMax: s.practicalMax == null || s.practicalMax === '' ? null : Number(s.practicalMax),
    }));
    const updated = await MarksheetStructureV2Model.findOneAndUpdate(
        { _id: structure._id, adminId, version: versionMatch(version != null ? version : structure.version) },
        { $set: { subjects: next, setupAt: new Date(), updatedBy: actorOf(req), updatedAt: new Date() }, $inc: { version: 1 } },
        { new: true }
    ).lean();
    if (!updated) throw new ConflictError(messages.structureChanged(), { module: MODULE, code: 'STRUCTURE_CHANGED' });

    await invalidate(adminId);
    await logActivity(req, {
        module: MODULE,
        action: 'examination.marksheet-structure.save',
        targetId: String(updated._id),
        meta: { classId: String(updated.classId), streamId: updated.streamId ? String(updated.streamId) : null, sessionId: String(sessionId) },
        changes: {
            before: { subjects: (structure.subjects || []).map((s) => ({ subjectId: String(s.subjectId), theoryMax: s.theoryMax, practicalMax: s.practicalMax })) },
            after: { subjects: next.map((s) => ({ subjectId: String(s.subjectId), theoryMax: s.theoryMax, practicalMax: s.practicalMax })) },
        },
    });
    return res.status(200).json({ message: messages.structureSaved(labelOf(row)), version: updated.version });
};

/**
 * DELETE /marksheet-structure?classId&streamId&version — remove the setup (the template
 * assignment stays, Settings owns it) and the marksheets already generated for the class,
 * in one transaction. The UI confirms by typing DELETE first.
 */
let RemoveSetup = async (req, res) => {
    const { adminId, session, classId, streamId, version } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const { row, structure } = await loadSetupContext(adminId, sessionId, classId, streamId);
    if (!isSetUp(structure)) throw notFound({ classId, streamId });

    const removed = await withTransaction(async (dbSession) => {
        const cleared = await MarksheetStructureV2Model.updateOne(
            { _id: structure._id, adminId, version: versionMatch(version != null ? version : structure.version) },
            { $set: { subjects: [], setupAt: null, updatedBy: actorOf(req), updatedAt: new Date() }, $inc: { version: 1 } },
            { session: dbSession }
        );
        if (cleared.matchedCount !== 1) throw new ConflictError(messages.structureChanged(), { module: MODULE, code: 'STRUCTURE_CHANGED' });
        const results = await ExamResultModel.deleteMany(
            { adminId, sessionId: toObjectId(sessionId), classId: structure.classId, streamId: structure.streamId || null },
            { session: dbSession }
        );
        return results.deletedCount || 0;
    });

    await invalidate(adminId);
    await logActivity(req, {
        module: MODULE,
        action: 'examination.marksheet-structure.remove',
        targetId: String(structure._id),
        meta: { classId: String(structure.classId), streamId: structure.streamId ? String(structure.streamId) : null, sessionId: String(sessionId), resultsRemoved: removed },
    });
    return res.status(200).json({ message: messages.structureRemoved(labelOf(row)), resultsRemoved: removed });
};

module.exports = { GetMarksheetStructures, GetSetup, SaveSetup, RemoveSetup };
