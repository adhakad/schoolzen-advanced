'use strict';
const mongoose = require('mongoose');
const HolidayTemplateV2Model = require('../../models/holiday/holiday-template');
const StaffV2Model = require('../../models/staff/staff');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { ValidationError, ConflictError, NotFoundError } = require('../../errors');
const messages = require('../../helpers/messages/holiday.messages');
const { findPeople } = require('../../helpers/leave/context');
const { MODULE, findSession, loadTemplates } = require('../../helpers/holiday/context');
const { classifySelection } = require('../../helpers/holiday/holiday-rules');
const { assignedTemplates, enqueueReconcileToday } = require('../../services/holiday/holiday-calendar');
const { logActivity } = require('../../services/activity-log.service');
const { allows } = require('../../middleware/require-permission');

// Holiday Assign (holiday/assign.md) — which template each person follows. The assignment is
// `holidayTemplateId` on Staff / StudentEnrollment (session-scoped), no join collection.
//
// Mixed-selection rule, enforced HERE as well as in the UI: Assign is only for people with no
// template, Edit only for people who already have one. A batch that mixes both is rejected
// whole. The write itself is conditional on that state, so a concurrent change can't slip a
// person past the rule between the check and the write.
const { ObjectId } = mongoose.Types;

const sessionRequired = async (adminId, label) => {
    const sessionId = await findSession(adminId, label);
    if (!sessionId) throw new ValidationError(messages.sessionMissing(), { module: MODULE, code: 'SESSION_MISSING' });
    return sessionId;
};

let GetGrid = async (req, res) => {
    const { adminId, session, personType, page, limit } = req.query;
    const sessionId = personType === 'student' ? await sessionRequired(adminId, session) : await findSession(adminId, session);
    const sessionMatch = sessionId ? { adminId, sessionId: new ObjectId(sessionId) } : null;
    const [people, templates, staffTotal, staffAssigned, studentTotal, studentAssigned] = await Promise.all([
        findPeople(adminId, sessionId, req.query),
        loadTemplates(adminId),
        // The side panel's "Staff Assigned x / y" and "Students Assigned x / y".
        StaffV2Model.countDocuments({ adminId, status: 'active' }),
        StaffV2Model.countDocuments({ adminId, status: 'active', holidayTemplateId: { $ne: null } }),
        sessionMatch ? StudentEnrollmentModel.countDocuments(sessionMatch) : 0,
        sessionMatch ? StudentEnrollmentModel.countDocuments({ ...sessionMatch, holidayTemplateId: { $ne: null } }) : 0,
    ]);
    const names = new Map(templates.map((row) => [row._id, row.name]));

    const pageRows = people.rows.slice((page - 1) * limit, page * limit);
    const assigned = await assignedTemplates(adminId, sessionId, pageRows.map((row) => ({ personType, personId: row._id })));
    const rows = pageRows.map((row) => {
        const templateId = assigned.get(`${personType}|${row._id}`) || null;
        return {
            _id: row._id, name: row.name, code: row.code, department: row.department, sub: row.sub,
            templateId, templateName: templateId ? (names.get(templateId) || null) : null,
        };
    });
    return res.status(200).json({
        rows, total: people.rows.length, page, limit, truncated: people.truncated,
        canAssign: Boolean(req.permissions && allows(req.permissions, 'holiday-assign', 'edit')),
        summary: { staff: { assigned: staffAssigned, total: staffTotal }, student: { assigned: studentAssigned, total: studentTotal } },
    });
};

/** Model, filter and person key for one person type. */
const targetOf = (adminId, sessionId, personType, personIds) => (personType === 'staff'
    ? { Model: StaffV2Model, filter: { adminId, _id: { $in: personIds.map((id) => new ObjectId(id)) } } }
    : { Model: StudentEnrollmentModel, filter: { adminId, sessionId: new ObjectId(sessionId), studentId: { $in: personIds.map((id) => new ObjectId(id)) } } });

