'use strict';
const Joi = require('joi');
const { PERMISSION_MODULES } = require('../../models/settings/role');

// Request shapes for Roles & Permissions. Business rules (blank name → ROLE_NAME_REQUIRED,
// Super Admin protection, scope-vs-isScoped, owner protection) live in the controller so
// each surfaces with its own errors.md code — Joi here only guards structure.

const objectId = Joi.string().hex().length(24);
const optionalId = objectId.allow(null, '').empty('').default(null);

const permissionsSchema = Joi.array().items(Joi.object({
    module: Joi.string().valid(...PERMISSION_MODULES).required(),
    canView: Joi.boolean().default(false),
    canEdit: Joi.boolean().default(false),
})).max(PERMISSION_MODULES.length * 2);

// `name` may arrive blank — the controller answers ROLE_NAME_REQUIRED for it.
const nameSchema = Joi.string().trim().allow('').max(40).messages({
    'string.max': 'Role name cannot be longer than 40 characters',
});

const createRoleSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    name: nameSchema.default(''),
    isScoped: Joi.boolean().default(false),
    permissions: permissionsSchema.default([]),
    // Accepted only so the controller can REFUSE it (SUPER_ADMIN_ROLE_PROTECTED) instead of
    // stripping it silently.
    isSuperAdmin: Joi.boolean(),
});

// isScoped is fixed at creation (sending a different value is refused by the controller):
// flipping it later would strand the role's class-scoped assignments.
const updateRoleSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    name: nameSchema,
    permissions: permissionsSchema,
    isSuperAdmin: Joi.boolean(),
    isScoped: Joi.boolean(),
});

const matrixQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    search: Joi.string().trim().allow('').max(80).default(''),
    department: Joi.string().trim().allow('').max(80).default(''),
    designation: Joi.string().trim().allow('').max(80).default(''),
    roleId: objectId.allow('').default(''),
    assigned: Joi.string().valid('', 'assigned', 'unassigned').default(''),
    cursor: objectId.allow('').default(''),
    limit: Joi.number().integer().min(1).max(100).default(25),
});

const createAssignmentSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    staffId: objectId.required(),
    roleId: objectId.required(),
    classId: optionalId,
    streamId: optionalId,
    sectionId: optionalId,
});

const updateAssignmentSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    classId: optionalId,
    streamId: optionalId,
    sectionId: optionalId,
});

const bulkDeleteAssignmentsSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    ids: Joi.array().items(objectId).min(1).max(500).required().messages({
        'array.min': 'Select at least one role to remove',
        'array.max': 'Remove at most 500 roles at a time',
    }),
    // Server-side backstop behind the UI's type-to-DELETE gate.
    confirm: Joi.string().valid('DELETE').required().messages({
        'any.only': 'Type DELETE to confirm.',
        'any.required': 'Type DELETE to confirm.',
    }),
});

module.exports = {
    createRoleSchema,
    updateRoleSchema,
    matrixQuerySchema,
    createAssignmentSchema,
    updateAssignmentSchema,
    bulkDeleteAssignmentsSchema,
};
