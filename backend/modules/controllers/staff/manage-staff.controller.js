'use strict';
const mongoose = require('mongoose');
const StaffV2Model = require('../../models/staff/staff');
const DepartmentV2Model = require('../../models/staff/department');
const DesignationV2Model = require('../../models/staff/designation');
const RoleAssignmentModel = require('../../models/settings/role-assignment');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/staff.messages');
const settingsCache = require('../../helpers/settings/cache-invalidation');
const { empCodeDuplicate, cardDuplicate, rethrowDuplicate } = require('../../helpers/staff/duplicate-key');
const { staffCounts } = require('../../helpers/staff/dependents');
const { escapeRegExp } = require('../../helpers/staff/lookups');
const { withTransaction } = require('../../helpers/with-transaction');
const { logActivity } = require('../../services/activity-log.service');

const MODULE = 'staff';
const ENTITY = 'Staff member';

// Lazy: the queue module opens the Redis connection at require-time.
const queue = () => require('../../queues/student-queue');

// Manage Staff (manage-staff.md). Offset pagination is deliberate: a school's staff stays in
// the hundreds, one of performance-principles.md's named bounded-list exceptions.

// The table's columns only (optimization.md, field projection).
const LIST_FIELDS = 'name empCode departmentId designationId department designation joiningDate status cardNumber verifyMode isOwner';

const actorOf = (req) => String((req.user && req.user.id) || req.adminId || 'admin');
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const notFound = (id) => new NotFoundError(messages.staffNotFound(), { module: MODULE, context: { id } });

/** "•• 8821" — the list never ships a full card number to the browser. */
const maskCard = (card) => (card ? `•• ${String(card).slice(-4)}` : null);

const toRow = (staff) => ({
    _id: String(staff._id),
    name: staff.name,
    empCode: staff.empCode || null,
    departmentId: staff.departmentId || null,
    designationId: staff.designationId || null,
    department: staff.department || null,
    designation: staff.designation || null,
    joiningDate: staff.joiningDate || null,
    status: staff.status,
    card: maskCard(staff.cardNumber),
    verifyMode: staff.verifyMode,
    isOwner: Boolean(staff.isOwner),
});

let ListStaff = async (req, res) => {
    const { adminId, search, departmentId, designationId, status, page, limit } = req.query;
    // Terminated staff stay resolvable by id for history, never in the list.
    const filter = { adminId, status: status || { $ne: 'terminated' } };
    if (departmentId) filter.departmentId = departmentId;
    if (departmentId && designationId) filter.designationId = designationId;
    if (search) {
        const pattern = new RegExp(escapeRegExp(search), 'i');
        filter.$or = [{ name: pattern }, { empCode: pattern }];
    }

    const live = { adminId, status: { $ne: 'terminated' } };
    const [rows, total, staffTotal, cardsAssigned] = await Promise.all([
        StaffV2Model.find(filter, LIST_FIELDS).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
        StaffV2Model.countDocuments(filter),
        // The side card — school-wide, independent of the toolbar filters.
        StaffV2Model.countDocuments(live),
        StaffV2Model.countDocuments({ ...live, cardNumber: { $type: 'string' } }),
    ]);
    return res.status(200).json({ rows: rows.map(toRow), total, page, limit, summary: { total: staffTotal, cardsAssigned } });
};

let GetStaff = async (req, res) => {
    const staff = await StaffV2Model.findOne({ _id: req.params.id, adminId: req.query.adminId }, `${LIST_FIELDS} education`).lean();
    if (!staff) throw notFound(req.params.id);
    return res.status(200).json({ staff: { ...toRow(staff), education: staff.education || null } });
};

// ---------------------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------------------

const fieldError = (code, field, message) => new ValidationError(message, { module: MODULE, code, fields: [{ field, message, code }] });

/**
 * Department/Designation references (errors.md shape 3): a designation needs a department
 * (DESIGNATION_REQUIRES_DEPARTMENT — enforced here too, a direct API call skips the form),
 * both must be this school's, and the designation must not belong to a DIFFERENT department.
 * Returns the display names Staff keeps as copies.
 */
