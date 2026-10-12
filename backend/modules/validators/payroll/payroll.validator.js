'use strict';
const Joi = require('joi');

// Validation for the Payroll module's four pages (payroll/errors.md shape 1). Field-level
// rules only — existence, balance and state checks are the controllers'. Every money input
// is checked here server-side (non-negative, numeric) — never frontend-trusted only.

const adminId = Joi.string().trim().required();
const objectId = Joi.string().hex().length(24);
const optionalId = objectId.allow('').default('');
const dateKey = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ 'string.pattern.base': 'Choose a valid date.' });
const search = Joi.string().trim().allow('').max(100).default('');
const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(25);
const year = Joi.number().integer().min(2000).max(2100).required();
const month = Joi.number().integer().min(1).max(12).required();
const cursor = objectId.allow('').default('');

const AMOUNT_MESSAGES = {
    'number.base': 'Enter a valid amount.',
    'number.min': 'Enter a valid amount.',
    'number.max': 'Enter a valid amount.',
    'number.unsafe': 'Enter a valid amount.',
    'any.required': 'Enter a valid amount.',
};
const amount = Joi.number().min(0).max(10000000).messages(AMOUNT_MESSAGES);

const component = Joi.object({
    name: Joi.string().trim().max(60).required().messages({ 'string.empty': 'Name is required.', 'any.required': 'Name is required.' }),
    amount: amount.required(),
});
const components = Joi.array().items(component).max(30);

const filters = { departmentId: optionalId, designationId: optionalId, search };

// ---- Salary Groups ------------------------------------------------------------------------

const salaryGroupSchema = Joi.object({
    adminId,
    name: Joi.string().trim().max(80).required().messages({
        'string.empty': 'Name is required.',
        'any.required': 'Name is required.',
        'string.max': 'Name cannot be longer than 80 characters.',
    }),
    mode: Joi.string().valid('monthly', 'daily').default('monthly'),
    basic: amount.required(),
    hra: amount.default(0),
    allowances: components.default([]),
    deductions: components.default([]),
    status: Joi.string().valid('active', 'inactive').default('active'),
});
const salaryGroupListSchema = Joi.object({ adminId, search, page, limit: Joi.number().integer().min(1).max(100).default(10) });
const salaryGroupOptionsSchema = Joi.object({ adminId });
const deleteSchema = Joi.object({ adminId, confirm: Joi.string().allow('').default('') });

// ---- Assign Salary ------------------------------------------------------------------------

// null = "use the group's value"; 0 / [] = "none" (models/payroll/staff-salary-assignment.js).
const overrides = Joi.object({
    basic: amount.allow(null).default(null),
    hra: amount.allow(null).default(null),
    allowances: components.allow(null).default(null),
    deductions: components.allow(null).default(null),
}).default({ basic: null, hra: null, allowances: null, deductions: null });

const assignGridSchema = Joi.object({ adminId, ...filters, page, limit });
const assignSchema = Joi.object({
    adminId,
    staffId: objectId.required(),
    salaryGroupId: objectId.required().messages({ 'any.required': 'Choose a salary group.', 'string.empty': 'Choose a salary group.' }),
    effectiveFrom: dateKey.required(),
    overrides,
});
const bulkAssignSchema = Joi.object({
    adminId,
    staffIds: Joi.array().items(objectId).min(1).max(2000).unique().required(),
    salaryGroupId: objectId.required().messages({ 'any.required': 'Choose a salary group.', 'string.empty': 'Choose a salary group.' }),
    effectiveFrom: dateKey.required(),
});

// ---- Generate Payroll ---------------------------------------------------------------------

const runListSchema = Joi.object({
    adminId, ...filters, year, month,
    status: Joi.string().valid('', 'pending', 'draft', 'locked').default(''),
    after: cursor, limit,
});
const generateSchema = Joi.object({ adminId, staffId: objectId.required(), year, month });
const bulkGenerateSchema = Joi.object({ adminId, staffIds: Joi.array().items(objectId).min(1).max(2000).unique().required(), year, month });
const runActionSchema = Joi.object({ adminId });
const jobStatusSchema = Joi.object({ adminId });

// ---- Salary Payouts -----------------------------------------------------------------------

const payoutListSchema = Joi.object({
    adminId, ...filters, year, month,
    mode: Joi.string().valid('', 'bank', 'cash', 'upi').default(''),
    status: Joi.string().valid('', 'full', 'partial', 'unpaid').default(''),
    after: cursor, limit,
});
const recordPaymentSchema = Joi.object({
    adminId,
    amountPaid: Joi.number().greater(0).max(10000000).precision(2).required().messages({
        'number.base': 'Enter a valid payment amount.',
        'number.greater': 'Enter a valid payment amount.',
        'number.max': 'Enter a valid payment amount.',
        'any.required': 'Enter a valid payment amount.',
    }),
    mode: Joi.string().valid('bank', 'cash', 'upi').required().messages({ 'any.only': 'Choose a payment mode.', 'any.required': 'Choose a payment mode.' }),
    // PAYMENT_REFERENCE_REQUIRED for Bank Transfer / UPI.
    // Two separate schemas, not a base + `then`: Joi concatenates `then` onto the base, so a
    // base that allows '' would keep allowing it for Bank/UPI too.
    reference: Joi.when('mode', {
        is: Joi.valid('bank', 'upi'),
        then: Joi.string().trim().max(60).required().messages({
            'string.empty': 'Enter a reference/UTR number for this payment mode.',
            'any.required': 'Enter a reference/UTR number for this payment mode.',
        }),
        otherwise: Joi.string().trim().max(60).allow('', null).default(''),
    }),
    date: dateKey.required().messages({ 'any.required': 'Choose a valid date.' }),
});
const confirmSchema = Joi.object({ deviceInfo: Joi.object().unknown(true).default({}) });
const disputeSchema = Joi.object({
    disputeReason: Joi.string().trim().min(1).max(500).required().messages({
        'string.empty': 'Enter a reason for disputing this payment.',
        'any.required': 'Enter a reason for disputing this payment.',
    }),
});

module.exports = {
    salaryGroupSchema,
    salaryGroupListSchema,
    salaryGroupOptionsSchema,
    deleteSchema,
    assignGridSchema,
    assignSchema,
    bulkAssignSchema,
    runListSchema,
    generateSchema,
    bulkGenerateSchema,
    runActionSchema,
    jobStatusSchema,
    payoutListSchema,
    recordPaymentSchema,
    confirmSchema,
    disputeSchema,
};
