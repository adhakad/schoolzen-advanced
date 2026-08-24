'use strict';
const Joi = require('joi');

// Same split as validators/attendance.js: only the write endpoints get a schema, and dates
// travel as "YYYY-MM-DD" strings rather than Dates so nothing can drift a day through a
// timezone on the way in. The read endpoints take query params, which validate.js (a
// req.body validator) does not cover — those are checked inline in the controller.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const createLeaveRequestSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    personType: Joi.string().trim().valid('student', 'teacher', 'staff').required(),
    personId: Joi.string().trim().required(),
    leaveTypeId: Joi.string().trim().required(),
    fromDate: Joi.string().trim().pattern(DATE_KEY).required(),
    toDate: Joi.string().trim().pattern(DATE_KEY).required(),
    reason: Joi.string().trim().max(500).allow('', null),
    // Who is filing it. The teacher route ignores whatever arrives here and takes identity
    // from the verified token instead — see CreateTeacherLeaveRequest.
    appliedById: Joi.string().trim().allow('', null),
});

// The teacher route resolves adminId and the teacher's own personId from the JWT. Neither is
// declared here, so validate.js's stripUnknown drops them from the body before the
// controller runs — a teacher cannot file leave for another school, or as somebody else, by
// editing the request payload.
const createTeacherLeaveRequestSchema = Joi.object({
    personType: Joi.string().trim().valid('student', 'teacher').required(),
    // Ignored entirely when personType is 'teacher' (self-apply); required for a student.
    personId: Joi.string().trim().allow('', null),
    leaveTypeId: Joi.string().trim().required(),
    fromDate: Joi.string().trim().pattern(DATE_KEY).required(),
    toDate: Joi.string().trim().pattern(DATE_KEY).required(),
    reason: Joi.string().trim().max(500).allow('', null),
});

// Approve and reject share a body: who is doing it.
const actionLeaveRequestSchema = Joi.object({
    actionBy: Joi.string().trim().allow('', null),
});

module.exports = {
    createLeaveRequestSchema,
    createTeacherLeaveRequestSchema,
    actionLeaveRequestSchema,
};
