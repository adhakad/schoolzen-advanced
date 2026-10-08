'use strict';
const DepartmentV2Model = require('../../models/staff/department');
const DesignationV2Model = require('../../models/staff/designation');
const StaffV2Model = require('../../models/staff/staff');
const { NotFoundError, ConflictError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/staff.messages');
const cacheInvalidation = require('../../helpers/staff/cache-invalidation');
const { departmentDuplicate, rethrowDuplicate } = require('../../helpers/staff/duplicate-key');
const { departmentCounts } = require('../../helpers/staff/dependents');
const { COLLATION, loadDepartments, matcher, paginate } = require('../../helpers/staff/lookups');
const { withTransaction } = require('../../helpers/with-transaction');
const { logActivity } = require('../../services/activity-log.service');

const MODULE = 'staff';
const ENTITY = 'Department';

// Departments — a simple CRUD list (departments.md). Typed throws, no catch-all 500s.

const notFound = (id) => new NotFoundError(messages.departmentNotFound(), { module: MODULE, context: { id } });

/** One page of the cached list, each row with its live in-use counts for the delete dialog. */
let GetDepartments = async (req, res) => {
    const { adminId, search, page, limit } = req.query;
    const matches = matcher(search);
    const all = await loadDepartments(adminId);
    const result = paginate(all.filter((row) => matches(row.name)), page, limit);
    const counts = await departmentCounts(adminId, result.rows.map((row) => row._id));
    result.rows = result.rows.map((row) => {
        const count = counts.get(row._id);
        return { ...row, staffCount: count.staff, designationCount: count.designations };
    });
    // The side card — school-wide, never narrowed by the search box.
    result.summary = { total: all.length, active: all.filter((row) => row.status === 'active').length };
    return res.status(200).json(result);
};

/** Every department — Manage Staff's / Designations' dropdown source (same cached key). */
let GetDepartmentOptions = async (req, res) => {
    const rows = await loadDepartments(req.query.adminId);
    return res.status(200).json({ rows });
};

// Fast-path duplicate check — the collated unique index is the real guard.
const assertNameFree = async (adminId, name, excludeId) => {
    const query = { adminId, name };
    if (excludeId) query._id = { $ne: excludeId };
    if (await DepartmentV2Model.findOne(query, '_id').collation(COLLATION).lean()) throw departmentDuplicate();
};

let CreateDepartment = async (req, res) => {
    const { adminId, name, status } = req.body;
    await assertNameFree(adminId, name);
    const actor = String(req.user && req.user.id || 'admin');
    const department = await DepartmentV2Model
        .create({ adminId, name, status, createdBy: actor, updatedBy: actor })
        .catch((error) => rethrowDuplicate(error, departmentDuplicate));
    await cacheInvalidation.onDepartmentsChanged(adminId);
    return res.status(200).json({ message: success.created(ENTITY), department });
};

let UpdateDepartment = async (req, res) => {
    const { adminId, name, status } = req.body;
    const department = await DepartmentV2Model.findOne({ _id: req.params.id, adminId });
    // Another school's record reads exactly like a missing one.
    if (!department) throw notFound(req.params.id);

    // Legacy had no duplicate check on rename at all (errors.md shape 2).
    await assertNameFree(adminId, name, department._id);

    const before = { name: department.name, status: department.status };
    const id = String(department._id);
    const warnings = [];
    if (status === 'inactive' && department.status !== 'inactive') {
        const active = await StaffV2Model.countDocuments({ adminId, departmentId: id, status: 'active' });
        if (active) warnings.push({ code: 'DEPARTMENT_DEACTIVATE_BLOCKED', count: active, message: messages.departmentDeactivateWarning(active) });
    }

    department.name = name;
    department.status = status;
    department.updatedBy = String(req.user && req.user.id || 'admin');
    department.updatedAt = new Date();

    await withTransaction(async (dbSession) => {
        await department.save({ session: dbSession }).catch((error) => rethrowDuplicate(error, departmentDuplicate));
        // Staff carries the name as a display copy (Roles & Permissions filters on it).
        if (before.name !== name) {
            await StaffV2Model.updateMany({ adminId, departmentId: id }, { $set: { department: name } }, { session: dbSession });
        }
    });
    await cacheInvalidation.onDepartmentsChanged(adminId);
    if (before.name !== name) {
        await logActivity(req, { module: MODULE, action: 'staff.department.update', targetId: id, changes: { before, after: { name, status } } });
    }

    return res.status(200).json({ message: success.updated(ENTITY), department, warnings });
};

/**
 * In use by staff or designations → DEPARTMENT_IN_USE with both counts, unless the admin
 * typed DELETE (`confirmed`). Confirmed, the department goes and every reference to it is
 * cleared in the same transaction — nothing is left pointing at a missing department.
 */
let DeleteDepartment = async (req, res) => {
    const { adminId, confirmed } = req.query;
    const department = await DepartmentV2Model.findOne({ _id: req.params.id, adminId }, 'name').lean();
    if (!department) throw notFound(req.params.id);
    const id = String(department._id);

    const counts = (await departmentCounts(adminId, [id])).get(id);
    if ((counts.staff || counts.designations) && !confirmed) {
        throw new ConflictError(messages.departmentInUse(counts.staff, counts.designations), {
            module: MODULE,
            code: 'DEPARTMENT_IN_USE',
            context: counts,
            rows: [{ row: 0, code: 'DEPARTMENT_IN_USE', staffCount: counts.staff, designationCount: counts.designations }],
        });
    }

    await withTransaction(async (dbSession) => {
        await DepartmentV2Model.deleteOne({ _id: id, adminId }, { session: dbSession });
        await DesignationV2Model.updateMany({ adminId, departmentId: id }, { $set: { departmentId: null } }, { session: dbSession });
        // A designation belongs to its department, so staff lose both together.
        await StaffV2Model.updateMany(
            { adminId, departmentId: id },
            { $set: { departmentId: null, department: null, designationId: null, designation: null, updatedAt: new Date() } },
            { session: dbSession }
        );
    });
    await cacheInvalidation.onDepartmentsChanged(adminId);
    await logActivity(req, { module: MODULE, action: 'staff.department.delete', targetId: id, meta: { name: department.name, ...counts } });

    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = {
    GetDepartments,
    GetDepartmentOptions,
    CreateDepartment,
    UpdateDepartment,
    DeleteDepartment,
};