/** Current template per selected person; PERSON_NOT_FOUND when any is missing or foreign. */
const currentState = async (adminId, sessionId, personType, personIds) => {
    const assigned = await assignedTemplates(adminId, sessionId, personIds.map((personId) => ({ personType, personId })));
    if (assigned.size !== personIds.length) {
        throw new NotFoundError(messages.personNotFound(), { module: MODULE, code: 'PERSON_NOT_FOUND', context: { expected: personIds.length, found: assigned.size } });
    }
    return personIds.map((personId) => ({ personId, templateId: assigned.get(`${personType}|${personId}`) || null }));
};

const selectionConflict = (state, mode) => {
    if (state === 'mixed') return new ConflictError(messages.mixedSelection(), { module: MODULE, code: 'HOLIDAY_ASSIGN_MIXED_SELECTION' });
    if (state === 'edit' && mode === 'assign') return new ConflictError(messages.useEdit(), { module: MODULE, code: 'HOLIDAY_ASSIGN_USE_EDIT' });
    if (state === 'assign' && mode === 'edit') return new ConflictError(messages.useAssign(), { module: MODULE, code: 'HOLIDAY_ASSIGN_USE_ASSIGN' });
    return null;
};

let AssignTemplate = async (req, res) => {
    const { adminId, session, personType, personIds, templateId, mode } = req.body;
    const sessionId = personType === 'student' ? await sessionRequired(adminId, session) : null;

    const template = await HolidayTemplateV2Model.findOne({ _id: templateId, adminId }, 'name').lean();
    if (!template) {
        throw new NotFoundError(messages.templateNotFound(), {
            module: MODULE, code: 'TEMPLATE_NOT_FOUND',
            fields: [{ field: 'templateId', message: messages.templateNotFound(), code: 'TEMPLATE_NOT_FOUND' }],
        });
    }

    const before = await currentState(adminId, sessionId, personType, personIds);
    const conflict = selectionConflict(classifySelection(before), mode);
    if (conflict) throw conflict;

    const { Model, filter } = targetOf(adminId, sessionId, personType, personIds);
    const guard = mode === 'assign' ? { holidayTemplateId: null } : { holidayTemplateId: { $ne: null } };
    const result = await Model.updateMany({ ...filter, ...guard }, { $set: { holidayTemplateId: template._id, updatedAt: new Date() } });
    // Someone else changed part of this selection between the check and the write.
    if (result.matchedCount !== personIds.length) {
        throw new ConflictError(messages.mixedSelection(), { module: MODULE, code: 'HOLIDAY_ASSIGN_MIXED_SELECTION', context: { matched: result.matchedCount } });
    }

    await enqueueReconcileToday(adminId);
    await logActivity(req, {
        module: MODULE,
        action: mode === 'assign' ? 'holiday.assign' : 'holiday.reassign',
        targetId: String(template._id),
        meta: { personType, count: personIds.length, sessionId },
        changes: {
            before: Object.fromEntries(before.map((row) => [row.personId, row.templateId])),
            after: { templateId: String(template._id) },
        },
    });
    const message = mode === 'assign' ? messages.assigned(personIds.length) : messages.reassigned(personIds.length);
    return res.status(200).json({ message, count: personIds.length });
};

/** Back to "Not set" — no dated holidays apply until a template is assigned again. */
let UnassignTemplate = async (req, res) => {
    const { adminId, session, personType, personIds } = req.body;
    const sessionId = personType === 'student' ? await sessionRequired(adminId, session) : null;
    const before = await currentState(adminId, sessionId, personType, personIds);
    const { Model, filter } = targetOf(adminId, sessionId, personType, personIds);
    const result = await Model.updateMany({ ...filter, holidayTemplateId: { $ne: null } }, { $set: { holidayTemplateId: null, updatedAt: new Date() } });

    await enqueueReconcileToday(adminId);
    await logActivity(req, {
        module: MODULE, action: 'holiday.unassign',
        meta: { personType, count: result.modifiedCount, sessionId },
        changes: { before: Object.fromEntries(before.map((row) => [row.personId, row.templateId])), after: { templateId: null } },
    });
    return res.status(200).json({ message: messages.unassigned(result.modifiedCount), count: result.modifiedCount });
};

module.exports = {
    GetGrid,
    AssignTemplate,
    UnassignTemplate,
};
