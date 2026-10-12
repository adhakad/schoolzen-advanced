'use strict';
const SalaryGroupV2Model = require('../../models/payroll/salary-group');
const StaffSalaryAssignmentV2Model = require('../../models/payroll/staff-salary-assignment');
const { NotFoundError, ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/payroll.messages');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, personNotFound, findStaff, describeStaff, loadSalaryGroups, offsetPage,
} = require('../../helpers/payroll/context');
const { hasPersonalOverride } = require('../../helpers/payroll/payroll-rules');
const { logActivity } = require('../../services/activity-log.service');

// Assign Salary (assign-salary.md) — puts staff on a pay scale. Never cached: Generate
// Payroll reads the very latest assignment on the next generate (payroll/optimization.md).
// Writes need the explicit 'payroll-assign' grant (routes).

const groupNotFound = () => new NotFoundError(messages.groupNotFound(), {
    module: MODULE, code: 'SALARY_GROUP_NOT_FOUND',
    fields: [{ field: 'salaryGroupId', message: messages.groupNotFound(), code: 'SALARY_GROUP_NOT_FOUND' }],
});
const groupInactive = () => new ValidationError(messages.groupInactive(), {
    module: MODULE, code: 'SALARY_GROUP_INACTIVE',
    fields: [{ field: 'salaryGroupId', message: messages.groupInactive(), code: 'SALARY_GROUP_INACTIVE' }],
});

/** The group being assigned: this school's, and active (errors.md shape 3). */
const loadAssignableGroup = async (adminId, salaryGroupId) => {
    const group = await SalaryGroupV2Model.findOne({ _id: salaryGroupId, adminId }).lean();
    if (!group) throw groupNotFound();
    if (group.status !== 'active') throw groupInactive();
    return group;
};

const toAssignmentCell = (assignment, groups) => {
    if (!assignment) return null;
    const group = groups.get(assignment.salaryGroupId);
    return {
        salaryGroupId: assignment.salaryGroupId,
        // A deleted group is surfaced on the read path (errors.md shape 4) — reassign.
        groupName: group ? group.name : null,
        groupMissing: !group,
        mode: group ? group.mode : null,
        effectiveFrom: assignment.effectiveFrom,
        overrides: assignment.overrides || null,
        hasOverride: group ? hasPersonalOverride(group, assignment.overrides) : false,
    };
};

let GetAssignGrid = async (req, res) => {
    const { adminId, page, limit } = req.query;
    const [people, groupList] = await Promise.all([findStaff(adminId, req.query), loadSalaryGroups(adminId)]);
    const groups = new Map(groupList.map((row) => [row._id, row]));
    const assignments = await StaffSalaryAssignmentV2Model
        .find({ adminId, staffId: { $in: people.rows.map((row) => row._id) } }).lean();
    const byStaff = new Map(assignments.map((row) => [row.staffId, row]));

    const rows = people.rows.map((person) => ({ ...person, assignment: toAssignmentCell(byStaff.get(person._id), groups) }));
    const result = offsetPage(rows, page, limit);
    result.truncated = people.truncated;
    result.summary = {
        staff: rows.length,
        assigned: rows.filter((row) => row.assignment).length,
        withOverride: rows.filter((row) => row.assignment && row.assignment.hasOverride).length,
    };
    result.canEdit = canEditOf(req, PERMISSIONS.ASSIGN);
    return res.status(200).json(result);
};

/** Assign (or Change) one person — group + Effective From + optional per-field overrides. */
let AssignSalary = async (req, res) => {
    const { adminId, staffId, salaryGroupId, effectiveFrom, overrides } = req.body;
    const [people, group] = await Promise.all([describeStaff(adminId, [staffId], true), loadAssignableGroup(adminId, salaryGroupId)]);
    if (!people.get(staffId)) throw personNotFound(staffId);

    const before = await StaffSalaryAssignmentV2Model.findOne({ adminId, staffId }).lean();
    const now = new Date();
    const actor = actorOf(req);
    const saved = await StaffSalaryAssignmentV2Model.findOneAndUpdate(
        { adminId, staffId },
        {
            $set: { salaryGroupId: String(group._id), effectiveFrom, overrides, updatedBy: actor, updatedAt: now },
            $setOnInsert: { createdBy: actor, createdAt: now },
        },
        { upsert: true, new: true }
    ).lean();

    await logActivity(req, {
        module: MODULE, action: 'payroll.assign', targetId: staffId,
        changes: {
            before: before ? { salaryGroupId: before.salaryGroupId, effectiveFrom: before.effectiveFrom, overrides: before.overrides } : null,
            after: { salaryGroupId: saved.salaryGroupId, effectiveFrom: saved.effectiveFrom, overrides: saved.overrides },
        },
    });
    const groups = new Map([[String(group._id), { ...group, _id: String(group._id) }]]);
    return res.status(200).json({ message: messages.assigned(1), assignment: toAssignmentCell(saved, groups) });
};

/**
 * Assign to Selected — one bulkWrite. A bulk assign sets the group + Effective From and
 * leaves anyone's existing personal overrides untouched. Ids that aren't this school's
 * active staff are skipped WITH a reason (errors.md shape 7), never silently dropped.
 */
let BulkAssignSalary = async (req, res) => {
    const { adminId, staffIds, salaryGroupId, effectiveFrom } = req.body;
    const [people, group] = await Promise.all([describeStaff(adminId, staffIds, true), loadAssignableGroup(adminId, salaryGroupId)]);
    const valid = staffIds.filter((id) => people.get(id));
    const skipped = staffIds.filter((id) => !people.get(id))
        .map((staffId) => ({ staffId, errorCode: 'PERSON_NOT_FOUND', reason: messages.personNotFound() }));
    if (!valid.length) {
        throw new NotFoundError(messages.personNotFound(), { module: MODULE, code: 'PERSON_NOT_FOUND', rows: skipped.map((row, i) => ({ row: i, code: row.errorCode, message: row.reason })) });
    }

    const now = new Date();
    const actor = actorOf(req);
    await StaffSalaryAssignmentV2Model.bulkWrite(valid.map((staffId) => ({
        updateOne: {
            filter: { adminId, staffId },
            update: {
                $set: { salaryGroupId: String(group._id), effectiveFrom, updatedBy: actor, updatedAt: now },
                $setOnInsert: { createdBy: actor, createdAt: now, overrides: { basic: null, hra: null, allowances: null, deductions: null } },
            },
            upsert: true,
        },
    })), { ordered: false });

    await logActivity(req, {
        module: MODULE, action: 'payroll.assign.bulk', targetId: String(group._id),
        meta: { salaryGroupId: String(group._id), effectiveFrom, staffIds: valid, skipped: skipped.length },
    });
    return res.status(200).json({
        message: skipped.length ? `${messages.assigned(valid.length)} ${messages.assignSkipped(skipped.length)}` : messages.assigned(valid.length),
        assigned: valid.length,
        skipped,
    });
};

module.exports = {
    GetAssignGrid,
    AssignSalary,
    BulkAssignSalary,
};
