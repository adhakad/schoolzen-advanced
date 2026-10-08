'use strict';
const mongoose = require('mongoose');
const MarksheetTemplateV2Model = require('../../models/settings/marksheet-template');
const MarksheetStructureV2Model = require('../../models/examination/marksheet-structure');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const { NotFoundError } = require('../../errors');
const messages = require('../../helpers/messages/settings.messages');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { getActiveSession } = require('../../helpers/academic-session/session-resolver');
const { loadClassTree, indexTree, scopeLabel, resolveScope } = require('../../helpers/settings/class-options');
const { classTemplateAlreadyAssigned, isDuplicateKey } = require('../../helpers/settings/duplicate-key');
const { seedMarksheetTemplates } = require('../../../scripts/seed-marksheet-templates');

const MODULE = 'settings';

// Settings → Marksheet Templates (settings/settings-marksheet-templates.md, errors.md Page 4).
//
// The catalog (T1–T8) is fixed, seeded data shared by every school. What is per school is
// which class uses which template in the active session — a MarksheetStructure row. `usedBy`
// is always counted live from those rows, never a stored counter. Every structure lookup is
// tenant-scoped ({ adminId, ... }), closing the legacy bare-findOne({_id}) gap.

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const templateNotFound = () => new NotFoundError(messages.templateNotFound(), { module: MODULE, code: 'TEMPLATE_NOT_FOUND' });

/** The global catalog, cached; seeded on first use if a deploy hasn't run the seed yet. */
const loadCatalog = () => cacheService.wrap(cacheKeys.settings.marksheetCatalog(), cacheService.TTL.NEAR_STATIC_45, async () => {
    let templates = await MarksheetTemplateV2Model.find({}).sort({ order: 1 }).lean();
    if (!templates.length) {
        await seedMarksheetTemplates();
        templates = await MarksheetTemplateV2Model.find({}).sort({ order: 1 }).lean();
    }
    return templates.map((t) => ({
        _id: String(t._id), code: t.code, name: t.name, terms: t.terms || [], gradeScale: t.gradeScale,
        theoryMax: t.theoryMax, theoryPass: t.theoryPass, practicalMax: t.practicalMax == null ? null : t.practicalMax,
        coScholasticAreas: t.coScholasticAreas || [], supplyLimit: t.supplyLimit, gradeRows: t.gradeRows || [],
    }));
});

/** A template by catalog code ("T3") or _id. */
const findTemplate = async (ref) => {
    const catalog = await loadCatalog();
    const wanted = String(ref || '').trim();
    const template = catalog.find((t) => t._id === wanted || t.code.toLowerCase() === wanted.toLowerCase());
    if (!template) throw templateNotFound();
    return template;
};

const activeSessionId = async (adminId) => {
    const active = await getActiveSession(adminId);
    return active ? toObjectId(active._id) : null;
};

/** GET /marksheet-templates — the gallery: every template + which of this school's classes use it. */
let GetTemplates = async (req, res) => {
    const adminId = req.query.adminId;
    const [catalog, sessionId, tree] = await Promise.all([loadCatalog(), activeSessionId(adminId), loadClassTree(adminId)]);
    const structures = sessionId
        ? await MarksheetStructureV2Model.find({ adminId, sessionId }, 'classId streamId templateId').lean()
        : [];
    const byId = indexTree(tree);
    const usedBy = new Map();
    structures.forEach((s) => {
        const key = String(s.templateId);
        if (!usedBy.has(key)) usedBy.set(key, []);
        usedBy.get(key).push(scopeLabel(byId, { classId: s.classId, streamId: s.streamId }).replace(/ · All (sections|streams)$/, ''));
    });
    return res.status(200).json({
        templates: catalog.map((t) => ({ ...t, usedBy: (usedBy.get(t._id) || []).length, usedByClasses: usedBy.get(t._id) || [] })),
        classes: tree,
    });
};

