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
    // Admin-only escape hatch past the "no leave for past dates" guard, for backfilling a
    // genuine correction. Declared HERE and deliberately not on the teacher schema below, so
    // stripUnknown drops it from a teacher's payload before the controller ever sees it.
    allowPastDates: Joi.boolean().default(false),
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

// Reject: who is doing it, and nothing else.
const actionLeaveRequestSchema = Joi.object({
    actionBy: Joi.string().trim().allow('', null),
});

// Approve carries one thing reject must not: the balance override. Kept as a separate schema
// rather than a shared optional field so a forceApprove sent to /reject is stripped as
// unknown instead of quietly accepted against a handler that has no such concept.
const approveLeaveRequestSchema = Joi.object({
    actionBy: Joi.string().trim().allow('', null),
    forceApprove: Joi.boolean().default(false),
});

// Cancel: the reason is REQUIRED. An approved leave being taken back removes attendance days
// that were already marked, and a bare status flip leaves nobody able to explain them later.
const cancelLeaveRequestSchema = Joi.object({
    cancellationReason: Joi.string().trim().max(500).required(),
    actionBy: Joi.string().trim().allow('', null),
});

module.exports = {
    createLeaveRequestSchema,
    createTeacherLeaveRequestSchema,
    actionLeaveRequestSchema,
    approveLeaveRequestSchema,
    cancelLeaveRequestSchema,
};
