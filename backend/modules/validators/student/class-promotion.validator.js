'use strict';
const Joi = require('joi');
const { objectId, session } = require('./manage-students.validator');

// Class Promotion works on ONE class at a time (the page pre-selects one), so classId is
// required here — unlike Manage Students/Admission where the filters only narrow.
const rosterQuerySchema = Joi.object({
    adminId: Joi.string().trim().required(),
    session: session.required(),
    classId: objectId.required(),
    streamId: objectId.allow('', null),
    groupId: objectId.allow('', null),
    sectionId: objectId.allow('', null),
});

const target = Joi.object({
    classId: objectId.required(),
    streamId: objectId.allow(null).default(null),
    groupId: objectId.allow(null).default(null),
    sectionId: objectId.allow(null).default(null),
});

// Only decided rows are sent; "not decided" is the absence of a row, and the preview
// reports how many of the class's students that leaves out.
const decisionsSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    session: session.required(),
    classId: objectId.required(),
    streamId: objectId.allow('', null),
    groupId: objectId.allow('', null),
    sectionId: objectId.allow('', null),
    decisions: Joi.array().items(Joi.object({
        enrollmentId: objectId.required(),
        decision: Joi.string().valid('promote', 'detain').required(),
        target: target.when('decision', { is: 'promote', then: Joi.required(), otherwise: Joi.forbidden() }),
    })).max(5000).unique('enrollmentId').required(),
});

module.exports = {
    rosterQuerySchema,
    decisionsSchema,
};