const resolveRefs = async (adminId, departmentId, designationId) => {
    if (designationId && !departmentId) {
        throw fieldError('DESIGNATION_REQUIRES_DEPARTMENT', 'designationId', messages.designationRequiresDepartment());
    }
    const [department, designation] = await Promise.all([
        departmentId ? DepartmentV2Model.findOne({ _id: departmentId, adminId }, 'name').lean() : null,
        designationId ? DesignationV2Model.findOne({ _id: designationId, adminId }, 'title departmentId').lean() : null,
    ]);
    if (departmentId && !department) throw fieldError('STAFF_DEPARTMENT_INVALID', 'departmentId', messages.staffDepartmentInvalid());
    if (designationId && !designation) throw fieldError('STAFF_DESIGNATION_INVALID', 'designationId', messages.staffDesignationInvalid());
    if (designation && designation.departmentId && designation.departmentId !== departmentId) {
        throw fieldError('STAFF_DESIGNATION_INVALID', 'designationId', messages.designationNotInDepartment());
    }
    return { department: department ? department.name : null, designation: designation ? designation.title : null };
};

const assertEmpCodeFree = async (adminId, empCode, excludeId) => {
    if (!empCode) return;
    const query = { adminId, empCode };
    if (excludeId) query._id = { $ne: excludeId };
    if (await StaffV2Model.exists(query)) throw empCodeDuplicate();
};

let CreateStaff = async (req, res) => {
    const { adminId, name, empCode, departmentId, designationId, joiningDate, education, status } = req.body;
    const names = await resolveRefs(adminId, departmentId, designationId);
    await assertEmpCodeFree(adminId, empCode);

    const actor = actorOf(req);
    const staff = await StaffV2Model.create({
        adminId, name, empCode, departmentId, designationId, joiningDate, education, status,
        ...names,
        createdBy: actor,
        updatedBy: actor,
    }).catch((error) => rethrowDuplicate(error, empCodeDuplicate));

    return res.status(200).json({ message: success.created(ENTITY), staff: toRow(staff) });
};

// Fields whose change ripples into payroll categorisation / payslip labels — audited.
const AUDITED = ['empCode', 'departmentId', 'designationId', 'department', 'designation'];

let UpdateStaff = async (req, res) => {
    const { adminId, name, empCode, departmentId, designationId, joiningDate, education, status } = req.body;
    // adminId / isOwner are never updatable — the filter pins the tenant, and only the
    // fields below are written.
    const staff = await StaffV2Model.findOne({ _id: req.params.id, adminId, status: { $ne: 'terminated' } });
    if (!staff) throw notFound(req.params.id);
    if (staff.isOwner && status !== 'active') {
        throw fieldError('STAFF_OWNER_PROTECTED', 'status', messages.ownerProtected());
    }

    const names = await resolveRefs(adminId, departmentId, designationId);
    await assertEmpCodeFree(adminId, empCode, staff._id);

    const before = {};
    AUDITED.forEach((field) => { before[field] = staff[field] || null; });

    Object.assign(staff, { name, empCode, departmentId, designationId, joiningDate, education, status, ...names });
    staff.updatedBy = actorOf(req);
    staff.updatedAt = new Date();
    await staff.save().catch((error) => rethrowDuplicate(error, empCodeDuplicate));

    const changed = AUDITED.filter((field) => (staff[field] || null) !== before[field]);
    if (changed.length) {
        const pick = (source) => Object.fromEntries(changed.map((field) => [field, source[field] || null]));
        await logActivity(req, { module: MODULE, action: 'staff.update', targetId: staff._id, changes: { before: pick(before), after: pick(staff) } });
    }

    return res.status(200).json({ message: success.updated(ENTITY), staff: toRow(staff) });
};

/** Active ⇄ Inactive only — any other value is a 400, never a silent deactivation. */
let ChangeStatus = async (req, res) => {
    const { adminId, status } = req.body;
    const staff = await StaffV2Model.findOne({ _id: req.params.id, adminId, status: { $ne: 'terminated' } }, 'isOwner status');
    if (!staff) throw notFound(req.params.id);
    if (staff.isOwner && status !== 'active') throw fieldError('STAFF_OWNER_PROTECTED', 'status', messages.ownerProtected());

    staff.status = status;
    staff.updatedBy = actorOf(req);
    staff.updatedAt = new Date();
    await staff.save();
    return res.status(200).json({ message: messages.statusChanged(status), status });
};

// ---------------------------------------------------------------------------------------
// Delete — soft terminate (errors.md: history keeps pointing at this row)
// ---------------------------------------------------------------------------------------

/**
 * Login / role access revocation is its OWN explicit, audited step — never an implicit side
 * effect of a delete (errors.md, "confirmed auth bypass"). Today v2 access is RoleAssignment;
 * when unified Staff login lands, its credential/session revocation goes here too.
 */
const revokeStaffAccess = async (req, { adminId, staffId, reason, dbSession }) => {
    const removed = await RoleAssignmentModel.deleteMany({ adminId, staffId: toObjectId(staffId) }, { session: dbSession });
    return { roleAssignmentsRemoved: removed.deletedCount || 0, reason };
};

