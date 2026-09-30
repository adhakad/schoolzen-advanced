'use strict';
const Joi = require('joi');
const { objectId, session } = require('./manage-students.validator');

// Admission's own request shapes. The form body itself is FieldConfig-validated (see
// field-config.validator.js) — same reason as Manage Students.

const listAdmissionsQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    session: session.required(),
    classId: objectId.allow('', null),
    streamId: objectId.allow('', null),
    groupId: objectId.allow('', null),
    sectionId: objectId.allow('', null),
    search: Joi.string().trim().max(80).allow(''),
    // Field projection (module-optimization-guide.md §4): the table's own columns, e.g.
    // "name,photo,card" — whitelisted server-side, unknown names are ignored.
    fields: Joi.string().trim().max(200).allow(''),
    cursor: objectId.allow('', null),
    limit: Joi.number().integer().min(1).max(100).default(10),
});

const admissionOverviewQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    session: session.required(),
});

// The fee the form shows for a placement, before submit.
const feeQuoteQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    session: session.required(),
    classId: objectId.required(),
    streamId: objectId.allow('', null),
    groupId: objectId.allow('', null),
});

module.exports = {
    feeQuoteQuerySchema,
    listAdmissionsQuerySchema,
    admissionOverviewQuerySchema,
};
