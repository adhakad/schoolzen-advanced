'use strict';
const Joi = require('joi');

// Shapes only, same split as validators/leave-type.js. Whether a name is already taken, and
// whether a group can still be deleted, stay in controllers/salary-group.js as fail-fast
// checks with specific messages.
//
// adminId is in the BODY for the same reason the leave and holiday validators explain: these
// endpoints sit outside admin-auth like the rest of the attendance/payroll module, so the
// school has to arrive in the payload or the query would have no scope at all.

// [{ name, amount }] — the flexible component list. amount allows 0 so a placeholder row can
// be saved before the number is known, and min(0) because a negative allowance is a
// deduction entered in the wrong list.
const componentList = Joi.array().items(Joi.object({
    name: Joi.string().trim().required(),
    amount: Joi.number().min(0).required(),
}));

const createSalaryGroupSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    name: Joi.string().trim().required(),
    basic: Joi.number().min(0).required(),
    hra: Joi.number().min(0).default(0),
    allowances: componentList.default([]),
    deductions: componentList.default([]),
    calculationMode: Joi.string().trim().valid('perMonth', 'perDay').default('perMonth'),
    status: Joi.string().trim().valid('active', 'inactive').default('active'),
});

const updateSalaryGroupSchema = createSalaryGroupSchema.fork(
    Object.keys(createSalaryGroupSchema.describe().keys),
    (schema) => schema.optional(),
);

module.exports = { createSalaryGroupSchema, updateSalaryGroupSchema };