const blockedCode = (counts) => {
    if (counts.biometric) return 'STAFF_IN_USE_BIOMETRIC';
    if (counts.payroll || counts.salaryStructure) return 'STAFF_IN_USE_PAYROLL';
    if (counts.leave) return 'STAFF_IN_USE_LEAVE';
    return null;
};

/**
 * Terminate one staff member: cascade checks first (errors.md shape 6), then ONE transaction
 * that marks the row terminated and revokes access. Returns the per-row outcome — a business
 * refusal is an outcome, not a throw, so the bulk path can report each row.
 */
const terminateOne = async (req, adminId, id) => {
    const staff = await StaffV2Model.findOne({ _id: id, adminId, status: { $ne: 'terminated' } }, 'name empCode isOwner').lean();
    if (!staff) return { id, status: 'not_found', code: 'NOT_FOUND', message: messages.staffNotFound() };
    if (staff.isOwner) return { id, status: 'blocked', code: 'STAFF_OWNER_PROTECTED', message: messages.ownerProtected() };

    const staffId = String(staff._id);
    const counts = await staffCounts(adminId, staffId);
    const code = blockedCode(counts);
    if (code) return { id, status: 'blocked', code, message: messages.staffInUse(counts), counts };

    const now = new Date();
    const actor = actorOf(req);
    const revoked = await withTransaction(async (dbSession) => {
        await StaffV2Model.updateOne(
            { _id: staffId, adminId },
            {
                $set: {
                    status: 'terminated', terminatedAt: now, terminatedBy: actor,
                    // Frees the code for reuse — the unique indexes only cover live values.
                    archivedEmpCode: staff.empCode || null, empCode: null, cardNumber: null,
                    updatedBy: actor, updatedAt: now,
                },
            },
            { session: dbSession }
        );
        return revokeStaffAccess(req, { adminId, staffId, reason: 'terminated', dbSession });
    });
    await settingsCache.onAssignmentChanged(adminId, staffId);
    await logActivity(req, {
        module: MODULE,
        action: 'staff.access.revoke',
        targetId: staffId,
        meta: { revokedBy: actor, revokedAt: now, reason: 'terminated', ...revoked },
    });
    await logActivity(req, { module: MODULE, action: 'staff.terminate', targetId: staffId, meta: { name: staff.name } });
    return { id, status: 'deleted', accessRevoked: true, ...revoked };
};

let DeleteStaff = async (req, res) => {
    const outcome = await terminateOne(req, req.query.adminId, req.params.id);
    if (outcome.status === 'not_found') throw notFound(req.params.id);
    if (outcome.status === 'blocked') {
        throw new ConflictError(outcome.message, { module: MODULE, code: outcome.code, context: outcome.counts });
    }
    return res.status(200).json({ message: messages.staffTerminated(), ...outcome });
};

/**
 * Delete Selected — one request for the whole selection, per-row outcomes. Sequential: each
 * row is its own small transaction, and the selection is bounded (max 100).
 */
let BulkDeleteStaff = async (req, res) => {
    const { adminId } = req.body;
    const ids = [...new Set(req.body.ids.map(String))];
    const results = [];
    for (const id of ids) results.push(await terminateOne(req, adminId, id));
    const tally = (status) => results.filter((row) => row.status === status).length;
    const deletedCount = tally('deleted');
    return res.status(200).json({
        message: `${deletedCount} of ${ids.length} staff removed.`,
        deletedCount,
        blockedCount: tally('blocked'),
        notFoundCount: tally('not_found'),
        results,
    });
};

// ---------------------------------------------------------------------------------------
// Cards — saved here, pushed to the devices by a background job (never inline WDMS calls)
// ---------------------------------------------------------------------------------------

const syncJob = (adminId, staffIds, reason) =>
    queue().addDeviceSyncJob({ adminId, personType: 'staff', personIds: staffIds.map(String), reason });