/** Everything "Use This Template" needs to say BEFORE the admin confirms. */
const assignmentPreview = async (adminId, { templateId, classId, streamId }) => {
    const template = await findTemplate(templateId);
    const scope = await resolveScope(adminId, { classId, streamId }, { requireStream: true });
    const sessionId = await activeSessionId(adminId);
    const classObjectId = toObjectId(scope.classId);
    const streamObjectId = scope.streamId ? toObjectId(scope.streamId) : null;

    const [groups, existing, usedByOthers] = await Promise.all([
        SubjectGroupModel.find({ adminId, classId: classObjectId, streamId: streamObjectId }, 'subjectIds').lean(),
        sessionId ? MarksheetStructureV2Model.findOne({ adminId, sessionId, classId: classObjectId, streamId: streamObjectId }, 'templateId').lean() : null,
        sessionId ? MarksheetStructureV2Model.countDocuments({
            adminId, sessionId, templateId: toObjectId(template._id),
            $nor: [{ classId: classObjectId, streamId: streamObjectId }],
        }) : 0,
    ]);
    const subjectIds = [...new Set(groups.flatMap((g) => (g.subjectIds || []).map(String)))];
    const catalog = await loadCatalog();
    const existingTemplate = existing ? catalog.find((t) => t._id === String(existing.templateId)) : null;

    return {
        template, sessionId, classObjectId, streamObjectId, subjectIds, existing,
        body: {
            usedByOthers,
            reassignWarning: usedByOthers > 0 ? { code: 'TEMPLATE_REASSIGN_WARNING', message: messages.templateReassignWarning(usedByOthers) } : null,
            existing: existing ? {
                templateId: String(existing.templateId),
                templateCode: existingTemplate ? existingTemplate.code : null,
                sameTemplate: String(existing.templateId) === template._id,
                code: 'CLASS_TEMPLATE_ALREADY_ASSIGNED',
                message: messages.classTemplateAlreadyAssigned(),
                note: messages.templateRegenerateNote(),
            } : null,
            subjectGroupMissing: subjectIds.length === 0
                ? { code: 'SUBJECT_GROUP_MISSING', message: messages.subjectGroupMissing() } : null,
        },
    };
};

/** GET /marksheet-templates/assign-preview?templateId&classId&streamId */
let GetAssignPreview = async (req, res) => {
    const preview = await assignmentPreview(req.query.adminId, req.query);
    return res.status(200).json(preview.body);
};

/**
 * POST /marksheet-templates/assign { templateId, classId, streamId?, replace } — the class's
 * marksheet structure for the active session, built from its subject group. Replacing an
 * existing template needs `replace: true` (CLASS_TEMPLATE_ALREADY_ASSIGNED); generated
 * marksheets keep their own snapshot and aren't changed.
 */
let AssignTemplate = async (req, res) => {
    const { adminId, replace } = req.body;
    const actor = req.staffId || 'system';
    const preview = await assignmentPreview(adminId, req.body);
    const { template, sessionId, classObjectId, streamObjectId, subjectIds, existing, body } = preview;

    if (body.subjectGroupMissing) {
        throw new NotFoundError(messages.subjectGroupMissing(), { module: MODULE, code: 'SUBJECT_GROUP_MISSING' });
    }
    if (!sessionId) throw new NotFoundError(messages.notFound(), { module: MODULE, code: 'NOT_FOUND' });
    if (existing && body.existing.sameTemplate) {
        return res.status(200).json({ message: `${template.code} is already this class's template.`, unchanged: true });
    }
    if (existing && !replace) throw classTemplateAlreadyAssigned();

    const now = new Date();
    const filter = { adminId, sessionId, classId: classObjectId, streamId: streamObjectId };
    try {
        if (existing) {
            // Conditional on the template we previewed: a concurrent change means re-confirm.
            const result = await MarksheetStructureV2Model.updateOne(
                { ...filter, templateId: existing.templateId },
                { $set: { templateId: toObjectId(template._id), subjectIds: subjectIds.map(toObjectId), updatedBy: actor, updatedAt: now } }
            );
            if (result.matchedCount !== 1) throw classTemplateAlreadyAssigned();
        } else {
            await MarksheetStructureV2Model.create({
                ...filter, templateId: toObjectId(template._id), subjectIds: subjectIds.map(toObjectId),
                createdBy: actor, updatedBy: actor,
            });
        }
    } catch (error) {
        if (isDuplicateKey(error)) throw classTemplateAlreadyAssigned();
        throw error;
    }

    return res.status(existing ? 200 : 201).json({
        message: `${template.code} assigned.`,
        ...(body.reassignWarning ? { warning: body.reassignWarning } : {}),
        ...(existing ? { note: messages.templateRegenerateNote() } : {}),
    });
};

module.exports = { GetTemplates, GetAssignPreview, AssignTemplate };
