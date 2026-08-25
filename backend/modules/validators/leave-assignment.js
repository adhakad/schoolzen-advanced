'use strict';
const Joi = require('joi');

// Shapes only, same split as validators/leave-type.js. The business rules — does this leave
// type belong to this school, does it apply to this kind of person — stay in
// controllers/leave-assignment.js as fail-fast checks.

// The redesign brief specifies the body as { leaveTypeIds, persons }. adminId is added here
// because nothing else in this route group carries the tenant: these endpoints sit outside
// admin-auth like the rest of the leave module, so the school has to arrive in the payload
// or a bulk assign would have no scope at all.
const bulkAssignLeaveSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    leaveTypeIds: Joi.array().items(Joi.string().trim().required()).min(1).required(),
    persons: Joi.array().items(Joi.object({
        personType: Joi.string().trim().valid('staff', 'teacher', 'student').required(),
        personId: Joi.string().trim().required(),
    })).min(1).required(),
});

module.exports = { bulkAssignLeaveSchema };
