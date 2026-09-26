'use strict';
const Joi = require('joi');

// Request-shape schemas for Manage Students. The PROFILE fields of a create/update are not
// here — they are FieldConfig-driven and validated by field-config.validator.js, so the
// form and the Excel import share one rule set. These cover everything else: ids, filters,
// paging, card payloads.

const objectId = Joi.string().hex().length(24);
const session = Joi.string().trim().pattern(/^\d{4}-\d{2}$/).messages({
    'string.pattern.base': 'Session must look like 2026-27',
});

// Shared by the list, the overview and the Excel export — every one of them is "this
// school, this session, optionally narrowed by the cascade filter".
const scopeKeys = {
    adminId: Joi.string().trim().required(),
    session: session.required(),
    classId: objectId.allow('', null),
    streamId: objectId.allow('', null),
    groupId: objectId.allow('', null),
    sectionId: objectId.allow('', null),
};

const listStudentsQuerySchema = Joi.object({
    ...scopeKeys,
    search: Joi.string().trim().max(80).allow(''),
    // Keyset pagination: the _id of the last row of the previous page. Never an offset.
    cursor: objectId.allow('', null),
    limit: Joi.number().integer().min(1).max(100).default(10),
});

const overviewQuerySchema = Joi.object(scopeKeys);

// Excel Import/Export is the one place on this page where a scope is truly REQUIRED
// (manage-students.md) — classId is mandatory here and optional everywhere else. The
// streamId-when-the-class-has-streams half of the rule needs the class document, so the
// controller checks it.
const excelScopeSchema = Joi.object({
    ...scopeKeys,
    classId: objectId.required().messages({ 'any.required': 'Pick a class first — Excel import/export applies to one class at a time' }),
});

const bulkDeleteSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    ids: Joi.array().items(objectId.required()).min(1).max(500).unique().required(),
    confirmed: Joi.boolean().default(false),
});

// 4 = Card only, 10 = Card + Fingerprint (terminal verify-mode codes).
const assignCardsSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    verifyMode: Joi.number().valid(4, 10).default(4),
    items: Joi.array().items(Joi.object({
        studentId: objectId.required(),
        cardNumber: Joi.string().trim().pattern(/^\d{1,10}$/).required().messages({
            'string.pattern.base': 'Card number must be up to 10 digits',
        }),
    })).min(1).max(500).unique('studentId').unique('cardNumber').required().messages({
        'array.unique': 'Each student needs their own card number',
    }),
});

const resyncSchema = Joi.object({
    adminId: Joi.string().trim().required(),
});

module.exports = {
    objectId,
    session,
    listStudentsQuerySchema,
    overviewQuerySchema,
    excelScopeSchema,
    bulkDeleteSchema,
    assignCardsSchema,
    resyncSchema,
};
