'use strict';
const Joi = require('joi');

// Validation for the Attendance module's three pages (attendance/errors.md shapes 1 + 3).
// Field-level rules only — "does this shift/person exist" and the start-before-end check
// (which carries its own code) are the controller's.

const adminId = Joi.string().trim().required();
const objectId = Joi.string().hex().length(24);
const nullableId = objectId.allow(null, '').empty('').default(null);
const hhmm = Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const dateKey = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ 'string.pattern.base': 'Pick a valid date.' });
const monthKey = Joi.string().trim().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).messages({ 'string.pattern.base': 'Pick a valid month.' });
const search = Joi.string().trim().allow('').max(100).default('');
const session = Joi.string().trim().allow('').max(20).default('');

const minutesMessages = (label) => ({
    'number.base': `${label} must be a number of minutes, 0 or more.`,
    'number.min': `${label} must be a number of minutes, 0 or more.`,
    'number.integer': `${label} must be a number of minutes, 0 or more.`,
});
const requiredMinutes = (label) => Joi.number().integer().min(0).default(0).messages(minutesMessages(label));
const optionalMinutes = (label) => Joi.number().integer().min(0).allow(null, '').empty('').default(null).messages(minutesMessages(label));

// ---- Manage Shifts ------------------------------------------------------------------------

const shiftSchema = Joi.object({
    adminId,
    name: Joi.string().trim().max(60).required().messages({
        'string.empty': 'Name, start time and end time are required.',
        'any.required': 'Name, start time and end time are required.',
        'string.max': 'Shift name cannot be longer than 60 characters',
    }),
    startTime: hhmm.required().messages({
        'string.empty': 'Name, start time and end time are required.',
        'any.required': 'Name, start time and end time are required.',
        'string.pattern.base': 'Enter a valid start time.',
    }),
    endTime: hhmm.required().messages({
        'string.empty': 'Name, start time and end time are required.',
        'any.required': 'Name, start time and end time are required.',
        'string.pattern.base': 'Enter a valid end time.',
    }),
    earlyInMinutes: requiredMinutes('Early Punch'),
    graceMinutes: requiredMinutes('Grace'),
    halfDayAfterMinutes: optionalMinutes('Half Day After'),
    earlyOutMinutes: optionalMinutes('Early Checkout'),
    lateOutMinutes: optionalMinutes('Late Checkout'),
    // Set by a caller that is editing a students-only shift: the staff-only minutes are then
    // refused (SHIFT_FIELD_NOT_APPLICABLE) rather than silently stored.
    scope: Joi.string().valid('all', 'students').default('all'),
    status: Joi.string().valid('active', 'inactive').default('active').messages({ 'any.only': 'Status must be either Active or Inactive' }),
});

const shiftListSchema = Joi.object({
    adminId,
    search,
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
});

// ---- Roster -------------------------------------------------------------------------------

const weekdays = Joi.array().items(Joi.number().integer().min(0).max(6)).unique().max(7).default([1, 2, 3, 4, 5, 6]);

const rosterGridSchema = Joi.object({
    adminId,
    month: monthKey.required(),
    departmentId: nullableId,
    designationId: nullableId,
    search,
});

const rosterAssignSchema = Joi.object({
    adminId,
    staffIds: Joi.array().items(objectId).min(1).max(1000).unique().required().messages({ 'array.min': 'Select at least one person.' }),
    shiftId: objectId.required().messages({ 'any.required': 'Select a shift.', 'string.empty': 'Select a shift.' }),
    month: monthKey.required(),
    weekdays: weekdays.min(1).messages({ 'array.min': 'Pick at least one day.' }),
    fromDate: dateKey.allow('', null).empty('').default(null),
    toDate: dateKey.allow('', null).empty('').default(null),
});

const rosterClearSchema = Joi.object({
    adminId,
    staffIds: Joi.array().items(objectId).min(1).max(1000).unique().required(),
    month: monthKey.required(),
    confirmed: Joi.boolean().valid(true).required().messages({ 'any.only': 'Type DELETE to confirm.', 'any.required': 'Type DELETE to confirm.' }),
});

const classTarget = Joi.object({
    classId: objectId.required(),
    streamId: nullableId,
    sectionId: nullableId,
});

const classShiftListSchema = Joi.object({ adminId, session });

const classShiftAssignSchema = Joi.object({
    adminId,
    session,
    targets: Joi.array().items(classTarget).min(1).max(500).required().messages({ 'array.min': 'Select at least one class.' }),
    shiftId: objectId.required().messages({ 'any.required': 'Select a shift.', 'string.empty': 'Select a shift.' }),
});

const classShiftClearSchema = Joi.object({
    adminId,
    session,
    targets: Joi.array().items(classTarget).min(1).max(500).required(),
    confirmed: Joi.boolean().valid(true).required().messages({ 'any.only': 'Type DELETE to confirm.', 'any.required': 'Type DELETE to confirm.' }),
});

// ---- Overview -----------------------------------------------------------------------------

const gridSchema = Joi.object({
    adminId,
    personType: Joi.string().valid('staff', 'student').default('staff'),
    month: monthKey.required(),
    session,
    departmentId: nullableId,
    designationId: nullableId,
    classId: nullableId,
    streamId: nullableId,
    sectionId: nullableId,
    search,
});

const dayQuerySchema = Joi.object({ adminId, date: dateKey.allow('').default('') });

const dayPunchesSchema = Joi.object({
    adminId,
    personType: Joi.string().valid('staff', 'student').required(),
    personId: objectId.required(),
    date: dateKey.required(),
});

const syncSchema = Joi.object({
    adminId,
    date: dateKey.allow('', null).empty('').default(null),
    confirmed: Joi.boolean().valid(true).required().messages({ 'any.only': 'Confirm the sync before it runs.', 'any.required': 'Confirm the sync before it runs.' }),
});

const manualSchema = Joi.object({
    adminId,
    personType: Joi.string().valid('staff', 'student').required(),
    personId: objectId.required(),
    date: dateKey.required(),
    // The enum is checked in the controller so it can answer with STATUS_INVALID.
    status: Joi.string().trim().required(),
    inTime: hhmm.allow('', null).empty('').default(null).messages({ 'string.pattern.base': 'Enter a valid in time.' }),
    outTime: hhmm.allow('', null).empty('').default(null).messages({ 'string.pattern.base': 'Enter a valid out time.' }),
    remark: Joi.string().trim().allow('', null).max(200).empty('').default(null),
});

module.exports = {
    shiftSchema,
    shiftListSchema,
    rosterGridSchema,
    rosterAssignSchema,
    rosterClearSchema,
    classShiftListSchema,
    classShiftAssignSchema,
    classShiftClearSchema,
    gridSchema,
    dayQuerySchema,
    dayPunchesSchema,
    syncSchema,
    manualSchema,
};
