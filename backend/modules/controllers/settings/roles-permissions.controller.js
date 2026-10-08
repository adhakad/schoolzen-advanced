'use strict';
const mongoose = require('mongoose');
const RoleModel = require('../../models/settings/role');
const RoleAssignmentModel = require('../../models/settings/role-assignment');
const StaffV2Model = require('../../models/staff/staff');
const { ValidationError, NotFoundError, ConflictError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/settings.messages');
const { onRolesChanged, onAssignmentChanged } = require('../../helpers/settings/cache-invalidation');
const {
    rethrowDuplicate, roleNameDuplicate, roleScopeAlreadyAssigned, roleAlreadyHeld,
} = require('../../helpers/settings/duplicate-key');
const { ensureSeededRoles } = require('../../helpers/settings/owner-bootstrap');
const { loadClassTree, indexTree, scopeLabel, resolveScope } = require('../../helpers/settings/class-options');
const { PERMISSION_MODULES } = RoleModel;

const MODULE = 'settings';

// Settings → Roles & Permissions (settings/roles-permissions.md, errors.md Page 3).
//
// Step 1 edits a Role's capabilities; Step 2 edits RoleAssignment rows (who holds which role,
// for which class). Every protection here is a SERVER check: the seeded Super Admin role can't
// be edited/removed, the owner's Super Admin assignment can't be deleted by anyone, and the
// unique indexes — not a pre-check — are what stop a class+role going to two people.

const isObjectId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notFound = () => new NotFoundError(messages.notFound(), { module: MODULE, code: 'NOT_FOUND' });
const conflict = (code, message, extra = {}) => new ConflictError(message, { module: MODULE, code, ...extra });
const invalid = (code, field, message) => new ValidationError(message, {
    module: MODULE, code, fields: [{ field, message, code }],
});
const superAdminProtected = () => conflict('SUPER_ADMIN_ROLE_PROTECTED', messages.superAdminRoleProtected());

const findOwn = async (Model, adminId, id, projection) => {
    if (!isObjectId(id)) throw notFound();
    const doc = await Model.findOne({ _id: toObjectId(id), adminId }, projection).lean();
    if (!doc) throw notFound();
    return doc;
};

/** Every module present once; Edit implies View. */
const normalizePermissions = (permissions = []) => {
    const byModule = new Map((permissions || []).map((p) => [p.module, p]));
    return PERMISSION_MODULES.map((module) => {
        const p = byModule.get(module) || {};
        const canEdit = Boolean(p.canEdit);
        return { module, canView: canEdit || Boolean(p.canView), canEdit };
    });
};

const roleRow = (role, holders) => ({
    _id: String(role._id),
    name: role.name,
    isSuperAdmin: Boolean(role.isSuperAdmin),
    isScoped: Boolean(role.isScoped),
    permissions: role.isSuperAdmin
        ? PERMISSION_MODULES.map((module) => ({ module, canView: true, canEdit: true }))
        : normalizePermissions(role.permissions),
    holderCount: holders ? holders.count : 0,
    holderNames: holders ? holders.names : [],
});

// --- Step 1: roles ----------------------------------------------------------------------

/** GET /roles — every role with how many staff hold it (and a few names for the remove modal). */
let GetRoles = async (req, res) => {
    const adminId = req.query.adminId;
    await ensureSeededRoles(adminId);
    const [roles, groups] = await Promise.all([
        RoleModel.find({ adminId }).sort({ order: 1, createdAt: 1 }).lean(),
        RoleAssignmentModel.aggregate([
            { $match: { adminId } },
            { $group: { _id: '$roleId', staff: { $addToSet: '$staffId' } } },
        ]),
    ]);
    const sample = [...new Set(groups.flatMap((g) => g.staff.slice(0, 5).map(String)))];
    const names = new Map((sample.length
        ? await StaffV2Model.find({ adminId, _id: { $in: sample.map(toObjectId) } }, 'name').lean()
        : []).map((s) => [String(s._id), s.name]));
    const holders = new Map(groups.map((g) => [String(g._id), {
        count: g.staff.length,
        names: g.staff.slice(0, 5).map((id) => names.get(String(id))).filter(Boolean),
    }]));
    return res.status(200).json({
        roles: roles.map((role) => roleRow(role, holders.get(String(role._id)))),
        modules: PERMISSION_MODULES,
    });
};

/** POST /roles { name, isScoped, permissions } */
let CreateRole = async (req, res) => {
    const { adminId, name, isScoped, permissions, isSuperAdmin } = req.body;
    const actor = req.staffId || 'system';
    if (isSuperAdmin) throw superAdminProtected();
    if (!name) throw invalid('ROLE_NAME_REQUIRED', 'name', messages.roleNameRequired());

    if (await RoleModel.exists({ adminId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') })) throw roleNameDuplicate();
    const last = await RoleModel.findOne({ adminId }, 'order').sort({ order: -1 }).lean();

    let created;
    try {
        created = await RoleModel.create({
            adminId, name, isScoped: Boolean(isScoped), isSuperAdmin: false,
            permissions: normalizePermissions(permissions),
            order: (last ? last.order : 0) + 1,
            createdBy: actor, updatedBy: actor,
        });
    } catch (error) {
        rethrowDuplicate(error, (keys) => (keys.includes('name') ? roleNameDuplicate() : null));
    }
    await onRolesChanged(adminId);
    return res.status(201).json({ message: success.created('Role'), role: roleRow(created.toObject()) });
};

/** PUT /roles/:id { name?, permissions? } — never the Super Admin role, never isScoped. */
let UpdateRole = async (req, res) => {
    const { adminId, name, permissions, isSuperAdmin, isScoped } = req.body;
    const actor = req.staffId || 'system';
    const role = await findOwn(RoleModel, adminId, req.params.id);
    if (role.isSuperAdmin || isSuperAdmin !== undefined) throw superAdminProtected();
    if (isScoped !== undefined && Boolean(isScoped) !== Boolean(role.isScoped)) {
        throw invalid('VALIDATION_FAILED', 'isScoped', "A role's class scoping is fixed when it's created.");
    }

    const $set = { updatedBy: actor, updatedAt: new Date() };
    if (name !== undefined) {
        if (!name) throw invalid('ROLE_NAME_REQUIRED', 'name', messages.roleNameRequired());
        if (await RoleModel.exists({ adminId, _id: { $ne: role._id }, name: new RegExp(`^${escapeRegex(name)}$`, 'i') })) {
            throw roleNameDuplicate();
        }
        $set.name = name;
    }
    if (permissions !== undefined) $set.permissions = normalizePermissions(permissions);

    try {
        await RoleModel.updateOne({ _id: role._id, adminId, isSuperAdmin: { $ne: true } }, { $set });
    } catch (error) {
        rethrowDuplicate(error, (keys) => (keys.includes('name') ? roleNameDuplicate() : null));
    }
    await onRolesChanged(adminId);
    const updated = await RoleModel.findOne({ _id: role._id, adminId }).lean();
    return res.status(200).json({ message: success.updated('Role'), role: roleRow(updated) });
};

/** DELETE /roles/:id — refused while any staff hold it (ROLE_IN_USE, with the count). */
let DeleteRole = async (req, res) => {
    const adminId = req.query.adminId;
    const role = await findOwn(RoleModel, adminId, req.params.id);
    if (role.isSuperAdmin) throw superAdminProtected();

    const holders = await RoleAssignmentModel.distinct('staffId', { adminId, roleId: role._id });
    if (holders.length) {
        throw conflict('ROLE_IN_USE', messages.roleInUse(holders.length), { context: { count: holders.length } });
    }
    await RoleModel.deleteOne({ _id: role._id, adminId, isSuperAdmin: { $ne: true } });
    await onRolesChanged(adminId);
    return res.status(200).json({ message: success.deleted('Role') });
};

// --- Step 2: assignments ----------------------------------------------------------------

const assignmentRow = (a, byId) => ({
    _id: String(a._id),
    roleId: String(a.roleId),
    scope: a.scope,
    classId: a.classId ? String(a.classId) : null,
    streamId: a.streamId ? String(a.streamId) : null,
    sectionId: a.sectionId ? String(a.sectionId) : null,
    label: a.scope === 'class' ? scopeLabel(byId, a) : 'Whole school',
});

/**
 * GET /role-assignments/matrix — one cursor page of staff rows, each with every role it
 * holds; plus the toolbar's filter options and the side card's counts.
 */
let GetMatrix = async (req, res) => {
    const { adminId, search, department, designation, roleId, assigned, cursor, limit } = req.query;
    const base = { adminId, status: 'active' };

    const filter = { ...base };
    if (search) filter.name = new RegExp(escapeRegex(search), 'i');
    if (department) filter.department = department;
    if (department && designation) filter.designation = designation;

    const anyAssigned = await RoleAssignmentModel.distinct('staffId', { adminId });
    const idFilters = [];
    if (roleId) idFilters.push({ _id: { $in: await RoleAssignmentModel.distinct('staffId', { adminId, roleId: toObjectId(roleId) }) } });
    if (assigned === 'assigned') idFilters.push({ _id: { $in: anyAssigned } });
    if (assigned === 'unassigned') idFilters.push({ _id: { $nin: anyAssigned } });
    if (cursor) idFilters.push({ _id: { $gt: toObjectId(cursor) } });
    if (idFilters.length) filter.$and = idFilters;

    const [staff, totalStaff, assignedCount, depts, tree] = await Promise.all([
        StaffV2Model.find(filter, 'name empCode department designation isOwner').sort({ _id: 1 }).limit(limit + 1).lean(),
        StaffV2Model.countDocuments(base),
        StaffV2Model.countDocuments({ ...base, _id: { $in: anyAssigned } }),
        StaffV2Model.aggregate([
            { $match: { ...base, department: { $nin: [null, ''] } } },
            { $group: { _id: '$department', designations: { $addToSet: '$designation' } } },
            { $sort: { _id: 1 } },
        ]),
        loadClassTree(adminId),
    ]);

    const page = staff.slice(0, limit);
    const assignments = page.length
        ? await RoleAssignmentModel.find({ adminId, staffId: { $in: page.map((s) => s._id) } }).sort({ createdAt: 1 }).lean()
        : [];
    const byId = indexTree(tree);
    const byStaff = new Map();
    assignments.forEach((a) => {
        const key = String(a.staffId);
        if (!byStaff.has(key)) byStaff.set(key, []);
        byStaff.get(key).push(assignmentRow(a, byId));
    });

    return res.status(200).json({
        rows: page.map((s) => ({
            _id: String(s._id),
            name: s.name,
            empCode: s.empCode || null,
            department: s.department || null,
            designation: s.designation || null,
            isOwner: Boolean(s.isOwner),
            assignments: byStaff.get(String(s._id)) || [],
        })),
        nextCursor: staff.length > limit ? String(page[page.length - 1]._id) : null,
        filters: {
            departments: depts.map((d) => ({
                name: d._id,
                designations: (d.designations || []).filter(Boolean).sort(),
            })),
        },
        summary: { totalStaff, assigned: assignedCount, unassigned: Math.max(totalStaff - assignedCount, 0) },
    });
};

/** GET /role-assignments/class-options — the Add-a-Class modal's class → stream → section tree. */
let GetClassOptions = async (req, res) => {
    const classes = await loadClassTree(req.query.adminId);
    return res.status(200).json({ classes });
};

const scopeFor = async (adminId, role, body) => {
    const hasScope = Boolean(body.classId || body.streamId || body.sectionId);
    if (!role.isScoped) {
        if (hasScope) throw invalid('ROLE_SCOPE_NOT_ALLOWED', 'classId', messages.roleScopeNotAllowed());
        return { scope: 'school', classId: null, streamId: null, sectionId: null };
    }
    if (!body.classId) throw invalid('VALIDATION_FAILED', 'classId', messages.roleScopeRequired());
    const resolved = await resolveScope(adminId, body);
    return {
        scope: 'class',
        classId: toObjectId(resolved.classId),
        streamId: resolved.streamId ? toObjectId(resolved.streamId) : null,
        sectionId: resolved.sectionId ? toObjectId(resolved.sectionId) : null,
    };
};

/** Which uniqueness index a duplicate tripped → its stable code. */
const translateAssignmentDuplicate = (keys) => (keys.includes('staffId') ? roleAlreadyHeld() : roleScopeAlreadyAssigned());

/** POST /role-assignments { staffId, roleId, classId?, streamId?, sectionId? } */
let CreateAssignment = async (req, res) => {
    const { adminId, staffId, roleId } = req.body;
    const actor = req.staffId || 'system';
    const [staff, role] = await Promise.all([
        findOwn(StaffV2Model, adminId, staffId, '_id'),
        findOwn(RoleModel, adminId, roleId, 'isScoped isSuperAdmin name'),
    ]);
    const scope = await scopeFor(adminId, role, req.body);

    // Friendlier fast path; the partial unique indexes are the real guard (shape 9).
    const holder = scope.scope === 'class'
        ? await RoleAssignmentModel.findOne({ adminId, roleId: role._id, scope: 'class',
            classId: scope.classId, streamId: scope.streamId, sectionId: scope.sectionId }, 'staffId').lean()
        : await RoleAssignmentModel.findOne({ adminId, roleId: role._id, scope: 'school', staffId: staff._id }, 'staffId').lean();
    if (holder) throw String(holder.staffId) === String(staff._id) ? roleAlreadyHeld() : roleScopeAlreadyAssigned();

    let created;
    try {
        created = await RoleAssignmentModel.create({
            adminId, staffId: staff._id, roleId: role._id, ...scope, createdBy: actor, updatedBy: actor,
        });
    } catch (error) {
        rethrowDuplicate(error, translateAssignmentDuplicate);
    }
    await onAssignmentChanged(adminId, staff._id);
    const tree = scope.scope === 'class' ? indexTree(await loadClassTree(adminId)) : new Map();
    return res.status(201).json({ message: success.created('Role assignment'), assignment: assignmentRow(created.toObject(), tree) });
};

/** PUT /role-assignments/:id { classId, streamId?, sectionId? } — edit a chip's class scope. */
let UpdateAssignment = async (req, res) => {
    const { adminId } = req.body;
    const actor = req.staffId || 'system';
    const assignment = await findOwn(RoleAssignmentModel, adminId, req.params.id);
    const role = await findOwn(RoleModel, adminId, assignment.roleId, 'isScoped');
    if (!role.isScoped) throw invalid('ROLE_SCOPE_NOT_ALLOWED', 'classId', messages.roleScopeNotAllowed());
    const scope = await scopeFor(adminId, role, req.body);

    const holder = await RoleAssignmentModel.findOne({ adminId, roleId: role._id, scope: 'class', _id: { $ne: assignment._id },
        classId: scope.classId, streamId: scope.streamId, sectionId: scope.sectionId }, 'staffId').lean();
    if (holder) throw String(holder.staffId) === String(assignment.staffId) ? roleAlreadyHeld() : roleScopeAlreadyAssigned();

    try {
        await RoleAssignmentModel.updateOne({ _id: assignment._id, adminId },
            { $set: { ...scope, updatedBy: actor, updatedAt: new Date() } });
    } catch (error) {
        rethrowDuplicate(error, translateAssignmentDuplicate);
    }
    await onAssignmentChanged(adminId, assignment.staffId);
    return res.status(200).json({ message: success.updated('Role assignment') });
};

/** The owner's Super Admin assignment — undeletable by anyone (OWNER_ROLE_PROTECTED). */
const ownerProtectedIds = async (adminId, assignments) => {
    if (!assignments.length) return new Set();
    const [owner, superAdmin] = await Promise.all([
        StaffV2Model.findOne({ adminId, isOwner: true }, '_id').lean(),
        RoleModel.findOne({ adminId, isSuperAdmin: true }, '_id').lean(),
    ]);
    if (!owner || !superAdmin) return new Set();
    return new Set(assignments
        .filter((a) => String(a.staffId) === String(owner._id) && String(a.roleId) === String(superAdmin._id))
        .map((a) => String(a._id)));
};

/** DELETE /role-assignments/:id — the chip's ×. */
let DeleteAssignment = async (req, res) => {
    const adminId = req.query.adminId;
    const assignment = await findOwn(RoleAssignmentModel, adminId, req.params.id);
    if ((await ownerProtectedIds(adminId, [assignment])).size) {
        throw conflict('OWNER_ROLE_PROTECTED', messages.ownerRoleProtected());
    }
    await RoleAssignmentModel.deleteOne({ _id: assignment._id, adminId });
    await onAssignmentChanged(adminId, assignment.staffId);
    return res.status(200).json({ message: success.deleted('Role assignment') });
};

/**
 * POST /role-assignments/bulk-delete { ids, confirm:'DELETE' } — "Selected Delete". One
 * outcome per id; the owner's Super Admin row is reported, never deleted.
 */
let BulkDeleteAssignments = async (req, res) => {
    const { adminId, ids } = req.body;
    const unique = [...new Set(ids)];
    const found = await RoleAssignmentModel.find({ adminId, _id: { $in: unique.map(toObjectId) } }, 'staffId roleId').lean();
    const foundById = new Map(found.map((a) => [String(a._id), a]));
    const protectedIds = await ownerProtectedIds(adminId, found);

    const deletable = found.filter((a) => !protectedIds.has(String(a._id)));
    if (deletable.length) {
        await RoleAssignmentModel.deleteMany({ adminId, _id: { $in: deletable.map((a) => a._id) } });
        await onAssignmentChanged(adminId, [...new Set(deletable.map((a) => String(a.staffId)))]);
    }

    const results = unique.map((id) => {
        if (!foundById.has(id)) return { id, status: 'failed', code: 'NOT_FOUND', message: messages.notFound() };
        if (protectedIds.has(id)) return { id, status: 'failed', code: 'OWNER_ROLE_PROTECTED', message: messages.ownerRoleProtected() };
        return { id, status: 'deleted' };
    });
    return res.status(200).json({
        message: success.bulkProcessed(deletable.length, 'role assignment'),
        deletedCount: deletable.length,
        results,
    });
};

module.exports = {
    GetRoles, CreateRole, UpdateRole, DeleteRole,
    GetMatrix, GetClassOptions, CreateAssignment, UpdateAssignment, DeleteAssignment, BulkDeleteAssignments,
};
