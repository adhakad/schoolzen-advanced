'use strict';
const Joi = require('joi');

// Shapes only. That the payroll exists, is LOCKED and has a payment against it are all
// fail-fast checks with specific messages in controllers/salary-slip.js — a Joi schema cannot
// look at another collection.
//
// slipNumber is DELIBERATELY ABSENT: it is allocated server-side against a unique index, and
// accepting one from the client would let a caller mint a duplicate or a nonsense number onto
// what is meant to be an audit record. Same reason the reserved payout fields are absent —
// validate.js strips unknown keys, so neither can be set even by accident.
const generateSalarySlipSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    payrollId: Joi.string().trim().required(),
    // Printed on the slip as its digital footprint. Optional: the controller falls back to
    // adminId so a slip is always attributable to somebody.
    generatedBy: Joi.string().trim().allow('', null),
});

module.exports = { generateSalarySlipSchema };
