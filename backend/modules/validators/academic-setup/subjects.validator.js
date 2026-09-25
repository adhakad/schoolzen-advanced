'use strict';
const Joi = require('joi');

// Validation for the Subjects page. Three real fields, so the rules here are mostly about
// the two enums being closed sets: `type` and `status` drive the table's tag colours and
// the Subject Groups checklist, and an unexpected value would render as a blank chip
// rather than fail loudly.
//
// Uniqueness of `name` is NOT checked here — that is the database's collated unique index
// plus the controller's own pre-check, which can say WHICH name collided.

const nameSchema = Joi.string().trim().max(60).required().messages({
    'string.empty': 'Subject name cannot be blank',
    'string.max': 'Subject name cannot be longer than 60 characters',
    'any.required': 'Subject name is required',
});

const createSubjectSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    name: nameSchema,
    type: Joi.string().valid('core', 'elective').default('core').messages({
        'any.only': 'Type must be either Core or Elective',
    }),
    status: Joi.string().valid('active', 'inactive').default('active').messages({
        'any.only': 'Status must be either Active or Inactive',
    }),
});

// Every field is editable — unlike Class, a Subject has no identity field other than its
// own _id, so renaming one is a normal edit rather than a new record.
const updateSubjectSchema = createSubjectSchema;

// "Delete Selected" sends the whole selection in one request, so one bulkWrite can serve it
// rather than N round-trips (performance-principles.md). `confirmed` is the server-side
// backstop behind the UI's type-to-DELETE gate: without it, a delete that would strand a
// Subject Group is refused.
const bulkDeleteSubjectsSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    ids: Joi.array().items(Joi.string().hex().length(24)).min(1).max(200).required().messages({
        'array.min': 'Select at least one subject to delete',
        'array.max': 'Delete at most 200 subjects at a time',
        'string.hex': 'One of the selected subjects has an invalid id',
    }),
    confirmed: Joi.boolean().default(false),
});

module.exports = { createSubjectSchema, updateSubjectSchema, bulkDeleteSubjectsSchema };
