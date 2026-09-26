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
    cursor: objectId.allow('', null),
    limit: Joi.number().integer().min(1).max(100).default(10),
});

const admissionOverviewQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    session: session.required(),
});

module.exports = {
    listAdmissionsQuerySchema,
    admissionOverviewQuerySchema,
};
