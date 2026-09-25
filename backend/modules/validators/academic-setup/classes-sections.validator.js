'use strict';
const Joi = require('joi');

// Validation for the Classes & Sections page. The rules here are the ones the page's
// design states, not generic field checks:
//
//   - `hasStreams` decides which half of the payload may be populated. A class with
//     streams keeps its sections under each stream, never on the class itself, so sending
//     both is a contradiction rather than a harmless extra.
//   - A stream with ZERO sections is valid and expected ("Commerce — None, add one if this
//     stream needs sections"), so `sections` is never required. A class with streams but
//     NO streams is not — turning the toggle on and saving nothing would leave the class
//     with nowhere to put a section.
//   - Names are compared case-insensitively for uniqueness, because they are stored
//     normalised (streams lowercase, sections uppercase) and "science"/"Science" would
//     otherwise both save and then collide on read.

// Case-insensitive uniqueness, so 'Science' and 'science' count as the same name.
const uniqueByName = (message) => (value, helpers) => {
    const seen = new Set();
    for (const item of value) {
        const key = String(item.name || '').trim().toLowerCase();
        if (seen.has(key)) return helpers.message(message);
        seen.add(key);
    }
    return value;
};

const sectionSchema = Joi.object({
    name: Joi.string().trim().max(30).required().messages({
        'string.empty': 'Section name cannot be blank',
        'any.required': 'Section name is required',
    }),
});

const streamSchema = Joi.object({
    name: Joi.string().trim().max(50).required().messages({
        'string.empty': 'Stream name cannot be blank',
        'any.required': 'Stream name is required',
    }),
    sections: Joi.array()
        .items(sectionSchema)
        .default([])
        .custom(uniqueByName('Two sections in this stream have the same name')),
});

const createClassSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    class: Joi.number().required().messages({
        'any.required': 'Please choose a class',
    }),
    hasStreams: Joi.boolean().default(false),

    // when(hasStreams) is what makes the toggle a real structural switch rather than a
    // cosmetic one: each branch forbids the other branch's data outright.
    sections: Joi.when('hasStreams', {
        is: true,
        then: Joi.array().max(0).default([]).messages({
            'array.max': 'A class with streams keeps its sections under each stream',
        }),
        otherwise: Joi.array()
            .items(sectionSchema)
            .default([])
            .custom(uniqueByName('Two sections have the same name')),
    }),

    streams: Joi.when('hasStreams', {
        is: true,
        then: Joi.array()
            .items(streamSchema)
            .min(1)
            .required()
            .custom(uniqueByName('Two streams have the same name'))
            .messages({
                'array.min': 'Add at least one stream, or turn the streams toggle off',
            }),
        otherwise: Joi.array().max(0).default([]).messages({
            'array.max': 'Turn the streams toggle on before adding streams',
        }),
    }),
});

// The class number is the record's identity and the join key every other collection uses,
// so an edit may restructure everything except which class it is.
const updateClassSchema = createClassSchema.fork(['class'], (schema) => schema.forbidden());

// "Delete Selected" sends the whole selection in one request, so one deleteMany can serve
// it rather than N round-trips (performance-principles.md). `confirmed` is the server-side
// backstop behind the UI's type-to-DELETE gate.
const bulkDeleteClassesSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    ids: Joi.array().items(Joi.string().hex().length(24)).min(1).max(50).required().messages({
        'array.min': 'Select at least one class to delete',
        'array.max': 'Delete at most 50 classes at a time',
    }),
    confirmed: Joi.boolean().default(false),
});

module.exports = { createClassSchema, updateClassSchema, bulkDeleteClassesSchema };
