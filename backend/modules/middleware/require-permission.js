'use strict';
const mongoose = require('mongoose');
const RoleModel = require('../models/settings/role');
const RoleAssignmentModel = require('../models/settings/role-assignment');
const { PermissionError } = require('../errors');
const cacheService = require('../services/cache/cache.service');
const cacheKeys = require('../services/cache/cache-keys');
const { ensureOwner } = require('../helpers/settings/owner-bootstrap');

// THE authorization check for v2 routes (roles-permissions.md, settings/errors.md backend
// requirements): `requirePermission(module, 'view'|'edit')`. It resolves the caller to a
// v2 Staff row, then that staff's effective permissions from their RoleAssignment rows —
// never a hardcoded `if (role === 'admin')`. A new actor type (accountant, librarian) needs
// only new Role rows, zero new code here.
//
// Runs after isAdminAuth + assertAdminScope (req.adminId is the verified school).
//
// Caller → staff: today the only v2 login is the legacy admin token, whose holder IS the
// school's owner, so it resolves to the owner Staff row (bootstrapped on first use). When
// unified Staff login lands, its token carries `staffId` and is used directly — this is the
// one branch that changes.
//
// Effective permissions are cached per STAFF (`{adminId}:settings:role:{staffId}:permissions`,
// settings/optimization.md): one cheap key read per request. Role edits delPattern every
// staff's key; assignment changes del just that staff's key.

const resolveStaffId = async (req) => {
    const user = req.user || {};
    if (user.staffId) return String(user.staffId);
    const owner = await ensureOwner(req.adminId, user);
    return owner._id;
};

/**
 * { isSuperAdmin, modules: { [module]: { canView, canEdit } }, scopes: [...] } for one staff.
 * Union across every role they hold.
 */
const loadPermissions = (adminId, staffId) => cacheService.wrap(
    cacheKeys.settings.staffPermissions(adminId, staffId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const assignments = await RoleAssignmentModel
            .find({ adminId, staffId: new mongoose.Types.ObjectId(staffId) }, 'roleId classId streamId sectionId')
            .lean();
        const roleIds = [...new Set(assignments.map((a) => String(a.roleId)))];
        const roles = roleIds.length
            ? await RoleModel.find({ adminId, _id: { $in: roleIds } }, 'isSuperAdmin permissions isScoped').lean()
            : [];

        const result = { isSuperAdmin: false, modules: {}, scopes: [] };
        for (const role of roles) {
            if (role.isSuperAdmin) result.isSuperAdmin = true;
            for (const p of role.permissions || []) {
                const current = result.modules[p.module] || { canView: false, canEdit: false };
                current.canEdit = current.canEdit || Boolean(p.canEdit);
                current.canView = current.canView || Boolean(p.canView) || Boolean(p.canEdit);
                result.modules[p.module] = current;
            }
        }
        // Class scopes, for scoped roles — consumers that filter by class read these.
        const scopedRoleIds = new Set(roles.filter((r) => r.isScoped).map((r) => String(r._id)));
        result.scopes = assignments
            .filter((a) => scopedRoleIds.has(String(a.roleId)) && a.classId)
            .map((a) => ({ roleId: String(a.roleId), classId: String(a.classId),
                streamId: a.streamId ? String(a.streamId) : null, sectionId: a.sectionId ? String(a.sectionId) : null }));
        return result;
    }
);

const allows = (permissions, module, action) => {
    if (permissions.isSuperAdmin) return true;
    const grant = permissions.modules[module];
    if (!grant) return false;
    return action === 'edit' ? grant.canEdit : grant.canView;
};

const requirePermission = (module, action = 'view') => async (req, res, next) => {
    try {
        const staffId = await resolveStaffId(req);
        const permissions = await loadPermissions(req.adminId, staffId);
        if (!allows(permissions, module, action)) {
            return next(new PermissionError("You don't have permission to do this.", {
                module, context: { staffId, action },
            }));
        }
        req.staffId = staffId;
        req.permissions = permissions;
        return next();
    } catch (error) {
        return next(error);
    }
};

module.exports = requirePermission;
module.exports.loadPermissions = loadPermissions;
module.exports.allows = allows;
