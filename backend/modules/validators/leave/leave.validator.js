'use strict';
const Joi = require('joi');

// Validation for the Leave module's three pages (leave/errors.md shapes 1 + 3). Field-level
// rules only — existence, balance, overlap and state checks are the controllers'.

const adminId = Joi.string().trim().required();
const objectId = Joi.string().hex().length(24);
const optionalId = objectId.allow('').default('');
const nullableId = objectId.allow(null, '').empty('').default(null);
const dateKey = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ 'string.pattern.base': 'Choose a valid date range.' });
const monthKey = Joi.string().trim().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).messages({ 'string.pattern.base': 'Pick a valid month.' });
const search = Joi.string().trim().allow('').max(100).default('');
const session = Joi.string().trim().allow('').max(20).default('');
const personType = Joi.string().valid('staff', 'student');
const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(10);
const days = Joi.number().integer().min(0).max(366).required().messages({
    'number.base': 'Enter a valid number of days.',
    'number.integer': 'Enter a valid number of days.',
    'number.min': 'Enter a valid number of days.',
    'number.max': 'Enter a valid number of days.',
    'any.required': 'Enter a valid number of days.',
});

// The shared Person Type → Dept/Designation | Class/Stream/Group/Section filter.
const personFilters = {
    departmentId: optionalId,
    designationId: optionalId,
    classId: optionalId,
    streamId: optionalId,
    groupId: optionalId,
    sectionId: optionalId,
    search,
};

// ---- Leave Create -------------------------------------------------------------------------

const leaveTypeSchema = Joi.object({
    adminId,
    name: Joi.string().trim().max(60).required().messages({
        'string.empty': 'Name is required.',
        'any.required': 'Name is required.',
        'string.max': 'Name cannot be longer than 60 characters.',
    }),
    whoCanTake: Joi.string().valid('everyone', 'staff', 'students').default('everyone'),
    // Server-side too — a direct API call can't save -5 or a string (errors.md shape 1).
    defaultDays: Joi.number().integer().min(1).max(366).required().messages({
        'number.base': 'Enter a valid number of days.',
        'number.integer': 'Enter a valid number of days.',
        'number.min': 'Enter a valid number of days.',
        'number.max': 'Enter a valid number of days.',
        'any.required': 'Enter a valid number of days.',
    }),
    isPaid: Joi.boolean().default(true),
    status: Joi.string().valid('active', 'inactive').default('active'),
});

const leaveTypeListSchema = Joi.object({ adminId, search, page, limit });
const leaveTypeOptionsSchema = Joi.object({ adminId, applicableTo: personType.allow('').default('') });

// ---- Requests -----------------------------------------------------------------------------

const requestListSchema = Joi.object({
    adminId,
    session,
    personType: personType.default('staff'),
    ...personFilters,
    leaveTypeId: optionalId,
    status: Joi.string().valid('', 'Pending', 'Approved', 'Rejected', 'Cancelled').default(''),
    month: monthKey.allow('').default(''),
    page,
    limit,
});

const peopleOptionsSchema = Joi.object({ adminId, session, personType: personType.required(), search });

const balanceSchema = Joi.object({
    adminId, session, personType: personType.required(), personId: objectId.required(), leaveTypeId: objectId.required(),
});

const createRequestSchema = Joi.object({
    adminId,
    session,
    personType: personType.required(),
    personId: objectId.required().messages({ 'any.required': 'Choose who this leave is for.', 'string.empty': 'Choose who this leave is for.' }),
    leaveTypeId: objectId.required().messages({ 'any.required': 'Choose a leave type.', 'string.empty': 'Choose a leave type.' }),
    fromDate: dateKey.required().messages({ 'any.required': 'Choose a valid date range.' }),
    toDate: dateKey.required().messages({ 'any.required': 'Choose a valid date range.' }),
    reason: Joi.string().trim().allow('', null).max(300).default(null),
    allowPastDates: Joi.boolean().default(false),
});

// forceApprove is honoured only here, on the admin route (leave-requests.md).
const approveSchema = Joi.object({ adminId, forceApprove: Joi.boolean().default(false) });
const rejectSchema = Joi.object({ adminId });
const cancelSchema = Joi.object({ adminId, reason: Joi.string().trim().allow('', null).max(300).default(null) });

// ---- Assign -------------------------------------------------------------------------------

const assignItems = Joi.array().items(Joi.object({ leaveTypeId: objectId.required(), days })).max(50).default([]);

const staffGridSchema = Joi.object({ adminId, session, ...personFilters, page, limit: Joi.number().integer().min(1).max(200).default(25) });
const staffBulkSchema = Joi.object({
    adminId,
    session,
    personIds: Joi.array().items(objectId).max(2000).unique().default([]),
    items: assignItems,
});

const classGridSchema = Joi.object({ adminId, session, classId: optionalId, streamId: optionalId, sectionId: optionalId });
const classStudentsSchema = Joi.object({
    adminId, session, classId: objectId.required(), streamId: nullableId, sectionId: nullableId, groupId: optionalId,
});
const classAssignSchema = Joi.object({
    adminId,
    session,
    targets: Joi.array().items(Joi.object({ classId: objectId.required(), streamId: nullableId, sectionId: nullableId })).max(200).default([]),
    items: assignItems,
    overwriteOverrides: Joi.boolean().default(false),
    // The typed/explicit confirm behind overwriting overrides.
    confirmed: Joi.boolean().default(false),
});

const personLimitSchema = Joi.object({
    adminId, session, personType: personType.required(), personId: objectId.required(), leaveTypeId: objectId.required(), days,
});

module.exports = {
    leaveTypeSchema,
    leaveTypeListSchema,
    leaveTypeOptionsSchema,
    requestListSchema,
    peopleOptionsSchema,
    balanceSchema,
    createRequestSchema,
    approveSchema,
    rejectSchema,
    cancelSchema,
    staffGridSchema,
    staffBulkSchema,
    classGridSchema,
    classStudentsSchema,
    classAssignSchema,
    personLimitSchema,
};