/** Assign Card — single or bulk, per-row outcomes (same contract as Student's). */
let AssignCards = async (req, res) => {
    const { adminId, items, verifyMode } = req.body;
    const ids = items.map((item) => toObjectId(item.staffId));
    const [found, taken] = await Promise.all([
        StaffV2Model.find({ adminId, _id: { $in: ids }, status: { $ne: 'terminated' } }, '_id').lean(),
        StaffV2Model.find({ adminId, cardNumber: { $in: items.map((item) => item.cardNumber) }, _id: { $nin: ids } }, 'cardNumber').lean(),
    ]);
    const foundSet = new Set(found.map((row) => String(row._id)));
    const takenSet = new Set(taken.map((row) => row.cardNumber));
    const cardMessage = messages.cardAlreadyAssigned();

    const rows = [];
    let writable = [];
    items.forEach((item) => {
        if (!foundSet.has(String(item.staffId))) rows.push({ staffId: item.staffId, code: 'NOT_FOUND', message: messages.staffNotFound() });
        else if (takenSet.has(item.cardNumber)) rows.push({ staffId: item.staffId, code: 'CARD_ALREADY_ASSIGNED', message: `Card ${item.cardNumber}: ${cardMessage}` });
        else writable.push(item);
    });

    // ordered:false — a card lost to a concurrent assign fails only its own row.
    const now = new Date();
    try {
        if (writable.length) {
            await StaffV2Model.bulkWrite(writable.map((item) => ({
                updateOne: {
                    filter: { _id: toObjectId(item.staffId), adminId },
                    update: { $set: { cardNumber: item.cardNumber, verifyMode, updatedAt: now } },
                },
            })), { ordered: false });
        }
    } catch (error) {
        if (!error.writeErrors) throw error;
        const failed = new Set([].concat(error.writeErrors).map((writeError) => writeError.index));
        writable.forEach((item, index) => {
            if (failed.has(index)) rows.push({ staffId: item.staffId, code: 'CARD_ALREADY_ASSIGNED', message: `Card ${item.cardNumber}: ${cardMessage}` });
        });
        writable = writable.filter((item, index) => !failed.has(index));
    }

    if (!writable.length) {
        if (rows.length === 1 && rows[0].code === 'CARD_ALREADY_ASSIGNED') throw cardDuplicate();
        throw new ConflictError(rows.length === 1 ? rows[0].message : `None of the ${rows.length} cards could be assigned.`, {
            module: MODULE,
            code: rows.every((row) => row.code === 'CARD_ALREADY_ASSIGNED') ? 'CARD_ALREADY_ASSIGNED' : 'BULK_ROWS_FAILED',
            rows,
        });
    }

    const jobId = await syncJob(adminId, writable.map((item) => item.staffId), 'assign');
    return res.status(202).json({
        message: messages.cardsQueued(writable.length),
        jobId,
        assigned: writable.length,
        cards: writable.map((item) => ({ staffId: item.staffId, card: maskCard(item.cardNumber), verifyMode })),
        rows,
    });
};

/** Remove a card — required before a staff member with a device mapping can be removed. */
let RemoveCard = async (req, res) => {
    const { adminId } = req.body;
    const staff = await StaffV2Model.findOne({ _id: req.params.id, adminId, status: { $ne: 'terminated' } }, 'cardNumber');
    if (!staff) throw notFound(req.params.id);
    staff.cardNumber = null;
    staff.updatedAt = new Date();
    await staff.save();
    const jobId = await syncJob(adminId, [staff._id], 'remove');
    return res.status(202).json({ message: messages.cardRemoved(), jobId });
};

let ResyncCard = async (req, res) => {
    const { adminId } = req.body;
    const staff = await StaffV2Model.findOne({ _id: req.params.id, adminId, status: { $ne: 'terminated' } }, 'cardNumber').lean();
    if (!staff) throw notFound(req.params.id);
    if (!staff.cardNumber) throw fieldError('NO_CARD', 'cardNumber', messages.noCardToResync());
    const jobId = await syncJob(adminId, [staff._id], 'resync');
    return res.status(202).json({ message: messages.resyncQueued(), jobId });
};

/** Polled by the Assign Card modal. Another school's job reads exactly like a missing one. */
let GetJobStatus = async (req, res) => {
    const job = await queue().studentQueue.getJob(req.params.jobId);
    if (!job || String(job.data.adminId) !== String(req.query.adminId) || job.data.personType !== 'staff') {
        throw new NotFoundError(messages.jobNotFound(), { module: MODULE, context: { jobId: req.params.jobId } });
    }
    const state = await job.getState();
    const result = state === 'completed' ? job.returnvalue : null;
    return res.status(200).json({
        jobId: job.id,
        state,
        result,
        // DEVICE_UNREACHABLE (errors.md shape 8): the card is saved either way.
        warning: result && (result.failed.length || !result.pushedToDevices)
            ? { code: 'DEVICE_UNREACHABLE', message: "Couldn't reach one or more devices — card saved, it will sync automatically when the device is back online." }
            : null,
        error: state === 'failed' ? 'The job could not be completed. Please try again.' : null,
    });
};

module.exports = {
    ListStaff,
    GetStaff,
    CreateStaff,
    UpdateStaff,
    ChangeStatus,
    DeleteStaff,
    BulkDeleteStaff,
    AssignCards,
    RemoveCard,
    ResyncCard,
    GetJobStatus,
    revokeStaffAccess,
};
