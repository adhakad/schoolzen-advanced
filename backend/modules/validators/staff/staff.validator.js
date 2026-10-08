'use strict';
const Joi = require('joi');

// Validation for the Staff module's three pages (staff/errors.md shapes 1 + 3). Field-level
// rules only — uniqueness and "does this department exist" are the controller's (they need
// the database), so each can say which value collided.

const objectId = Joi.string().hex().length(24);
const nullableId = objectId.allow(null, '').empty('').default(null);
const status = Joi.string().valid('active', 'inactive').default('active').messages({
    'any.only': 'Status must be either Active or Inactive',
});
const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(10);
const search = Joi.string().trim().allow('').max(100).default('');

// ---- Departments --------------------------------------------------------------------------

const departmentSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    name: Joi.string().trim().max(60).required().messages({
        'string.empty': 'Department/Designation name is required.',
        'any.required': 'Department/Designation name is required.',
        'string.max': 'Department name cannot be longer than 60 characters',
    }),
    status,
});

const departmentListSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    search,
    page,
    limit,
});

// ---- Designations -------------------------------------------------------------------------

const designationSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    title: Joi.string().trim().max(60).required().messages({
        'string.empty': 'Department/Designation name is required.',
        'any.required': 'Department/Designation name is required.',
        'string.max': 'Designation title cannot be longer than 60 characters',
    }),
    // Genuinely optional here — a designation can stand alone (designations.md).
    departmentId: nullableId,
    status,
});

const designationListSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    search,
    // An id, or 'none' for standalone designations only; empty = every designation.
    departmentId: Joi.alternatives().try(objectId, Joi.string().valid('none')).allow('').default(''),
    page,
    limit,
});

// ---- Manage Staff -------------------------------------------------------------------------

const VERIFY_MODES = [4, 10, 11];

const staffSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    // Unicode letters, so "Zoë" and "राम" pass (errors.md shape 1, same fix as Student).
    name: Joi.string().trim().max(80).pattern(/^[\p{L}\p{M}\s.'-]+$/u).required().messages({
        'string.empty': 'Name is required.',
        'any.required': 'Name is required.',
        'string.pattern.base': 'Name can only contain letters and spaces.',
        'string.max': 'Name cannot be longer than 80 characters',
    }),
    // Optional; alphanumeric (product decision), unique per school when present.
    empCode: Joi.string().trim().max(20).pattern(/^[A-Za-z0-9/-]+$/).allow(null, '').empty('').default(null).messages({
        'string.pattern.base': 'Employee code can only contain letters, numbers, - and /.',
        'string.max': 'Employee code cannot be longer than 20 characters',
    }),
    departmentId: nullableId,
    designationId: nullableId,
    joiningDate: Joi.date().iso().allow(null, '').empty('').default(null).messages({
        'date.base': 'Enter a valid joining date.',
        'date.format': 'Enter a valid joining date.',
    }),
    education: Joi.string().trim().max(80).pattern(/^[\p{L}\s.]+$/u).allow(null, '').empty('').default(null).messages({
        'string.pattern.base': 'Education can only contain letters, dots, and spaces.',
    }),
    status,
});

const staffListSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    search,
    departmentId: objectId.allow(''),
    designationId: objectId.allow(''),
    status: Joi.string().valid('active', 'inactive', '').default(''),
    page,
    limit,
});

const changeStatusSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    status: Joi.string().valid('active', 'inactive').required().messages({
        'any.only': 'Status value must be Active or Inactive.',
        'any.required': 'Status value must be Active or Inactive.',
    }),
});

const cardNumber = Joi.string().trim().pattern(/^\d{1,10}$/).required().messages({
    'string.pattern.base': 'Card number must be up to 10 digits',
    'string.empty': 'Card number is required',
    'any.required': 'Card number is required',
});

const assignCardsSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    verifyMode: Joi.number().valid(...VERIFY_MODES).default(4).messages({
        'any.only': 'Verify mode must be Card only, Card + PIN or Card + Fingerprint',
    }),
    items: Joi.array().items(Joi.object({
        staffId: objectId.required(),
        cardNumber,
    })).min(1).max(500).unique('staffId').unique('cardNumber').required().messages({
        'array.unique': 'Each staff member needs their own card number',
    }),
});

const adminOnlySchema = Joi.object({
    adminId: Joi.string().trim().required(),
});

const bulkDeleteStaffSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    ids: Joi.array().items(objectId).min(1).max(100).required().messages({
        'array.min': 'Select at least one staff member',
        'array.max': 'Delete at most 100 staff at a time',
    }),
});

const deleteQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    confirmed: Joi.boolean().default(false),
});

module.exports = {
    VERIFY_MODES,
    departmentSchema,
    departmentListSchema,
    designationSchema,
    designationListSchema,
    staffSchema,
    staffListSchema,
    changeStatusSchema,
    assignCardsSchema,
    adminOnlySchema,
    bulkDeleteStaffSchema,
    deleteQuerySchema,
};
