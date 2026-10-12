'use strict';
const Joi = require('joi');
const messages = require('../../helpers/messages/fees.messages');

// Validation for the Fees module's four pages (fees/errors.md shape 1). Field-level rules
// only — duplicates, balances and in-use checks are the controllers'. Every money input is
// checked here server-side (numeric, non-negative), never frontend-trusted only.

const adminId = Joi.string().trim().required();
const objectId = Joi.string().hex().length(24);
const optionalId = objectId.allow('').default('');
const session = Joi.string().trim().pattern(/^\d{4}-\d{4}$/).required()
    .messages({ 'string.pattern.base': 'Choose a valid academic session.', 'any.required': 'Choose an academic session.' });
const search = Joi.string().trim().allow('').max(100).default('');
const page = Joi.number().integer().min(1).default(1);
const cursor = objectId.allow('').default('');
const placement = { classId: optionalId, streamId: optionalId, groupId: optionalId };

const AMOUNT_MESSAGES = {
    'number.base': messages.particularInvalid(),
    'number.min': messages.particularInvalid(),
    'number.max': messages.particularInvalid(),
    'number.unsafe': messages.particularInvalid(),
    'any.required': messages.particularInvalid(),
};
const amount = Joi.number().min(0).max(10000000);

// ---- Fee Structure ------------------------------------------------------------------------

const particular = Joi.object({
    name: Joi.string().trim().max(60).required()
        .messages({ 'string.empty': messages.particularInvalid(), 'any.required': messages.particularInvalid() }),
    amount: amount.required().messages(AMOUNT_MESSAGES),
});

const structureListSchema = Joi.object({
    adminId, session, ...placement, search, page, limit: Joi.number().integer().min(1).max(100).default(25),
});
const structureReadSchema = Joi.object({ adminId });
const structureSchema = Joi.object({
    adminId,
    session,
    classId: objectId.required().messages({ 'any.required': 'Choose a class.', 'string.empty': 'Choose a class.' }),
    streamId: optionalId,
    groupId: optionalId,
    admissionFee: amount.allow('').empty('').default(0)
        .messages({ 'number.base': 'Enter a valid amount.', 'number.min': 'Enter a valid amount.', 'number.max': 'Enter a valid amount.' }),
    particulars: Joi.array().items(particular).min(1).max(40).required()
        .messages({ 'array.min': messages.particularsRequired(), 'any.required': messages.particularsRequired() }),
});
const deleteSchema = Joi.object({ adminId, confirm: Joi.string().allow('').default('') });

// ---- Fees ---------------------------------------------------------------------------------

const feesListSchema = Joi.object({
    adminId, session, ...placement, search, after: cursor, limit: Joi.number().integer().min(1).max(100).default(25),
});
const collectSchema = Joi.object({
    adminId,
    session,
    amount: Joi.number().greater(0).max(10000000).required().messages({
        'number.base': messages.paymentAmountInvalid(),
        'number.greater': messages.paymentAmountInvalid(),
        'number.max': messages.paymentAmountInvalid(),
        'number.unsafe': messages.paymentAmountInvalid(),
        'any.required': messages.paymentAmountInvalid(),
    }),
    mode: Joi.string().valid('cash', 'online', 'cheque').default('cash'),
});
const concessionSchema = Joi.object({
    adminId,
    session,
    amount: amount.required().messages({
        'number.base': 'Enter a valid amount.', 'number.min': 'Enter a valid amount.',
        'number.max': 'Enter a valid amount.', 'any.required': 'Enter a valid amount.',
    }),
    reason: Joi.string().trim().min(3).max(300).required().messages({
        'string.empty': messages.concessionReasonRequired(),
        'string.min': messages.concessionReasonRequired(),
        'any.required': messages.concessionReasonRequired(),
    }),
});
const reportSchema = Joi.object({
    adminId,
    session,
    ...placement,
    search,
    period: Joi.string().valid('day', '7d', '15d', '1m', '3m', '6m', 'session').default('session'),
    studentIds: Joi.array().items(objectId).max(5000).default([]),
});
const sessionReadSchema = Joi.object({ adminId, session });
const readSchema = Joi.object({ adminId });

// ---- Fee Reminder -------------------------------------------------------------------------

const NUMBER_MESSAGES = {
    'number.base': messages.reminderFieldInvalid(),
    'number.integer': messages.reminderFieldInvalid(),
    'number.min': messages.reminderFieldInvalid(),
    'number.max': messages.reminderFieldInvalid(),
    'number.unsafe': messages.reminderFieldInvalid(),
};
const days = Joi.number().integer().min(0).max(3650).allow(null, '').empty('').default(null).messages(NUMBER_MESSAGES);
const filterFields = {
    classId: objectId.required().messages({
        'any.required': messages.reminderClassRequired(),
        'string.empty': messages.reminderClassRequired(),
        'string.hex': messages.reminderClassRequired(),
        'string.length': messages.reminderClassRequired(),
    }),
    paidBelowPercent: Joi.number().allow(null, '').empty('').default(null).min(0).max(100).messages({
        'number.base': messages.reminderFieldInvalid(),
        'number.min': messages.reminderPercentInvalid(),
        'number.max': messages.reminderPercentInvalid(),
    }),
    noPaymentSinceDays: days,
    gapSinceLastReminderDays: days,
};

const reminderFilterSchema = Joi.object({ adminId, ...filterFields });
const previewSchema = Joi.object({ adminId, session, ...filterFields });
const savedPreviewSchema = Joi.object({ adminId, session });
const sendSchema = Joi.object({
    adminId,
    session,
    ...filterFields,
    saveFilter: Joi.boolean().default(false),
    studentIds: Joi.array().items(objectId).min(1).max(5000).unique().required()
        .messages({ 'array.min': messages.reminderRecipientsRequired(), 'any.required': messages.reminderRecipientsRequired() }),
});
const savedSendSchema = Joi.object({
    adminId,
    session,
    studentIds: Joi.array().items(objectId).min(1).max(5000).unique().required()
        .messages({ 'array.min': messages.reminderRecipientsRequired(), 'any.required': messages.reminderRecipientsRequired() }),
});

module.exports = {
    structureListSchema,
    structureReadSchema,
    structureSchema,
    deleteSchema,
    feesListSchema,
    collectSchema,
    concessionSchema,
    reportSchema,
    sessionReadSchema,
    readSchema,
    reminderFilterSchema,
    previewSchema,
    savedPreviewSchema,
    sendSchema,
    savedSendSchema,
};
