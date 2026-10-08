'use strict';
const mongoose = require('mongoose');

// WHO holds a role, and for WHICH class — Roles & Permissions Step 2.
// classId/sectionId are only meaningful when the role isScoped (else both null).
const RoleAssignmentSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-staff', required: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-role', required: true },
    // 'school' = whole-school (non-scoped role); 'class' = class/section scoped. Explicit so
    // the two partial unique indexes below filter on a plain equality.
    scope: { type: String, enum: ['school', 'class'], required: true, default: 'school' },
    classId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // A stream's id when the class has streams — sections hang off streams there.
    streamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sectionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// THE guard for "the same class+section can't go to two people for the same role"
// (roles-permissions.md, database-design-principles.md "Uniqueness"): the spec's
// (adminId, roleId, classId, sectionId), enforced by the database, never a
// pre-check-then-write.
//
// Partial on scope 'class': without the filter, every WHOLE-SCHOOL assignment
// (classId = sectionId = null) would collide with every other, and a school could never
// have two Accountants or a co-admin Super Admin — the spec's own co-admin rule.
// sectionId null (whole class) is still a value in this index, so "8th, whole class" can
// only be held by one person per role, exactly like "8th · A". streamId sits in the key
// too: a streamed class's "Science, whole stream" and "Commerce, whole stream" both have a
// null section, and must not collide with each other (section ids are already unique
// within a class, so for section-level rows it changes nothing).
RoleAssignmentSchema.index(
    { adminId: 1, roleId: 1, classId: 1, streamId: 1, sectionId: 1 },
    { unique: true, partialFilterExpression: { scope: 'class' } }
);
// Whole-school roles: one row per person per role (no double chip).
RoleAssignmentSchema.index(
    { adminId: 1, roleId: 1, staffId: 1 },
    { unique: true, partialFilterExpression: { scope: 'school' } }
);
// requirePermission's lookup + the matrix's join + ROLE_IN_USE's count.
RoleAssignmentSchema.index({ adminId: 1, staffId: 1 });

const RoleAssignmentModel = mongoose.model('v2-role-assignment', RoleAssignmentSchema);

module.exports = RoleAssignmentModel;
