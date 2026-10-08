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
});

const assignSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    templateId: templateRef,
    classId: objectId.required().messages({ 'any.required': 'Choose a class.' }),
    streamId: objectId.allow('', null).empty('').default(null),
    // Explicit consent to replace a class's existing template (CLASS_TEMPLATE_ALREADY_ASSIGNED).
    replace: Joi.boolean().default(false),
});

module.exports = { previewQuerySchema, assignSchema };
