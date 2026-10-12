'use strict';
const Joi = require('joi');
const messages = require('../../helpers/messages/certificates.messages');
const { REASONS, CONDUCTS } = require('../../models/certificates/transfer-certificate');

// Certificates validation (certificates/errors.md shape 1) — enforced server-side, never
// only by the Angular form. Duplicates, fees and attendance bounds are the controllers'.

const adminId = Joi.string().trim().required();
const objectId = Joi.string().hex().length(24);
const optionalId = objectId.allow('').default('');
const session = Joi.string().trim().pattern(/^\d{4}-\d{4}$/).required()
    .messages({ 'string.pattern.base': 'Choose a valid academic session.', 'any.required': 'Choose an academic session.' });
const dateKey = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/);
const fieldInvalid = { 'any.only': messages.fieldInvalid(), 'any.required': messages.fieldInvalid(), 'string.empty': messages.fieldInvalid() };

const readSchema = Joi.object({ adminId });

const structureReadSchema = Joi.object({ adminId, session: session.optional().allow('') });
const structureUpdateSchema = Joi.object({
    adminId,
    session: session.optional().allow(''),
    nextSerialNumber: Joi.string().trim().max(30).required()
        .messages({ 'string.empty': messages.serialInvalid(), 'any.required': messages.serialInvalid(), 'string.max': messages.serialInvalid() }),
    expectedSerialNumber: Joi.string().trim().max(30).allow('').default(''),
});

const listSchema = Joi.object({
    adminId,
    session,
    classId: optionalId,
    streamId: optionalId,
    sectionId: optionalId,
    search: Joi.string().trim().allow('').max(100).default(''),
    status: Joi.string().valid('', 'issued', 'notissued').default(''),
    after: optionalId,
    limit: Joi.number().integer().valid(10, 25, 50).default(10),
});

const draftSchema = Joi.object({ adminId, session, dateOfLeaving: dateKey.allow('').default('') });

const issueSchema = Joi.object({
    adminId,
    session,
    dateOfLeaving: dateKey.required()
        .messages({ 'any.required': messages.dateRequired(), 'string.empty': messages.dateRequired(), 'string.pattern.base': messages.dateRequired() }),
    reasonForLeaving: Joi.string().valid(...REASONS).required().messages(fieldInvalid),
    qualifiedForPromotion: Joi.boolean().required().messages({ 'any.required': messages.fieldInvalid(), 'boolean.base': messages.fieldInvalid() }),
    generalConduct: Joi.string().valid(...CONDUCTS).default('good').messages(fieldInvalid),
    remarks: Joi.string().trim().max(120).allow('').default('')
        .pattern(/^[A-Za-z0-9 .,'()&/-]*$/).messages({ 'string.pattern.base': messages.fieldInvalid(), 'string.max': messages.fieldInvalid() }),
    acknowledgeFeesPending: Joi.boolean().default(false),
});

const cancelSchema = Joi.object({
    adminId,
    reason: Joi.string().trim().min(3).max(200).required()
        .messages({ 'any.required': messages.cancelReasonRequired(), 'string.empty': messages.cancelReasonRequired(), 'string.min': messages.cancelReasonRequired() }),
});

module.exports = {
    readSchema,
    structureReadSchema,
    structureUpdateSchema,
    listSchema,
    draftSchema,
    issueSchema,
    cancelSchema,
};
