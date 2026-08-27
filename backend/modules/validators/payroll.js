'use strict';
const Joi = require('joi');

// Shapes only. Whether a payroll is already LOCKED, whether the staff member has a salary
// group and whether the month has any working days at all are all fail-fast checks with
// specific messages in controllers/payroll.js.
//
// The pagination endpoint takes a filters object like every other list in this codebase and
// is validated inline in the controller, not here.

// 1-12 (August = 8), NEVER JS 0-11 — the same frame models/payroll.js and
// helpers/date-only.js parseDateKey use.
const MONTH = Joi.number().integer().min(1).max(12).required();
// Wide enough to regenerate an old year and to pre-generate the next one, narrow enough that
// a typo of 20226 is caught here rather than producing an empty payroll nobody can explain.
const YEAR = Joi.number().integer().min(2000).max(2100).required();

const generatePayrollSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    personType: Joi.string().trim().valid('staff', 'teacher').required(),
    personId: Joi.string().trim().required(),
    month: MONTH,
    year: YEAR,
});

// ONE personType per bulk call — see the handler header in controllers/payroll.js.
const bulkGeneratePayrollSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    personType: Joi.string().trim().valid('staff', 'teacher').required(),
    month: MONTH,
    year: YEAR,
    personIds: Joi.array().items(Joi.string().trim().required()).min(1).required(),
});

const lockPayrollSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    lockedBy: Joi.string().trim().allow('', null),
});

// valid(true) IS THE CONFIRMATION GATE, and it lives here on purpose.
//
// Unlocking a finalised payroll is the one action in this module that undoes a decision. A
// controller-level truthiness check would be one refactor away from being dropped; a schema
// that literally cannot accept false or a missing flag means the confirmation checkbox in
// the UI is backed by something structural rather than by a convention.
const unlockPayrollSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    confirm: Joi.boolean().valid(true).required(),
    unlockedBy: Joi.string().trim().allow('', null),
});

module.exports = {
    generatePayrollSchema,
    bulkGeneratePayrollSchema,
    lockPayrollSchema,
    unlockPayrollSchema,
};
