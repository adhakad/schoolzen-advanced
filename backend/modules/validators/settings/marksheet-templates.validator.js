'use strict';
const Joi = require('joi');

const objectId = Joi.string().hex().length(24);
// A template is addressed by its catalog code ("T3") or its _id.
const templateRef = Joi.alternatives()
    .try(objectId, Joi.string().trim().pattern(/^T\d{1,3}$/i))
    .required()
    .messages({ 'any.required': 'Choose a template.', 'alternatives.match': "This template doesn't exist." });

const previewQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    templateId: templateRef,
    classId: objectId.required(),
    streamId: objectId.allow('', null).empty('').default(null),
    // The header's session (shared-fix2.md); omitted = the session covering today.
    session: Joi.string().trim().allow('').optional(),
});

const assignSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    templateId: templateRef,
    classId: objectId.required().messages({ 'any.required': 'Choose a class.' }),
    streamId: objectId.allow('', null).empty('').default(null),
    // Explicit consent to replace a class's existing template (CLASS_TEMPLATE_ALREADY_ASSIGNED).
    replace: Joi.boolean().default(false),
    session: Joi.string().trim().allow('').optional(),
});

module.exports = { previewQuerySchema, assignSchema };
