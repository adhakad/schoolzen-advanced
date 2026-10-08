'use strict';
const Joi = require('joi');
const { COPY_FORWARD_KEYS } = require('../../helpers/settings/session-copy-forward');

// Request SHAPES for Academic Sessions. The business rules with their own errors.md codes
// (SESSION_DATE_RANGE_INVALID, SESSION_LABEL_FORMAT_INVALID, SESSION_CONFIRM_MISMATCH) are
// checked in the controller so each carries its stable code — a missing date must come back
// as SESSION_DATE_RANGE_INVALID, not Joi's generic "is required".

const listSessionsQuerySchema = Joi.object({
    adminId: Joi.string().required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
});

const createSessionSchema = Joi.object({
    adminId: Joi.string().required(),
    // 'YYYY-MM-DD' (the app-dp value). Blank/missing → SESSION_DATE_RANGE_INVALID downstream.
    startDate: Joi.string().allow('', null).default(''),
    endDate: Joi.string().allow('', null).default(''),
    copyForward: Joi.array().items(Joi.string().valid(...COPY_FORWARD_KEYS)).unique().default([]),
});

const activateSessionSchema = Joi.object({
    adminId: Joi.string().required(),
    confirmLabel: Joi.string().allow('').default(''),
});

module.exports = { listSessionsQuerySchema, createSessionSchema, activateSessionSchema };
