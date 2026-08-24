'use strict';
const Joi = require('joi');

// Shapes only — "is this a number, is this one of the four allowed values". The business
// rules (name already taken in this school, type still referenced by a request) stay in
// controllers/leave-type.js as sequential fail-fast checks, matching the rest of the
// codebase.

const createLeaveTypeSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    name: Joi.string().trim().required(),
    isPaid: Joi.boolean().default(false),
    // No upper bound beyond a sane year: a school inventing a 400-day leave type is a typo
    // worth catching, but capping at, say, 60 would be us guessing their policy.
    maxDaysPerYear: Joi.number().integer().min(1).max(366).required(),
    applicableTo: Joi.string().trim().valid('all', 'staff', 'teacher', 'student').default('all'),
    status: Joi.string().trim().valid('active', 'inactive').default('active'),
    // The frontend sends the whole form object back on update, _id included; validate.js
    // strips unknown keys, so allow it through rather than have it silently dropped.
    _id: Joi.string().trim().allow('', null),
});

const updateLeaveTypeSchema = createLeaveTypeSchema.fork(
    Object.keys(createLeaveTypeSchema.describe().keys),
    (schema) => schema.optional(),
);

module.exports = { createLeaveTypeSchema, updateLeaveTypeSchema };
