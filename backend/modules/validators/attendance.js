'use strict';
const Joi = require('joi');

// Only the two write endpoints get a schema. The read endpoints take query params, which
// validate.js (a req.body validator) does not cover — those are checked inline in the
// controller, the same way controllers/roster.js guards its own period params.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Manual entry writes straight into DailyAttendance with isOverridden: true, which makes
// the row permanently unmatchable by the reconcile worker — so the status must be one an
// admin actually chose, not a free string.
const manualAttendanceSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    personType: Joi.string().trim().valid('student', 'teacher', 'staff').required(),
    personId: Joi.string().trim().required(),
    date: Joi.string().trim().pattern(DATE_KEY).required(),
    status: Joi.string().trim().valid('Present', 'Absent', 'HalfDay', 'Late', 'Leave', 'Holiday').required(),
    // Wall-clock "HH:mm", same format as AttendanceRule.workStart and Shift.startTime.
    // Empty string allowed so the form can clear a time without sending null.
    inTime: Joi.string().trim().pattern(HH_MM).allow('', null),
    outTime: Joi.string().trim().pattern(HH_MM).allow('', null),
    // Who made the correction — surfaced on the row so an override is attributable.
    overriddenBy: Joi.string().trim().allow('', null),
});

const syncNowSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    date: Joi.string().trim().pattern(DATE_KEY).required(),
});

module.exports = { manualAttendanceSchema, syncNowSchema };
