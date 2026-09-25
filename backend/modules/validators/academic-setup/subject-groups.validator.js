'use strict';
const Joi = require('joi');

// Validation for the Subject Groups page.
//
// The one rule that carries real page meaning: `streamId` is required exactly when the
// chosen class HAS streams, and forbidden when it doesn't. Joi can't know which case it is
// looking at — that depends on the Class document — so the shape here only enforces "a
// valid ObjectId or null" and the controller does the class-dependent half, where it can
// say which class and why. Same division of labour as Classes & Sections: structural rules
// here, business rules in the controller where the data to check them lives.

const objectId = Joi.string().hex().length(24);

const createSubjectGroupSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    classId: objectId.required().messages({
        'any.required': 'Please choose a class',
        'string.hex': 'Please choose a class',
    }),
    // null, not absent, is how "this class has no streams" is expressed — the frontend
    // always sends the field so the two cases are never confused with a dropped payload.
    streamId: objectId.allow(null).default(null),
    name: Joi.string().trim().max(60).required().messages({
        'string.empty': 'Group name cannot be blank',
        'string.max': 'Group name cannot be longer than 60 characters',
        'any.required': 'Group name is required',
    }),
    subjectIds: Joi.array().items(objectId).unique().default([]).messages({
        'array.unique': 'The same subject is listed twice',
    }),
});

// A group's class and stream are editable: moving "Biology Group" from Science to Commerce
// is a legitimate correction, and nothing else references the group by class.
const updateSubjectGroupSchema = createSubjectGroupSchema;

const bulkDeleteSubjectGroupsSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    ids: Joi.array().items(objectId).min(1).max(200).required().messages({
        'array.min': 'Select at least one group to delete',
        'array.max': 'Delete at most 200 groups at a time',
    }),
    confirmed: Joi.boolean().default(false),
});

module.exports = {
    createSubjectGroupSchema,
    updateSubjectGroupSchema,
    bulkDeleteSubjectGroupsSchema,
};
