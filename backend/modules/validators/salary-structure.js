'use strict';
const Joi = require('joi');

// Shapes only. Whether the group belongs to this school, whether it is still active and
// whether the staff member exists stay in controllers/salary-structure.js.

const componentList = Joi.array().items(Joi.object({
    name: Joi.string().trim().required(),
    amount: Joi.number().min(0).required(),
}));

// EVERY OVERRIDE ALLOWS null AND ONLY null AS ITS "UNSET" VALUE.
//
// null means "use the group's value". An override of 0 is a real instruction (this person
// gets no HRA) and has to survive the round trip, which is why these are .allow(null)
// rather than .optional() with a falsy default — and why controllers/payroll.js tests
// `=== null`, never truthiness. See models/salary-structure.js.
const overrideFields = {
    overrideBasic: Joi.number().min(0).allow(null).default(null),
    overrideHra: Joi.number().min(0).allow(null).default(null),
    overrideAllowances: componentList.allow(null).default(null),
    overrideDeductions: componentList.allow(null).default(null),
};

const assignSalarySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    staffId: Joi.string().trim().required(),
    salaryGroupId: Joi.string().trim().required(),
    effectiveFrom: Joi.date().required(),
    ...overrideFields,
});

// N staff, ONE group — the mirror of bulkAssignHolidaySchema. Overrides are deliberately
// absent: a bulk assign is "put these twelve people on this scale", and a value that applied
// to all twelve of them belongs in the group itself, not repeated as an override on each.
const bulkAssignSalarySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    salaryGroupId: Joi.string().trim().required(),
    effectiveFrom: Joi.date().required(),
    staffIds: Joi.array().items(Joi.string().trim().required()).min(1).required(),
});

module.exports = { assignSalarySchema, bulkAssignSalarySchema };
