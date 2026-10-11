'use strict';
const HolidayV2Model = require('../../models/holiday/holiday');
const HolidayTemplateV2Model = require('../../models/holiday/holiday-template');
const { ConflictError, NotFoundError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/holiday.messages');
const { matcher, paginate } = require('../../helpers/staff/lookups');
const {
    MODULE, actorOf, notFound, isDuplicateKey, conflictOn, toTemplateRow, loadTemplates, invalidateTemplates,
} = require('../../helpers/holiday/context');
const { countAssigned, enqueueReconcileToday } = require('../../services/holiday/holiday-calendar');
const { logActivity } = require('../../services/activity-log.service');

// Templates (holiday/templates.md) — named bundles of Holiday ids (dated holidays only).
// Assignment is by reference, so an edit here IS an edit to every assigned person's
// calendar: the per-template cache key is dropped in this same request and today's
// attendance is reconciled again.
const ENTITY = 'Template';

const duplicate = () => conflictOn('name', 'TEMPLATE_DUPLICATE', messages.templateDuplicate());
const rethrowDuplicate = (error) => { if (isDuplicateKey(error)) throw duplicate(); throw error; };

/** Every holiday id must be this school's (never trust ids from the payload). */
const assertOwnHolidays = async (adminId, holidayIds) => {
    if (!holidayIds.length) return;
    const found = await HolidayV2Model.countDocuments({ adminId, _id: { $in: holidayIds } });
    if (found !== holidayIds.length) {
        throw new NotFoundError(messages.holidayNotFound(), {
            module: MODULE, code: 'HOLIDAY_NOT_FOUND',
            fields: [{ field: 'holidayIds', message: messages.holidayNotFound(), code: 'HOLIDAY_NOT_FOUND' }],
        });
    }
};

let GetTemplates = async (req, res) => {
    const { adminId, search, page, limit } = req.query;
    const all = await loadTemplates(adminId);
    const matches = matcher(search);
    const result = paginate(all.filter((row) => matches(row.name)), page, limit);
    // Assigned counts are live (an assignment never touches the template cache).
    const counts = await countAssigned(adminId, result.rows.map((row) => row._id));
    result.rows = result.rows.map((row) => ({ ...row, holidayCount: row.holidayIds.length, assignedCount: counts.get(row._id) || 0 }));
    result.summary = { total: all.length };
    return res.status(200).json(result);
};

/** Name list for the Assign modal's dropdown (holidayIds feed its calendar view). */
let GetTemplateOptions = async (req, res) => {
    const rows = (await loadTemplates(req.query.adminId)).map((row) => ({ _id: row._id, name: row.name, holidayIds: row.holidayIds }));
    return res.status(200).json({ rows });
};

const fieldsOf = (body) => ({ name: body.name, holidayIds: body.holidayIds });

let CreateTemplate = async (req, res) => {
    const { adminId } = req.body;
    await assertOwnHolidays(adminId, req.body.holidayIds);
    const actor = actorOf(req);
    const created = await HolidayTemplateV2Model
        .create({ adminId, ...fieldsOf(req.body), createdBy: actor, updatedBy: actor })
        .catch(rethrowDuplicate);
    await invalidateTemplates(adminId);
    await logActivity(req, { module: MODULE, action: 'holiday.template.create', targetId: String(created._id), meta: fieldsOf(req.body) });
    return res.status(200).json({ message: success.created(ENTITY), template: toTemplateRow(created) });
};

let UpdateTemplate = async (req, res) => {
    const { adminId } = req.body;
    const template = await HolidayTemplateV2Model.findOne({ _id: req.params.id, adminId });
    if (!template) throw notFound(req.params.id);
    await assertOwnHolidays(adminId, req.body.holidayIds);
    const before = { name: template.name, holidayIds: template.holidayIds.map(String) };
    Object.assign(template, fieldsOf(req.body), { updatedBy: actorOf(req), updatedAt: new Date() });
    await template.save().catch(rethrowDuplicate);
    await invalidateTemplates(adminId);
    await enqueueReconcileToday(adminId);
    await logActivity(req, { module: MODULE, action: 'holiday.template.update', targetId: String(template._id), changes: { before, after: fieldsOf(req.body) } });
    return res.status(200).json({ message: success.updated(ENTITY), template: toTemplateRow(template) });
};

/** Blocked while anyone uses it (errors.md shape 6). */
let DeleteTemplate = async (req, res) => {
    const { adminId } = req.query;
    const template = await HolidayTemplateV2Model.findOne({ _id: req.params.id, adminId }, 'name').lean();
    if (!template) throw notFound(req.params.id);
    const id = String(template._id);
    const inUse = (await countAssigned(adminId, [id])).get(id) || 0;
    if (inUse) {
        throw new ConflictError(messages.templateInUse(inUse), {
            module: MODULE, code: 'TEMPLATE_IN_USE', context: { inUse },
            rows: [{ row: 0, code: 'TEMPLATE_IN_USE', assigned: inUse }],
        });
    }
    await HolidayTemplateV2Model.deleteOne({ _id: id, adminId });
    await invalidateTemplates(adminId);
    await logActivity(req, { module: MODULE, action: 'holiday.template.delete', targetId: id, meta: { name: template.name } });
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = {
    GetTemplates,
    GetTemplateOptions,
    CreateTemplate,
    UpdateTemplate,
    DeleteTemplate,
};
