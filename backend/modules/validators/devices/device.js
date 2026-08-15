'use strict';
const Joi = require('joi');

// Devices are never created via free-typed input (only via WDMS sync), so there's no
// createDeviceSchema here — just the action payloads that actually accept a body.
const assignDeviceSchema = Joi.object({
    deviceId: Joi.string().trim().required(),
    schoolId: Joi.string().trim().required(),
});

module.exports = { assignDeviceSchema };
