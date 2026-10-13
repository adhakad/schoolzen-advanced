'use strict';
const Joi = require('joi');
const { SOURCE_TYPES } = require('../../helpers/approvals/sources');
const { INBOX_STATUSES } = require('../../helpers/approvals/approval-rules');

// Validation for the Approvals inbox — field shapes only; existence and state are the
// source modules' own checks, reached through their own actions.

const adminId = Joi.string().trim().required();
const optionalId = Joi.string().hex().length(24).allow('').default('');

const listSchema = Joi.object({
    adminId,
    session: Joi.string().trim().allow('').max(20).default(''),
    search: Joi.string().trim().allow('').max(100).default(''),
    personType: Joi.string().valid('', 'staff', 'student').default(''),
    departmentId: optionalId,
    designationId: optionalId,
    classId: optionalId,
    streamId: optionalId,
    sectionId: optionalId,
    type: Joi.string().valid('', ...SOURCE_TYPES).default(''),
    status: Joi.string().valid('', ...INBOX_STATUSES).default(''),
    cursor: Joi.string().trim().allow('').max(200).default(''),
    limit: Joi.number().integer().valid(10, 25, 50).default(10),
});

const actionSchema = Joi.object({ adminId });

module.exports = {
    listSchema,
    actionSchema,
};
