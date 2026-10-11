'use strict';
const Joi = require('joi');

// Validation for the Holiday module's three pages (holiday/errors.md shapes 1 + 7). Field
// rules only — existence, duplicates, mixed selection and in-use checks are the controllers'.

const adminId = Joi.string().trim().required();
const objectId = Joi.string().hex().length(24);
const optionalId = objectId.allow('').default('');
const dateKey = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/);
const monthKey = Joi.string().trim().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).messages({ 'string.pattern.base': 'Pick a valid month.' });
const search = Joi.string().trim().allow('').max(100).default('');
const session = Joi.string().trim().allow('').max(20).default('');
const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(200).default(25);
const personType = Joi.string().valid('staff', 'student').messages({ 'any.only': 'Choose staff or student.' });

const rangeMessage = 'The last day cannot be before the first day.';

// ---- Holidays -----------------------------------------------------------------------------

const holidaySchema = Joi.object({
    adminId,
    name: Joi.string().trim().max(80).required().messages({
        'string.empty': 'Name is required.',
        'any.required': 'Name is required.',
        'string.max': 'Name cannot be longer than 80 characters.',
    }),
    startDate: dateKey.required().messages({ 'any.required': rangeMessage, 'string.empty': rangeMessage, 'string.pattern.base': rangeMessage }),
    endDate: dateKey.required().messages({ 'any.required': rangeMessage, 'string.empty': rangeMessage, 'string.pattern.base': rangeMessage }),
});

const holidayListSchema = Joi.object({ adminId, search, month: monthKey.allow('').default(''), page, limit });
const holidayOptionsSchema = Joi.object({ adminId });

const generateSchema = Joi.object({
    adminId,
    state: Joi.string().trim().max(60).required().messages({ 'any.required': 'Choose a state and year.', 'string.empty': 'Choose a state and year.' }),
    year: Joi.number().integer().min(2000).max(2100).required().messages({ 'any.required': 'Choose a state and year.', 'number.base': 'Choose a state and year.' }),
});

// ---- Templates ----------------------------------------------------------------------------

const templateSchema = Joi.object({
    adminId,
    name: Joi.string().trim().max(60).required().messages({
        'string.empty': 'Template name is required.',
        'any.required': 'Template name is required.',
        'string.max': 'Template name cannot be longer than 60 characters.',
    }),
    holidayIds: Joi.array().items(objectId).unique().max(500).default([]),
    weeklyOffDays: Joi.array().items(Joi.number().integer().min(0).max(6)).unique().max(6).default([0])
        .messages({ 'array.max': 'At least one day must be a working day.', 'number.base': 'Pick valid weekly off days.' }),
});

const templateListSchema = Joi.object({ adminId, search, page, limit });

// ---- Assign -------------------------------------------------------------------------------

const assignGridSchema = Joi.object({
    adminId,
    session,
    personType: personType.default('staff'),
    departmentId: optionalId,
    designationId: optionalId,
    classId: optionalId,
    streamId: optionalId,
    groupId: optionalId,
    sectionId: optionalId,
    search,
    page,
    limit,
});

const assignSchema = Joi.object({
    adminId,
    session,
    personType: personType.required(),
    personIds: Joi.array().items(objectId).unique().max(2000).required().min(1)
        .messages({ 'array.min': 'Select at least one person.', 'any.required': 'Select at least one person.' }),
    templateId: objectId.required().messages({ 'any.required': 'Choose a template.', 'string.empty': 'Choose a template.' }),
    // Assign = never-assigned people; Edit = already-assigned. A mixed batch is rejected.
    mode: Joi.string().valid('assign', 'edit').required(),
});

const unassignSchema = Joi.object({
    adminId,
    session,
    personType: personType.required(),
    personIds: Joi.array().items(objectId).unique().max(2000).required().min(1)
        .messages({ 'array.min': 'Select at least one person.', 'any.required': 'Select at least one person.' }),
});

const coverageSchema = Joi.object({ adminId, session });

module.exports = {
    holidaySchema,
    holidayListSchema,
    holidayOptionsSchema,
    generateSchema,
    templateSchema,
    templateListSchema,
    assignGridSchema,
    assignSchema,
    unassignSchema,
    coverageSchema,
};
