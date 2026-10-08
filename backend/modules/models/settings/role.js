'use strict';
const mongoose = require('mongoose');

// A role's CAPABILITIES — Roles & Permissions Step 1 (settings/roles-permissions.md).
// Who holds it, and for which class, is RoleAssignment (Step 2) — two different shapes on
// purpose, never one form.
//
// Modules are the permission keys `requirePermission(module, 'view'|'edit')` checks; the
// spec's View/Edit pair (canView/canEdit) is the model, per the .md (authoritative over the
// reference .html's four mini-switches).
const PERMISSION_MODULES = Object.freeze(['student', 'attendance', 'marksheet', 'leave', 'fees', 'payroll', 'settings']);

const RoleSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    permissions: [{
        _id: false,
        module: { type: String, enum: PERMISSION_MODULES, required: true },
        canView: { type: Boolean, default: false },
        // Edit implies View — normalized on write (roles controller).
        canEdit: { type: Boolean, default: false },
    }],
    // Exactly one true per school, immutable: the role that can never be misconfigured into
    // locking everyone out (errors.md SUPER_ADMIN_ROLE_PROTECTED).
    isSuperAdmin: { type: Boolean, default: false },
    // Whether Step 2's class/section scope applies to this role.
    isScoped: { type: Boolean, default: false },
    // Seeded defaults — shown first, in this order.
    order: { type: Number, default: 100 },
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Unique name per school, case-insensitively ("Accountant" and "accountant" are one role).
RoleSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// Exactly one Super Admin per school — also makes the lazy seed race-safe.
RoleSchema.index({ adminId: 1 }, { unique: true, partialFilterExpression: { isSuperAdmin: true } });

const RoleModel = mongoose.model('v2-role', RoleSchema);

module.exports = RoleModel;
module.exports.PERMISSION_MODULES = PERMISSION_MODULES;
