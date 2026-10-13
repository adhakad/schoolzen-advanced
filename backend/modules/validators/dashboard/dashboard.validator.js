'use strict';
const Joi = require('joi');

// Validation for the Dashboard's two reads — shapes only. adminId is checked against the
// token by assertAdminScope; whether the viewer may see a widget is the controller's check.

const adminId = Joi.string().trim().required();
const session = Joi.string().trim().allow('').max(20).default('');
const month = Joi.string().trim().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).allow('').default('');

const dashboardSchema = Joi.object({ adminId, session });

const widgetSchema = Joi.object({ adminId, session, month });

module.exports = {
    dashboardSchema,
    widgetSchema,
};
