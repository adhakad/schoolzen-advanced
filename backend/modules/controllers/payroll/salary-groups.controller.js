'use strict';
const SalaryGroupV2Model = require('../../models/payroll/salary-group');
const StaffSalaryAssignmentV2Model = require('../../models/payroll/staff-salary-assignment');
const PayrollRunV2Model = require('../../models/payroll/payroll-run');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/payroll.messages');
const { matcher, COLLATION } = require('../../helpers/staff/lookups');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, isObjectId, toGroupRow, loadSalaryGroups, invalidateSalaryGroups, offsetPage,
} = require('../../helpers/payroll/context');
const { logActivity } = require('../../services/activity-log.service');

// Salary Groups (salary-groups.md) — the school's pay scales. A small list read from the
// near-static cache; every single-record lookup, write and cascade query is scoped by
// adminId (errors.md, "Critical — tenant isolation"): another school's id reads exactly
// like a missing one.
const ENTITY = 'Salary group';

const notFound = (id) => new NotFoundError(messages.notFound(), { module: MODULE, code: 'SALARY_GROUP_NOT_FOUND', context: { id } });

const duplicate = () => new ConflictError(messages.groupDuplicate(), {
    module: MODULE,
    code: 'SALARY_GROUP_DUPLICATE',
    fields: [{ field: 'name', message: messages.groupDuplicate(), code: 'SALARY_GROUP_DUPLICATE' }],
});
const rethrowDuplicate = (error) => {
    if (error && (error.code === 11000 || /E11000/.test(String(error.message || '')))) throw duplicate();
    throw error;
};

/** Assignments and payroll runs still pointing at each group. */
const usageCounts = async (adminId, groupIds) => {
    const count = (Model) => Model.aggregate([
        { $match: { adminId, salaryGroupId: { $in: groupIds } } },
        { $group: { _id: '$salaryGroupId', count: { $sum: 1 } } },
    ]);
    const [assigned, runs] = await Promise.all([count(StaffSalaryAssignmentV2Model), count(PayrollRunV2Model)]);
    const counts = new Map(groupIds.map((id) => [id, { assigned: 0, payrolls: 0 }]));
    assigned.forEach((row) => { if (counts.has(row._id)) counts.get(row._id).assigned = row.count; });
    runs.forEach((row) => { if (counts.has(row._id)) counts.get(row._id).payrolls = row.count; });
    return counts;
};

let GetSalaryGroups = async (req, res) => {
    const { adminId, search, page, limit } = req.query;
    const all = await loadSalaryGroups(adminId);
    // Search runs over the cached array with the typed text escaped (errors.md shape 9).
    const matches = matcher(search);
    const result = offsetPage(all.filter((row) => matches(row.name)), page, limit);
    const counts = await usageCounts(adminId, result.rows.map((row) => row._id));
    result.rows = result.rows.map((row) => ({ ...row, ...counts.get(row._id) }));
    result.summary = { total: all.length, active: all.filter((row) => row.status === 'active').length };
    result.canEdit = canEditOf(req, PERMISSIONS.VIEW);
    return res.status(200).json(result);
};

/** The Assign Salary dropdown — active groups only (inactive ones are not assignable). */
let GetSalaryGroupOptions = async (req, res) => {
    const rows = (await loadSalaryGroups(req.query.adminId)).filter((row) => row.status === 'active');
    return res.status(200).json({ rows });
};

let GetSalaryGroup = async (req, res) => {
    const { adminId } = req.query;
    if (!isObjectId(req.params.id)) throw notFound(req.params.id);
    const group = await SalaryGroupV2Model.findOne({ _id: req.params.id, adminId }).lean();
    if (!group) throw notFound(req.params.id);
    return res.status(200).json({ salaryGroup: toGroupRow(group) });
};

const groupFields = (body) => ({
    name: body.name,
    mode: body.mode,
    basic: body.basic,
    hra: body.hra,
    allowances: (body.allowances || []).map((c) => ({ name: c.name, amount: c.amount })),
    deductions: (body.deductions || []).map((c) => ({ name: c.name, amount: c.amount })),
    status: body.status,
});

