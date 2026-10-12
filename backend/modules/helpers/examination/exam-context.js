'use strict';
const mongoose = require('mongoose');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const SubjectModel = require('../../models/academic-setup/subject');
const AcademicSessionV2Model = require('../../models/settings/academic-session');
const MarksheetStructureV2Model = require('../../models/examination/marksheet-structure');
const { NotFoundError, ValidationError } = require('../../errors');
const messages = require('../messages/examination.messages');
const { findSessionId } = require('../academic-session/session-resolver');
const { loadCatalog } = require('../settings/marksheet-catalog-loader');
const { allows } = require('../../middleware/require-permission');
const { toDateKey } = require('../date-only');
const { examNameForTerm } = require('./exam-rules');

// Shared reads for the four Examination controllers — all from v2 collections only:
// Academic Setup (classes, subject groups, subjects), Settings (sessions, the template
// catalog), Student enrollments, and this module's own structures. No legacy model is
// read or written here (§0).

const MODULE = 'examination';
const { ObjectId } = mongoose.Types;

// The explicit Roles & Permissions grants (models/settings/role.js).
const PERMISSIONS = Object.freeze({
    MARKSHEET_STRUCTURE: 'marksheet-structure',
    MARKSHEET: 'marksheet',
    ADMIT_CARD_STRUCTURE: 'admit-card-structure',
    ADMIT_CARD: 'admit-card',
});

const actorOf = (req) => String((req.user && (req.user.staffId || req.user.id)) || req.staffId || 'admin');
const canEditOf = (req, module) => Boolean(req.permissions && allows(req.permissions, module, 'edit'));
const isObjectId = (value) => ObjectId.isValid(String(value || '')) && String(new ObjectId(String(value))) === String(value);
const toObjectId = (value) => (value ? new ObjectId(String(value)) : null);
const sameId = (a, b) => String(a || '') === String(b || '');
const initialsOf = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();

const notFound = (context) => new NotFoundError(messages.notFound(), { module: MODULE, code: 'NOT_FOUND', context });
const fieldErrors = (errors, message) => new ValidationError(message || errors[0].message, {
    module: MODULE, code: errors[0].code, fields: errors,
});

const requireSessionId = async (adminId, label) => {
    const id = await findSessionId(adminId, label);
    if (!id) throw new NotFoundError(messages.sessionNotFound(), { module: MODULE, code: 'SESSION_NOT_FOUND', context: { label } });
    return id;
};

/** { startKey, endKey } of a session, for EXAM_DATE_OUTSIDE_SESSION. */
const loadSessionRange = async (adminId, sessionId) => {
    const session = await AcademicSessionV2Model.findOne({ adminId, _id: sessionId }, 'startDate endDate').lean();
    return session ? { startKey: toDateKey(session.startDate), endKey: toDateKey(session.endDate) } : null;
};

/** Map<subjectId, name> for the given ids, one query. */
const loadSubjectNames = async (adminId, ids) => {
    const unique = [...new Set((ids || []).map(String))];
    if (!unique.length) return new Map();
    const subjects = await SubjectModel.find({ adminId, _id: { $in: unique.map(toObjectId) } }, 'name').lean();
    return new Map(subjects.map((s) => [String(s._id), s.name]));
};

/**
 * The subjects a scope sits — the union of its subject groups' subjects, in group order.
 * A group narrows to that one group; a stream to that stream's groups; a plain class to its
 * (General) groups.
 */
const loadScopeSubjectIds = async (adminId, { classId, streamId, groupId }) => {
    const filter = { adminId, classId: toObjectId(classId) };
    if (groupId) filter._id = toObjectId(groupId);
    else filter.streamId = streamId ? toObjectId(streamId) : null;
    const groups = await SubjectGroupModel.find(filter, 'subjectIds').sort({ createdAt: 1 }).lean();
    const ids = [];
    groups.forEach((group) => (group.subjectIds || []).forEach((id) => {
        if (!ids.includes(String(id))) ids.push(String(id));
    }));
    return ids;
};

/** Every Class(+Stream) row of the school, in class order (Marksheet Structure's grid). */
const classStreamRows = (tree) => {
    const rows = [];
    tree.forEach((cls) => {
        if (cls.hasStreams && cls.streams.length) {
            cls.streams.forEach((stream) => rows.push({
                classId: cls._id, className: cls.label, streamId: stream._id, streamName: stream.label,
            }));
        } else {
            rows.push({ classId: cls._id, className: cls.label, streamId: null, streamName: null });
        }
    });
    return rows;
};

/** A catalog template by _id, or null. */
const findTemplate = (catalog, templateId) => catalog.find((t) => sameId(t._id, templateId)) || null;

/** The session's marksheet structures, keyed "classId|streamId". */
const loadMarksheetStructures = async (adminId, sessionId, filter = {}) => {
    const rows = await MarksheetStructureV2Model.find({ adminId, sessionId: toObjectId(sessionId), ...filter }).lean();
    return new Map(rows.map((row) => [`${row.classId}|${row.streamId || ''}`, row]));
};

const structureKey = (classId, streamId) => `${classId}|${streamId || ''}`;

/** A structure is "set up" once Examination has chosen its subjects. */
const isSetUp = (structure) => Boolean(structure && (structure.subjects || []).length);

/**
 * The Exam Name options for a scope: its template's terms ("Half-Yearly" → "Half-Yearly
 * Exam"), or the catalog's terms when the class has no template yet.
 */
const examNameOptions = async (adminId, sessionId, classId, streamId) => {
    const catalog = await loadCatalog();
    const structure = classId
        ? await MarksheetStructureV2Model.findOne({ adminId, sessionId: toObjectId(sessionId), classId: toObjectId(classId), streamId: streamId ? toObjectId(streamId) : null }, 'templateId').lean()
        : null;
    const template = structure ? findTemplate(catalog, structure.templateId) : null;
    const terms = template ? template.terms : [...new Set(catalog.flatMap((t) => t.terms))];
    return [...new Set(terms.map(examNameForTerm))];
};

module.exports = {
    MODULE,
    PERMISSIONS,
    actorOf,
    canEditOf,
    isObjectId,
    toObjectId,
    sameId,
    initialsOf,
    notFound,
    fieldErrors,
    requireSessionId,
    loadSessionRange,
    loadSubjectNames,
    loadScopeSubjectIds,
    classStreamRows,
    findTemplate,
    loadCatalog,
    loadMarksheetStructures,
    structureKey,
    isSetUp,
    examNameOptions,
};
