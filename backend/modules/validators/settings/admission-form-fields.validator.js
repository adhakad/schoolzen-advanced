'use strict';
const Joi = require('joi');

// Request SHAPES for Admission Form Fields. The rules with their own errors.md codes
// (FIELD_DEFINITION_INVALID, FIELD_LOCKED, FIELD_*_UNSAFE, FIELD_CONFIG_CHANGED, the state
// check) are decided in the controller so each carries its stable code.

const fieldKey = Joi.string().trim().max(60);
// The rule object is sanitized per type by sanitizeRule() — only the editable keys survive.
const rule = Joi.object().unknown(true);

const listQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
});

const createFieldSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    label: Joi.string().trim().allow('').max(60).default(''),
    type: Joi.string().trim().allow('').default('text'),
    group: Joi.string().trim().allow('', null).default('student'),
    stateSpecific: Joi.string().trim().allow('', null).empty('').default(null),
    required: Joi.boolean().default(false),
    visible: Joi.boolean().default(true),
    validationRule: rule.default({}),
});

const changeSchema = Joi.object({
    fieldKey: fieldKey.required(),
    // The row version the editor loaded (0 = never saved) — FIELD_CONFIG_CHANGED guard.
    version: Joi.number().integer().min(0).required(),
    label: Joi.string().trim().allow('').max(60),
    required: Joi.boolean(),
    visible: Joi.boolean(),
    type: Joi.string().trim().allow(''),
    validationRule: rule,
    // Explicit consent after the editor showed the affected-record count.
    acknowledgeTypeChange: Joi.boolean().default(false),
    acknowledgeOptionRemoval: Joi.boolean().default(false),
});

const saveChangesSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    changes: Joi.array().items(changeSchema).min(1).max(200).required().messages({
        'array.min': 'There are no changes to save.',
    }),
});

const impactSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    type: Joi.string().trim().allow(''),
    options: Joi.array().items(Joi.string().allow('')).max(200),
});

module.exports = { listQuerySchema, createFieldSchema, saveChangesSchema, impactSchema };