const assertNameFree = async (adminId, name, excludeId) => {
    const query = { adminId, name };
    if (excludeId) query._id = { $ne: excludeId };
    if (await SalaryGroupV2Model.findOne(query, '_id').collation(COLLATION).lean()) throw duplicate();
};

let CreateSalaryGroup = async (req, res) => {
    const { adminId } = req.body;
    await assertNameFree(adminId, req.body.name);
    const actor = actorOf(req);
    const created = await SalaryGroupV2Model
        .create({ adminId, ...groupFields(req.body), createdBy: actor, updatedBy: actor })
        .catch(rethrowDuplicate);
    await invalidateSalaryGroups(adminId);
    await logActivity(req, { module: MODULE, action: 'payroll.group.create', targetId: String(created._id), meta: groupFields(created) });
    return res.status(200).json({ message: success.created(ENTITY), salaryGroup: toGroupRow(created) });
};

/**
 * Edits change only the NEXT generation: generated runs keep their own snapshot, and a
 * person's overrides live on their assignment — nothing here touches either.
 */
let UpdateSalaryGroup = async (req, res) => {
    const { adminId } = req.body;
    if (!isObjectId(req.params.id)) throw notFound(req.params.id);
    const group = await SalaryGroupV2Model.findOne({ _id: req.params.id, adminId });
    if (!group) throw notFound(req.params.id);
    await assertNameFree(adminId, req.body.name, group._id);

    const before = groupFields(group);
    Object.assign(group, groupFields(req.body), { updatedBy: actorOf(req), updatedAt: new Date() });
    await group.save().catch(rethrowDuplicate);
    await invalidateSalaryGroups(adminId);
    await logActivity(req, { module: MODULE, action: 'payroll.group.update', targetId: String(group._id), changes: { before, after: groupFields(group) } });
    return res.status(200).json({ message: success.updated(ENTITY), salaryGroup: toGroupRow(group) });
};

/**
 * Blocked with COUNTS while anyone is assigned (SALARY_GROUP_IN_USE_ASSIGNED) or any payroll
 * was generated from it (SALARY_GROUP_IN_USE_PAYROLL) — historic payslips must stay readable.
 * Unused: typed DELETE required.
 */
let DeleteSalaryGroup = async (req, res) => {
    const { adminId } = req.query;
    if (!isObjectId(req.params.id)) throw notFound(req.params.id);
    const group = await SalaryGroupV2Model.findOne({ _id: req.params.id, adminId }, 'name').lean();
    if (!group) throw notFound(req.params.id);
    const id = String(group._id);

    const counts = (await usageCounts(adminId, [id])).get(id);
    if (counts.assigned) {
        throw new ConflictError(messages.groupInUseAssigned(counts.assigned), {
            module: MODULE, code: 'SALARY_GROUP_IN_USE_ASSIGNED', context: counts,
            rows: [{ row: 0, code: 'SALARY_GROUP_IN_USE_ASSIGNED', assigned: counts.assigned }],
        });
    }
    if (counts.payrolls) {
        throw new ConflictError(messages.groupInUsePayroll(counts.payrolls), {
            module: MODULE, code: 'SALARY_GROUP_IN_USE_PAYROLL', context: counts,
            rows: [{ row: 0, code: 'SALARY_GROUP_IN_USE_PAYROLL', payrolls: counts.payrolls }],
        });
    }
    if (req.query.confirm !== 'DELETE') {
        throw new ValidationError(messages.deleteRequiresConfirm(), {
            module: MODULE, code: 'VALIDATION_FAILED',
            fields: [{ field: 'confirm', message: messages.deleteRequiresConfirm() }],
        });
    }

    await SalaryGroupV2Model.deleteOne({ _id: id, adminId });
    await invalidateSalaryGroups(adminId);
    await logActivity(req, { module: MODULE, action: 'payroll.group.delete', targetId: id, meta: { name: group.name } });
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = {
    GetSalaryGroups,
    GetSalaryGroupOptions,
    GetSalaryGroup,
    CreateSalaryGroup,
    UpdateSalaryGroup,
    DeleteSalaryGroup,
};
