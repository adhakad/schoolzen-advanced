'use strict';
const Joi = require('joi');

// Shapes only, same split as validators/leave-assignment.js. Whether the template belongs to
// this school, and whether every person in the selection exists, stay in
// controllers/holiday-assignment.js as fail-fast checks.
//
// adminId is in the body for the same reason the leave version explains: these endpoints sit
// outside admin-auth like the rest of the attendance module, so the school has to arrive in
// the payload or a bulk assign would have no scope at all.

// ONE template per call, not an array. Unlike leave — where a person legitimately holds
// several leave types at once — a person follows exactly one holiday calendar, so the
// selection is N people and one template. See models/holiday-assignment.js.
const bulkAssignHolidaySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    templateId: Joi.string().trim().required(),
    persons: Joi.array().items(Joi.object({
        // 'student' is absent on purpose: students are assigned by CLASS through
        // bulkAssignClassHolidaySchema below, mirroring ClassShift.
        personType: Joi.string().trim().valid('staff', 'teacher').required(),
        personId: Joi.string().trim().required(),
    })).min(1).required(),
});

// The student half. `classes` carries class VALUES ('5', '200'), not student ids — one row
// per class covers the whole cohort.
const bulkAssignClassHolidaySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    templateId: Joi.string().trim().required(),
    classes: Joi.array().items(Joi.string().trim().required()).min(1).required(),
});

module.exports = { bulkAssignHolidaySchema, bulkAssignClassHolidaySchema };
