'use strict';
const Joi = require('joi');

// Plain fields, typed by an admin. NOTHING here is validated against a live bank API — no
// IFSC lookup, no account verification — per this phase scope. See
// models/person-bank-details.js.
//
// Every field but the two ids is optional and allows the empty string: details arrive
// piecemeal (the UPI id today, the account number when payroll asks for it), and refusing a
// partial save would mean the admin has to hold the rest in their head.
const savePersonBankDetailsSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    personType: Joi.string().trim().valid('staff', 'teacher').required(),
    personId: Joi.string().trim().required(),
    accountHolderName: Joi.string().trim().allow('', null),
    accountNumber: Joi.string().trim().allow('', null),
    ifscCode: Joi.string().trim().allow('', null),
    bankName: Joi.string().trim().allow('', null),
    upiId: Joi.string().trim().allow('', null),
});

module.exports = { savePersonBankDetailsSchema };
