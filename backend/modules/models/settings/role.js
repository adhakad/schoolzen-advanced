'use strict';
const mongoose = require('mongoose');

// A role's CAPABILITIES — Roles & Permissions Step 1 (settings/roles-permissions.md).
// Who holds it, and for which class, is RoleAssignment (Step 2) — two different shapes on
// purpose, never one form.
//
// Modules are the permission keys `requirePermission(module, 'view'|'edit')` checks; the
// spec's View/Edit pair (canView/canEdit) is the model, per the .md (authoritative over the
// reference .html's four mini-switches).
// 'leave-limit' is separate from 'leave' on purpose: viewing/actioning requests and setting
// people's yearly allowances are different jobs (Leave Assign is gated on its edit).
// 'holiday-assign' is separate from 'holiday' for the same reason: maintaining the calendar
// and deciding whose calendar it is are different grants.
// Payroll splits the same way: 'payroll' views every Payroll page and maintains Salary
// Groups, while putting staff on a scale ('payroll-assign'), generating/locking/unlocking
// runs ('payroll-generate') and recording payments/issuing slips ('payroll-payout') each
// need their own explicit grant.
// Fees the same: 'fees' views every Fees page and keeps the Fee Reminder filters, while
// defining Fee Structures ('fees-structure'), collecting money ('fees-collect') and granting
// concessions/waivers ('fees-waiver') are separate, explicit grants.
// Certificates the same: 'certificates' views both pages and reprints, while editing the TC
// serial ('tc-structure') and issuing/cancelling a TC ('tc-generate') are explicit grants.
// Examination: one key per page. 'marksheet' (Generate Marksheet: view/preview/print, edit =
// enter marks) keeps its original meaning; 'marksheet-structure' and 'admit-card-structure'
// gate setting up / editing / removing structures (which regenerates documents), and
// 'admit-card' gates Generate Admit Card.
// Approvals: 'approvals' views the cross-module inbox; 'approvals-action' approves/rejects
// from it — and acting on a row ALSO needs that source's own grant ('leave' edit), so the
// inbox is never a way around a module's permission.
const PERMISSION_MODULES = Object.freeze([
    'student', 'attendance', 'marksheet', 'marksheet-structure', 'admit-card', 'admit-card-structure', 'leave', 'leave-limit', 'holiday', 'holiday-assign',
    'fees', 'fees-structure', 'fees-collect', 'fees-waiver',
    'certificates', 'tc-structure', 'tc-generate',
    'payroll', 'payroll-assign', 'payroll-generate', 'payroll-payout',
    'approvals', 'approvals-action', 'settings',
]);

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
