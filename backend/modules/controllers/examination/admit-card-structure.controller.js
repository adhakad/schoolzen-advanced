'use strict';
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const AdmitCardStructureModel = require('../../models/examination/admit-card-structure');
const AdmitCardModel = require('../../models/examination/admit-card');
const { ConflictError, ExternalServiceError, NotFoundError, ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/examination.messages');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { logActivity } = require('../../services/activity-log.service');
const { getHolidayKeysForPeople } = require('../../services/holiday/holiday-calendar');
const { loadClassTree, indexTree, resolveScope } = require('../../helpers/settings/class-options');
const { validateSchedule, datesOutside, intersectScopes, schedulesClash, time12 } = require('../../helpers/examination/exam-rules');
const { scopeMatch } = require('../../helpers/examination/admit-card-generation');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, isObjectId, toObjectId, notFound, fieldErrors, requireSessionId,
    loadSessionRange, loadSubjectNames, loadScopeSubjectIds, examNameOptions,
} = require('../../helpers/examination/exam-context');

// Admit Card Structure (examination/admit-card-structure.md). A searchable list of CREATED
// exam structures (not an always-shown grid). Create/edit/delete is NOT passive config:
// saving queues the BullMQ job that (re)generates an AdmitCard for every matching student;
// deleting removes them in one deleteMany.
//
// Writes need the explicit 'admit-card-structure' edit grant (routes) and are logged.

const PAGE_SIZE = 25;
// A "generating" structure whose job never reported back (worker down) stops blocking
// edit/delete after this long.
const STALE_GENERATION_MS = 10 * 60 * 1000;
const queue = () => require('../../queues/examination-queue');

const invalidate = (adminId) => cacheService.delPattern(cacheKeys.examination.admitCardStructurePattern(adminId));

