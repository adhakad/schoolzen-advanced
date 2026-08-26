'use strict';
const Joi = require('joi');

// Shapes only, the same split validators/leave-type.js uses. The business rules — end before
// start, a holiday with this name already declared for these dates — stay in
// controllers/holiday.js as sequential fail-fast checks, matching the rest of the codebase.

// Dates arrive as "YYYY-MM-DD" strings, never as ISO instants. That is the roster and leave
// convention: the frontend builds the key from its datepicker's LOCAL date parts, and
// helpers/date-only.js toUtcMidnight turns it into the stored UTC midnight. Accepting a full
// ISO string here would let a browser east of UTC send a day that is already wrong.
const DATE_KEY = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/);

const createHolidaySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    name: Joi.string().trim().required(),
    startDate: DATE_KEY.required(),
    // A single-day holiday sends the same key twice — startDate === endDate is the normal
    // case, not an edge one.
    endDate: DATE_KEY.required(),
    // The frontend sends the whole form object back on update, _id included; validate.js
    // strips unknown keys, so allow it through rather than have it silently dropped.
    _id: Joi.string().trim().allow('', null),
});

const updateHolidaySchema = createHolidaySchema.fork(
    Object.keys(createHolidaySchema.describe().keys),
    (schema) => schema.optional(),
);

module.exports = { createHolidaySchema, updateHolidaySchema };
