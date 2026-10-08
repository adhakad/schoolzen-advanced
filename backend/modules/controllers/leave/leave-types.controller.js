'use strict';
const LeaveTypeV2Model = require('../../models/leave/leave-type');
const LeaveLimitV2Model = require('../../models/leave/leave-limit');
const ClassLeaveDefaultV2Model = require('../../models/leave/class-leave-default');
const LeaveRequestV2Model = require('../../models/leave/leave-request');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/leave.messages');
const { matcher, paginate, COLLATION } = require('../../helpers/staff/lookups');
const { MODULE, actorOf, toTypeRow, loadLeaveTypes, loadApplicableTypes } = require('../../helpers/leave/context');
const { isApplicable } = require('../../helpers/leave/leave-rules');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { logActivity } = require('../../services/activity-log.service');

// Leave Create (leave-create.md) — the school's leave types. A small CRUD list read from
// the near-static cache; every single-record lookup is scoped by adminId (errors.md,
// "Critical — tenant isolation"): another school's id reads exactly like a missing one.
const ENTITY = 'Leave type';

const notFound = (id) => new NotFoundError(messages.notFound(), { module: MODULE, context: { id } });
const invalidate = (adminId) => cacheService.delPattern(cacheKeys.leave.typesPattern(adminId));

const duplicate = () => new ConflictError(messages.typeDuplicate(), {
    module: MODULE,
    code: 'LEAVE_TYPE_DUPLICATE',
    fields: [{ field: 'name', message: messages.typeDuplicate(), code: 'LEAVE_TYPE_DUPLICATE' }],
});
const rethrowDuplicate = (error) => {
    if (error && (error.code === 11000 || /E11000/.test(String(error.message || '')))) throw duplicate();
    throw error;
};

/** Assignments (limits + class defaults) and requests still pointing at each type. */
const usageCounts = async (adminId, typeIds) => {
    const count = (Model) => Model.aggregate([
        { $match: { adminId, leaveTypeId: { $in: typeIds } } },
        { $group: { _id: '$leaveTypeId', count: { $sum: 1 } } },
    ]);
    const [limits, defaults, requests] = await Promise.all([count(LeaveLimitV2Model), count(ClassLeaveDefaultV2Model), count(LeaveRequestV2Model)]);
    const counts = new Map(typeIds.map((id) => [id, { assignments: 0, requests: 0 }]));
    limits.concat(defaults).forEach((row) => { if (counts.has(row._id)) counts.get(row._id).assignments += row.count; });
    requests.forEach((row) => { if (counts.has(row._id)) counts.get(row._id).requests = row.count; });
    return counts;
};

let GetLeaveTypes = async (req, res) => {
    const { adminId, search, page, limit } = req.query;
    const all = await loadLeaveTypes(adminId);
    // Search runs over the cached array with the typed text escaped (errors.md shape 9).
    const matches = matcher(search);
    const result = paginate(all.filter((row) => matches(row.name)), page, limit);
    const counts = await usageCounts(adminId, result.rows.map((row) => row._id));
    result.rows = result.rows.map((row) => ({ ...row, ...counts.get(row._id) }));
    result.summary = { total: all.length, active: all.filter((row) => row.status === 'active').length };
    return res.status(200).json(result);
};

/** Dropdown list: every type, or only the active ones a person type may take. */
let GetLeaveTypeOptions = async (req, res) => {
    const { adminId, applicableTo } = req.query;
    const rows = applicableTo ? await loadApplicableTypes(adminId, applicableTo) : await loadLeaveTypes(adminId);
    return res.status(200).json({ rows });
};

const typeFields = (body) => ({
    name: body.name,
    whoCanTake: body.whoCanTake,
    defaultDays: body.defaultDays,
    isPaid: body.isPaid,
    status: body.status,
});

const assertNameFree = async (adminId, name, excludeId) => {
    const query = { adminId, name };
    if (excludeId) query._id = { $ne: excludeId };
    if (await LeaveTypeV2Model.findOne(query, '_id').collation(COLLATION).lean()) throw duplicate();
};

let CreateLeaveType = async (req, res) => {
    const { adminId } = req.body;
    await assertNameFree(adminId, req.body.name);
    const actor = actorOf(req);
    const created = await LeaveTypeV2Model
        .create({ adminId, ...typeFields(req.body), createdBy: actor, updatedBy: actor })
        .catch(rethrowDuplicate);
    await invalidate(adminId);
    await logActivity(req, { module: MODULE, action: 'leave.type.create', targetId: String(created._id), meta: typeFields(created) });
    return res.status(200).json({ message: success.created(ENTITY), leaveType: toTypeRow(created) });
};

/** The person types that already have requests against a type (narrowing guard). */
const requestPersonTypes = (adminId, leaveTypeId) =>
    LeaveRequestV2Model.distinct('personType', { adminId, leaveTypeId });

let UpdateLeaveType = async (req, res) => {
    const { adminId } = req.body;
    const leaveType = await LeaveTypeV2Model.findOne({ _id: req.params.id, adminId });
    if (!leaveType) throw notFound(req.params.id);
    await assertNameFree(adminId, req.body.name, leaveType._id);

    if (req.body.whoCanTake !== leaveType.whoCanTake) {
        const used = await requestPersonTypes(adminId, String(leaveType._id));
        if (used.some((personType) => !isApplicable(req.body.whoCanTake, personType))) {
            throw new ValidationError(messages.typeNarrowBlocked(), {
                module: MODULE,
                code: 'LEAVE_TYPE_NARROW_BLOCKED',
                fields: [{ field: 'whoCanTake', message: messages.typeNarrowBlocked(), code: 'LEAVE_TYPE_NARROW_BLOCKED' }],
            });
        }
    }

    const before = typeFields(leaveType);
    Object.assign(leaveType, typeFields(req.body), { updatedBy: actorOf(req), updatedAt: new Date() });
    await leaveType.save().catch(rethrowDuplicate);
    await invalidate(adminId);
    await logActivity(req, { module: MODULE, action: 'leave.type.update', targetId: String(leaveType._id), changes: { before, after: typeFields(leaveType) } });
    return res.status(200).json({ message: success.updated(ENTITY), leaveType: toTypeRow(leaveType) });
};

/**
 * In use (any assignment OR request) → LEAVE_TYPE_IN_USE with both counts (errors.md
 * shape 6) — entitlements are never silently deleted. Unused: typed DELETE required.
 */
let DeleteLeaveType = async (req, res) => {
    const { adminId } = req.query;
    const leaveType = await LeaveTypeV2Model.findOne({ _id: req.params.id, adminId }, 'name').lean();
    if (!leaveType) throw notFound(req.params.id);
    const id = String(leaveType._id);

    const counts = (await usageCounts(adminId, [id])).get(id);
    if (counts.assignments || counts.requests) {
        throw new ConflictError(messages.typeInUse(counts.assignments, counts.requests), {
            module: MODULE,
            code: 'LEAVE_TYPE_IN_USE',
            context: counts,
            rows: [{ row: 0, code: 'LEAVE_TYPE_IN_USE', assignments: counts.assignments, requests: counts.requests }],
        });
    }

    await LeaveTypeV2Model.deleteOne({ _id: id, adminId });
    await invalidate(adminId);
    await logActivity(req, { module: MODULE, action: 'leave.type.delete', targetId: id, meta: { name: leaveType.name } });
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = {
    GetLeaveTypes,
    GetLeaveTypeOptions,
    CreateLeaveType,
    UpdateLeaveType,
    DeleteLeaveType,
};