const dateText = (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** Class/stream/group/section labels for a structure, from the cached tree + groups. */
const labelsFor = (byId, groupNames, row) => {
    const cls = byId.get(String(row.classId));
    const stream = cls && row.streamId ? cls.streams.find((s) => s._id === String(row.streamId)) : null;
    const sections = stream ? stream.sections : (cls ? cls.sections : []);
    const section = row.sectionId ? sections.find((s) => s._id === String(row.sectionId)) : null;
    return {
        className: cls ? cls.label : 'Class removed',
        streamName: stream ? stream.label : null,
        groupName: row.groupId ? groupNames.get(String(row.groupId)) || null : null,
        sectionName: section ? section.label : null,
    };
};

const generationView = (g) => ({
    state: (g && g.state) || 'ready',
    total: (g && g.total) || 0,
    generated: (g && g.generated) || 0,
    failed: (g && g.failed) || 0,
    message: g && g.state === 'partial' ? messages.generationPartial(g.generated, g.total, g.failed) : null,
});

/** GET /admit-card-structures — offset page over this session's structures, filtered/searched. */
let ListStructures = async (req, res) => {
    const { adminId, session, search, classId, streamId, groupId, sectionId, page } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const filter = { adminId, sessionId: toObjectId(sessionId) };
    if (classId) filter.classId = toObjectId(classId);
    if (streamId) filter.streamId = toObjectId(streamId);
    if (groupId) filter.groupId = toObjectId(groupId);
    if (sectionId) filter.sectionId = toObjectId(sectionId);
    if (search) filter.examName = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const unfiltered = !search && !classId && page === 1;

    const build = async () => {
        const [rows, total, tree, groups, configured] = await Promise.all([
            AdmitCardStructureModel.find(filter, 'classId streamId groupId sectionId examName subjects generation createdAt')
                .sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
            AdmitCardStructureModel.countDocuments(filter),
            loadClassTree(adminId),
            SubjectGroupModel.find({ adminId }, 'name').lean(),
            AdmitCardStructureModel.countDocuments({ adminId, sessionId: toObjectId(sessionId) }),
        ]);
        const byId = indexTree(tree);
        const groupNames = new Map(groups.map((g) => [String(g._id), g.name]));
        return {
            rows: rows.map((row) => ({
                _id: String(row._id),
                examName: row.examName,
                subjectCount: (row.subjects || []).length,
                classId: String(row.classId),
                ...labelsFor(byId, groupNames, row),
                generation: generationView(row.generation),
            })),
            total,
            page,
            pageSize: PAGE_SIZE,
            summary: { classesTotal: tree.length, examsConfigured: configured },
        };
    };
    // Only the unfiltered first page is a reusable shape (examination/optimization.md).
    const body = unfiltered
        ? await cacheService.wrap(cacheKeys.examination.admitCardStructureList(adminId, sessionId), cacheService.TTL.NEAR_STATIC_45, build)
        : await build();
    // A row still generating must not be served stale from cache for long — refresh it live.
    if (unfiltered && body.rows.some((row) => row.generation.state === 'generating')) {
        const live = await AdmitCardStructureModel.find(
            { adminId, _id: { $in: body.rows.map((r) => toObjectId(r._id)) } }, 'generation'
        ).lean();
        const states = new Map(live.map((r) => [String(r._id), generationView(r.generation)]));
        body.rows = body.rows.map((row) => ({ ...row, generation: states.get(row._id) || row.generation }));
    }
    return res.status(200).json({ ...body, canEdit: canEditOf(req, PERMISSIONS.ADMIT_CARD_STRUCTURE) });
};

/** GET /admit-card-structures/options?classId&streamId&groupId — the modal's subject rows + Exam Name options. */
let GetOptions = async (req, res) => {
    const { adminId, session, classId, streamId, groupId } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const scope = await resolveScope(adminId, { classId, streamId });
    if (groupId) await assertGroup(adminId, scope, groupId);
    const [subjectIds, examNames, groups] = await Promise.all([
        loadScopeSubjectIds(adminId, { classId: scope.classId, streamId: scope.streamId, groupId }),
        examNameOptions(adminId, sessionId, scope.classId, scope.streamId),
        SubjectGroupModel.find({ adminId, classId: scope.classId, streamId: scope.streamId ? toObjectId(scope.streamId) : null, isSystemGroup: { $ne: true } }, 'name').sort({ name: 1 }).lean(),
    ]);
    const names = await loadSubjectNames(adminId, subjectIds);
    return res.status(200).json({
        subjects: subjectIds.filter((id) => names.has(id)).map((id) => ({ subjectId: id, name: names.get(id) })),
        examNames,
        groups: groups.map((g) => ({ _id: String(g._id), name: g.name })),
    });
};

/** A group must belong to the scope's class+stream (tenant-checked → NOT_FOUND). */
const assertGroup = async (adminId, scope, groupId) => {
    if (!isObjectId(groupId)) throw notFound({ groupId });
    const group = await SubjectGroupModel.findOne(
        { adminId, _id: toObjectId(groupId), classId: scope.classId, streamId: scope.streamId ? toObjectId(scope.streamId) : null }, '_id'
    ).lean();
    if (!group) throw notFound({ groupId });
};

/** One structure by {_id, adminId} — another school's id reads exactly like a missing one. */
const findOwn = async (adminId, id) => {
    if (!isObjectId(id)) throw notFound({ id });
    const structure = await AdmitCardStructureModel.findOne({ _id: toObjectId(id), adminId }).lean();
    if (!structure) throw notFound({ id });
    return structure;
};

/** GET /admit-card-structures/:id — the View modal + the Edit form. */
let GetStructure = async (req, res) => {
    const { adminId } = req.query;
    const structure = await findOwn(adminId, req.params.id);
    const [names, tree, current] = await Promise.all([
        loadSubjectNames(adminId, structure.subjects.map((s) => s.subjectId)),
        loadClassTree(adminId),
        loadScopeSubjectIds(adminId, structure),
    ]);
    const group = structure.groupId ? await SubjectGroupModel.findOne({ adminId, _id: structure.groupId }, 'name').lean() : null;
    const labels = labelsFor(indexTree(tree), new Map(group ? [[String(group._id), group.name]] : []), structure);
    const stale = structure.subjects.filter((s) => !current.includes(String(s.subjectId)));
    return res.status(200).json({
        _id: String(structure._id),
        classId: String(structure.classId),
        streamId: structure.streamId ? String(structure.streamId) : null,
        groupId: structure.groupId ? String(structure.groupId) : null,
        sectionId: structure.sectionId ? String(structure.sectionId) : null,
        examName: structure.examName,
        ...labels,
        subjects: structure.subjects.map((s) => ({
            subjectId: String(s.subjectId),
            name: names.get(String(s.subjectId)) || '—',
            examDate: s.examDate,
            startTime: s.startTime,
            endTime: s.endTime,
            dateText: dateText(s.examDate),
            timing: `${time12(s.startTime)} – ${time12(s.endTime)}`,
        })),
        // DRAFT SUBJECT_NO_LONGER_IN_GROUP: kept and flagged, never silently dropped.
        staleSubjects: stale.length ? { code: 'SUBJECT_NO_LONGER_IN_GROUP', message: messages.subjectsNoLongerInGroup(stale.length), subjectIds: stale.map((s) => String(s.subjectId)) } : null,
        version: structure.version,
        generation: generationView(structure.generation),
    });
};

/**
 * Every server-side check before a save (errors.md shapes 1/3/9): scope belongs to this
 * school; schedule complete, ordered, no duplicate/clashing subject; dates inside the
 * session; scope not empty; no overlapping exam for the same students in another structure
 * (re-read at write time). A holiday date is a WARNING the admin must acknowledge.
 */
const checkSave = async (adminId, sessionId, body, existing) => {
    const scope = await resolveScope(adminId, { classId: body.classId, streamId: body.streamId, sectionId: body.sectionId });
    if (body.groupId) await assertGroup(adminId, scope, body.groupId);
    const normalized = {
        adminId,
        sessionId: toObjectId(sessionId),
        classId: toObjectId(scope.classId),
        streamId: scope.streamId ? toObjectId(scope.streamId) : null,
        groupId: body.groupId ? toObjectId(body.groupId) : null,
        sectionId: scope.sectionId ? toObjectId(scope.sectionId) : null,
    };

    const required = await loadScopeSubjectIds(adminId, normalized);
    const allowed = [...required, ...(existing ? existing.subjects.map((s) => String(s.subjectId)) : [])];
    const errors = validateSchedule(body.subjects, required, allowed);
    if (errors.length) throw fieldErrors(errors);

    const range = await loadSessionRange(adminId, sessionId);
    if (range) {
        const outside = datesOutside(body.subjects, range.startKey, range.endKey);
        if (outside.length) {
            throw new ValidationError(messages.dateOutsideSession(), {
                module: MODULE, code: 'EXAM_DATE_OUTSIDE_SESSION',
                fields: outside.map((d) => ({ field: 'examDate', code: 'EXAM_DATE_OUTSIDE_SESSION', message: `${dateText(d)}: ${messages.dateOutsideSession()}` })),
            });
        }
    }

    const enrollments = await StudentEnrollmentModel.find(scopeMatch(normalized), 'studentId').lean();
    if (!enrollments.length) {
        throw new ValidationError(messages.scopeEmpty(), { module: MODULE, code: 'EXAM_SCOPE_EMPTY' });
    }

    // Other exams of the same class whose scope can share a student, with a clashing slot.
    const others = await AdmitCardStructureModel.find(
        { adminId, sessionId: toObjectId(sessionId), classId: normalized.classId, ...(existing ? { _id: { $ne: existing._id } } : {}) },
        'examName streamId groupId sectionId subjects'
    ).lean();
    for (const other of others) {
        const merged = intersectScopes(normalized, other);
        if (!merged || !schedulesClash(body.subjects, other.subjects)) continue;
        const shared = await StudentEnrollmentModel.countDocuments(scopeMatch({ ...normalized, ...Object.fromEntries(
            Object.entries(merged).map(([k, v]) => [k, v ? toObjectId(v) : null])
        ) }));
        if (shared) {
            throw new ConflictError(messages.crossStructureClash(shared, other.examName), { module: MODULE, code: 'CROSS_STRUCTURE_TIME_CLASH' });
        }
    }

    const warnings = [];
    const dates = [...new Set(body.subjects.map((s) => s.examDate))].sort();
    const people = enrollments.map((e) => ({ personType: 'student', personId: String(e.studentId) }));
    const holidayKeys = await getHolidayKeysForPeople(adminId, sessionId, people, dates[0], dates[dates.length - 1]);
    const holidayDates = dates.filter((d) => [...holidayKeys.values()].some((set) => set.has(d)));
    if (holidayDates.length) {
        warnings.push({ code: 'EXAM_ON_HOLIDAY', message: messages.examOnHoliday(holidayDates.map(dateText)), dates: holidayDates });
    }
    return { normalized, studentCount: enrollments.length, warnings };
};

const generationBusy = (structure) => structure.generation && structure.generation.state === 'generating'
    && Date.now() - new Date(structure.updatedAt).getTime() < STALE_GENERATION_MS;

const subjectsOf = (rows) => rows.map((s) => ({
    subjectId: toObjectId(s.subjectId), examDate: s.examDate, startTime: s.startTime, endTime: s.endTime,
}));

/** Enqueue generation; Redis down → QUEUE_UNAVAILABLE (the caller decides how to unwind). */
const enqueue = async (adminId, structure) => {
    try {
        return await queue().addAdmitCardJob({ adminId, structureId: structure._id, version: structure.version });
    } catch (error) {
        throw new ExternalServiceError(messages.queueUnavailable(), { module: MODULE, code: 'QUEUE_UNAVAILABLE', context: { reason: error.message } });
    }
};

const duplicate = () => new ConflictError(messages.structureDuplicate(), {
    module: MODULE, code: 'EXAM_STRUCTURE_DUPLICATE', fields: [{ field: 'examName', code: 'EXAM_STRUCTURE_DUPLICATE', message: messages.structureDuplicate() }],
});

const warningsBlock = (warnings) => new ConflictError(warnings[0].message, {
    module: MODULE, code: warnings[0].code, fields: warnings.map((w) => ({ field: 'examDate', code: w.code, message: w.message })),
});

/** POST /admit-card-structures — create + queue generation. 202 + jobId. */
let CreateStructure = async (req, res) => {
    const { adminId, session, examName, subjects, acknowledgeWarnings } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const { normalized, studentCount, warnings } = await checkSave(adminId, sessionId, req.body, null);
    if (warnings.length && !acknowledgeWarnings) throw warningsBlock(warnings);

    const enrollment = await StudentEnrollmentModel.findOne(scopeMatch(normalized), 'class').lean();
    let structure;
    try {
        structure = (await AdmitCardStructureModel.create({
            ...normalized,
            class: enrollment.class,
            examName,
            subjects: subjectsOf(subjects),
            version: 1,
            generation: { state: 'generating', total: studentCount },
            createdBy: actorOf(req),
            updatedBy: actorOf(req),
        })).toObject();
    } catch (error) {
        if (error.code === 11000) throw duplicate();
        throw error;
    }
    let jobId;
    try {
        jobId = await enqueue(adminId, structure);
    } catch (error) {
        // Nothing generated and nothing will be — don't leave a structure that looks saved.
        await AdmitCardStructureModel.deleteOne({ _id: structure._id, adminId });
        throw error;
    }
    await AdmitCardStructureModel.updateOne({ _id: structure._id }, { $set: { 'generation.jobId': jobId } });
    await invalidate(adminId);
    await logActivity(req, {
        module: MODULE,
        action: 'examination.admit-card-structure.create',
        targetId: String(structure._id),
        meta: { examName, sessionId: String(sessionId), classId: String(normalized.classId), students: studentCount },
    });
    return res.status(202).json({ message: messages.admitStructureCreated(studentCount), _id: String(structure._id), jobId, students: studentCount });
};

/**
 * PUT /admit-card-structures/:id — conditional on `version` (STRUCTURE_CHANGED), blocked
 * while its own job is running (GENERATION_IN_PROGRESS). Bumps the version and queues
 * regeneration; cards already printed keep their old snapshot on paper.
 */
let UpdateStructure = async (req, res) => {
    const { adminId, session, examName, subjects, version, acknowledgeWarnings } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const existing = await findOwn(adminId, req.params.id);
    if (String(existing.sessionId) !== String(sessionId)) throw notFound({ id: req.params.id });
    if (generationBusy(existing)) {
        throw new ConflictError(messages.generationInProgress('editing'), { module: MODULE, code: 'GENERATION_IN_PROGRESS' });
    }
    if (existing.version !== version) throw new ConflictError(messages.structureChanged(), { module: MODULE, code: 'STRUCTURE_CHANGED' });

    const { normalized, studentCount, warnings } = await checkSave(adminId, sessionId, req.body, existing);
    if (warnings.length && !acknowledgeWarnings) throw warningsBlock(warnings);

    let updated;
    try {
        updated = await AdmitCardStructureModel.findOneAndUpdate(
            { _id: existing._id, adminId, version },
            {
                $set: {
                    ...normalized, examName, subjects: subjectsOf(subjects),
                    generation: { state: 'generating', total: studentCount, generated: 0, failed: 0, jobId: null, finishedAt: null },
                    updatedBy: actorOf(req), updatedAt: new Date(),
                },
                $inc: { version: 1 },
            },
            { new: true }
        ).lean();
    } catch (error) {
        if (error.code === 11000) throw duplicate();
        throw error;
    }
    if (!updated) throw new ConflictError(messages.structureChanged(), { module: MODULE, code: 'STRUCTURE_CHANGED' });

    let jobId;
    try {
        jobId = await enqueue(adminId, updated);
    } catch (error) {
        // The edit is saved; mark it so the page shows it needs another save to regenerate.
        await AdmitCardStructureModel.updateOne({ _id: updated._id, version: updated.version }, { $set: { 'generation.state': 'failed' } });
        await invalidate(adminId);
        throw error;
    }
    await AdmitCardStructureModel.updateOne({ _id: updated._id, version: updated.version }, { $set: { 'generation.jobId': jobId } });
    await invalidate(adminId);
    await logActivity(req, {
        module: MODULE,
        action: 'examination.admit-card-structure.update',
        targetId: String(updated._id),
        meta: { sessionId: String(sessionId), students: studentCount, version: updated.version },
        changes: {
            before: { examName: existing.examName, subjects: existing.subjects.map((s) => ({ subjectId: String(s.subjectId), examDate: s.examDate, startTime: s.startTime, endTime: s.endTime })) },
            after: { examName, subjects },
        },
    });
    return res.status(202).json({ message: messages.admitStructureUpdated(studentCount), _id: String(updated._id), jobId, students: studentCount, version: updated.version });
};

/** DELETE /admit-card-structures/:id — one deleteMany of its cards, then the structure. */
let DeleteStructure = async (req, res) => {
    const { adminId } = req.query;
    const existing = await findOwn(adminId, req.params.id);
    if (generationBusy(existing)) {
        throw new ConflictError(messages.generationInProgress('deleting'), { module: MODULE, code: 'GENERATION_IN_PROGRESS' });
    }
    const removed = await AdmitCardModel.deleteMany({ adminId, structureId: existing._id });
    await AdmitCardStructureModel.deleteOne({ _id: existing._id, adminId });
    await invalidate(adminId);
    await logActivity(req, {
        module: MODULE,
        action: 'examination.admit-card-structure.delete',
        targetId: String(existing._id),
        meta: { examName: existing.examName, cardsRemoved: removed.deletedCount || 0 },
    });
    return res.status(200).json({ message: messages.admitStructureDeleted(existing.examName), cardsRemoved: removed.deletedCount || 0 });
};

/** GET /jobs/:jobId — generation progress for the page's poll. */
let GetJobStatus = async (req, res) => {
    let job = null;
    try {
        job = await queue().examinationQueue.getJob(req.params.jobId);
    } catch (error) {
        job = null;
    }
    if (!job || String(job.data.adminId) !== String(req.query.adminId)) {
        throw new NotFoundError(messages.jobNotFound(), { module: MODULE, context: { jobId: req.params.jobId } });
    }
    const state = await job.getState();
    const result = state === 'completed' ? job.returnvalue : null;
    return res.status(200).json({
        jobId: job.id,
        name: job.name,
        state,
        progress: typeof job.progress === 'number' ? job.progress : 0,
        result,
        error: state === 'failed' ? messages.queueUnavailable() : (result && result.failed ? messages.generationPartial(result.generated, result.total, result.failed) : null),
    });
};

module.exports = { ListStructures, GetOptions, GetStructure, CreateStructure, UpdateStructure, DeleteStructure, GetJobStatus };
