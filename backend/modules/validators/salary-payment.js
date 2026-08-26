'use strict';
const Joi = require('joi');

// Shapes only. That the referenced payroll exists, belongs to this school, is LOCKED, and
// still has room for this amount are all checked in controllers/salary-payment.js — the last
// one inside a transaction, so two concurrent partial payments cannot both pass it.
//
// The reserved payout fields (payoutMode / payoutGatewayId / payoutStatus, see
// models/salary-payment.js) are DELIBERATELY ABSENT from this schema. validate.js strips
// unknown keys, so a client cannot set them even by accident — this phase records manual
// payments only, and the model defaults are the only values they ever take.
const recordPaymentSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    payrollId: Joi.string().trim().required(),
    staffId: Joi.string().trim().required(),
    // min(1): a zero-rupee payment records nothing and would still count as a row against
    // the balance.
    amountPaid: Joi.number().min(1).required(),
    paymentDate: Joi.date().required(),
    paymentMode: Joi.string().trim().valid('cash', 'bankTransfer', 'upi', 'cheque').required(),
    referenceNumber: Joi.string().trim().allow('', null),
    paidBy: Joi.string().trim().required(),
    remarks: Joi.string().trim().allow('', null),
});

module.exports = { recordPaymentSchema };
