'use strict';
const DepartmentV2Model = require('../../models/staff/department');
const DesignationV2Model = require('../../models/staff/designation');
const StaffV2Model = require('../../models/staff/staff');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/staff.messages');
const cacheInvalidation = require('../../helpers/staff/cache-invalidation');
const { designationDuplicate, rethrowDuplicate } = require('../../helpers/staff/duplicate-key');
const { designationCounts } = require('../../helpers/staff/dependents');
const { COLLATION, loadDesignations, matcher, paginate } = require('../../helpers/staff/lookups');
const { withTransaction } = require('../../helpers/with-transaction');
const { logActivity } = require('../../services/activity-log.service');

const MODULE = 'staff';
const ENTITY = 'Designation';

// Designations (designations.md). Department is genuinely OPTIONAL here — a designation can
// stand alone (departmentId: null). Manage Staff's form is the other context, where a
// designation can't be picked without a department; the two rules are deliberately separate.

const notFound = (id) => new NotFoundError(messages.designationNotFound(), { module: MODULE, context: { id } });

/** `departmentId`: an id → that department's; 'none' → standalone only; '' → all. */
let GetDesignations = async (req, res) => {
    const { adminId, search, departmentId, page, limit } = req.query;
    const matches = matcher(search);
    const all = await loadDesignations(adminId);
    const filtered = all.filter((row) => {
        if (departmentId === 'none' && row.departmentId) return false;
        if (departmentId && departmentId !== 'none' && row.departmentId !== departmentId) return false;
        return matches(row.title);
    });
    const result = paginate(filtered, page, limit);
    const counts = await designationCounts(adminId, result.rows.map((row) => row._id));
    result.rows = result.rows.map((row) => ({ ...row, staffCount: counts.get(row._id) || 0 }));
    result.summary = { total: all.length, active: all.filter((row) => row.status === 'active').length };
    return res.status(200).json(result);
};

/** Every designation — Manage Staff filters this client-side by department. */
let GetDesignationOptions = async (req, res) => {
    const rows = await loadDesignations(req.query.adminId);
    return res.status(200).json({ rows });
};

/** DESIGNATION_DEPARTMENT_INVALID — the parent must be a real department of this school. */
const resolveDepartment = async (adminId, departmentId) => {
    if (!departmentId) return null;
    const department = await DepartmentV2Model.findOne({ _id: departmentId, adminId }, 'name').lean();
    if (!department) {
        const message = messages.designationDepartmentInvalid();
        throw new ValidationError(message, {
            module: MODULE,
            code: 'DESIGNATION_DEPARTMENT_INVALID',
            fields: [{ field: 'departmentId', message, code: 'DESIGNATION_DEPARTMENT_INVALID' }],
        });
    }
    return department;
};

const assertTitleFree = async (adminId, title, departmentId, excludeId) => {
    const query = { adminId, title, departmentId: departmentId || null };
    if (excludeId) query._id = { $ne: excludeId };
    if (await DesignationV2Model.findOne(query, '_id').collation(COLLATION).lean()) throw designationDuplicate();
};

let CreateDesignation = async (req, res) => {
    const { adminId, title, departmentId, status } = req.body;
    await resolveDepartment(adminId, departmentId);
    await assertTitleFree(adminId, title, departmentId);
    const actor = String(req.user && req.user.id || 'admin');
    const designation = await DesignationV2Model
        .create({ adminId, title, departmentId: departmentId || null, status, createdBy: actor, updatedBy: actor })
        .catch((error) => rethrowDuplicate(error, designationDuplicate));
    await cacheInvalidation.onDesignationsChanged(adminId);
    return res.status(200).json({ message: success.created(ENTITY), designation });
};

let UpdateDesignation = async (req, res) => {
    const { adminId, title, departmentId, status } = req.body;
    const designation = await DesignationV2Model.findOne({ _id: req.params.id, adminId });
    if (!designation) throw notFound(req.params.id);

    await resolveDepartment(adminId, departmentId);
    await assertTitleFree(adminId, title, departmentId, designation._id);

    const id = String(designation._id);
    const before = { title: designation.title, departmentId: designation.departmentId };
    const moved = (before.departmentId || null) !== (departmentId || null);

    // Moving a held designation to another department would leave its holders with a
    // department/designation pair that no longer matches.
    if (moved) {
        const held = (await designationCounts(adminId, [id])).get(id) || 0;
        if (held) {
            throw new ConflictError(messages.designationInUse(held), {
                module: MODULE,
                code: 'DESIGNATION_IN_USE',
                fields: [{ field: 'departmentId', message: messages.designationInUse(held), code: 'DESIGNATION_IN_USE' }],
            });
        }
    }

    designation.title = title;
    designation.departmentId = departmentId || null;
    designation.status = status;
    designation.updatedBy = String(req.user && req.user.id || 'admin');
    designation.updatedAt = new Date();

    await withTransaction(async (dbSession) => {
        await designation.save({ session: dbSession }).catch((error) => rethrowDuplicate(error, designationDuplicate));
        if (before.title !== title) {
            await StaffV2Model.updateMany({ adminId, designationId: id }, { $set: { designation: title } }, { session: dbSession });
        }
    });
    await cacheInvalidation.onDesignationsChanged(adminId);
    if (before.title !== title || moved) {
        await logActivity(req, { module: MODULE, action: 'staff.designation.update', targetId: id, changes: { before, after: { title, departmentId: departmentId || null } } });
    }

    return res.status(200).json({ message: success.updated(ENTITY), designation });
};

/** Held by staff → DESIGNATION_IN_USE unless typed-DELETE confirmed; then holders are cleared. */
let DeleteDesignation = async (req, res) => {
    const { adminId, confirmed } = req.query;
    const designation = await DesignationV2Model.findOne({ _id: req.params.id, adminId }, 'title').lean();
    if (!designation) throw notFound(req.params.id);
    const id = String(designation._id);

    const held = (await designationCounts(adminId, [id])).get(id) || 0;
    if (held && !confirmed) {
        throw new ConflictError(messages.designationInUse(held), {
            module: MODULE,
            code: 'DESIGNATION_IN_USE',
            rows: [{ row: 0, code: 'DESIGNATION_IN_USE', staffCount: held }],
        });
    }

    await withTransaction(async (dbSession) => {
        await DesignationV2Model.deleteOne({ _id: id, adminId }, { session: dbSession });
        await StaffV2Model.updateMany(
            { adminId, designationId: id },
            { $set: { designationId: null, designation: null, updatedAt: new Date() } },
            { session: dbSession }
        );
    });
    await cacheInvalidation.onDesignationsChanged(adminId);
    await logActivity(req, { module: MODULE, action: 'staff.designation.delete', targetId: id, meta: { title: designation.title, staffCount: held } });

    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = {
    GetDesignations,
    GetDesignationOptions,
    CreateDesignation,
    UpdateDesignation,
    DeleteDesignation,
};
