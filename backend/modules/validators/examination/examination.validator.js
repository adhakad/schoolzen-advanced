'use strict';
const Joi = require('joi');
const messages = require('../../helpers/messages/examination.messages');
const { MAX_MARKS_LIMIT, GRADES_CO_SCHOLASTIC } = require('../../helpers/examination/exam-rules');

// Examination validation (examination/errors.md shape 1) — request SHAPE only. Bounds that
// depend on the class's structure (MARKS_EXCEED_MAX, schedule completeness/clash) are the
// controllers' (exam-rules), always server-side, never trusted to the Angular form.

const adminId = Joi.string().trim().required();
const objectId = Joi.string().hex().length(24);
const optionalId = objectId.allow('', null).default('');
const session = Joi.string().trim().pattern(/^\d{4}-\d{4}$/).required()
    .messages({ 'string.pattern.base': 'Choose a valid academic session.', 'any.required': 'Choose an academic session.' });
const term = Joi.string().trim().max(40);
const score = Joi.alternatives().try(Joi.number(), Joi.string().allow('')).allow(null);
const max = Joi.number().integer().min(1).max(MAX_MARKS_LIMIT).allow(null, '')
    .messages({ 'number.base': messages.marksMaxInvalid(), 'number.min': messages.marksMaxInvalid(), 'number.max': messages.marksMaxInvalid(), 'number.integer': messages.marksMaxInvalid() });
const search = Joi.string().trim().allow('').max(100).default('');
const limit = Joi.number().integer().valid(10, 25, 50).default(25);
const idList = Joi.array().items(objectId).min(1).max(200).required();

const readSchema = Joi.object({ adminId });
const sessionReadSchema = Joi.object({ adminId, session });

// Marksheet Structure
const setupQuerySchema = Joi.object({ adminId, session, classId: objectId.required(), streamId: optionalId });
const setupSaveSchema = Joi.object({
    adminId,
    session,
    classId: objectId.required(),
    streamId: optionalId,
    version: Joi.number().integer().min(0).allow(null),
    subjects: Joi.array().items(Joi.object({ subjectId: objectId.required(), theoryMax: max, practicalMax: max })).max(60).required()
        .messages({ 'array.base': messages.subjectsRequired(), 'any.required': messages.subjectsRequired() }),
});
const setupRemoveSchema = Joi.object({ adminId, session, classId: objectId.required(), streamId: optionalId, version: Joi.number().integer().min(0) });

// Generate Marksheet
const marksListSchema = Joi.object({
    adminId, session, classId: optionalId, streamId: optionalId, term: term.allow('').default(''), search, after: optionalId, limit,
});
const marksFormSchema = Joi.object({ adminId, session, term: term.required() });
const marksSaveSchema = Joi.object({
    adminId,
    session,
    term: term.required(),
    marks: Joi.array().items(Joi.object({ subjectId: objectId.required(), theory: score, practical: score })).max(60).required(),
    coScholastic: Joi.array().items(Joi.object({ area: Joi.string().trim().max(60).required(), grade: Joi.string().valid(...GRADES_CO_SCHOLASTIC).required() })).max(20).default([]),
    expectedUpdatedAt: Joi.date().allow(null, '').default(null),
    overwrite: Joi.boolean().default(false),
});
const bulkFormSchema = Joi.object({ adminId, session, term: term.required(), studentIds: idList });
const bulkSaveSchema = Joi.object({
    adminId,
    session,
    term: term.required(),
    overwrite: Joi.boolean().default(false),
    rows: Joi.array().items(Joi.object({
        studentId: objectId.required(),
        marks: Joi.array().items(Joi.object({ subjectId: objectId.required(), theory: score })).max(60).required(),
        expectedUpdatedAt: Joi.date().allow(null, '').default(null),
    })).min(1).max(200).required(),
});
const marksPrintSchema = Joi.object({ adminId, session, term: term.required(), studentIds: idList });

// Admit Card Structure
const time = Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow('');
const dateKey = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('');
const scheduleRow = Joi.object({ subjectId: objectId.required(), examDate: dateKey.required(), startTime: time.required(), endTime: time.required() })
    .messages({ 'string.pattern.base': messages.scheduleIncomplete(), 'any.required': messages.scheduleIncomplete() });
const structureBody = {
    adminId,
    session,
    classId: objectId.required(),
    streamId: optionalId,
    groupId: optionalId,
    sectionId: optionalId,
    examName: Joi.string().trim().max(60).required()
        .messages({ 'any.required': messages.examNameRequired(), 'string.empty': messages.examNameRequired(), 'string.max': messages.examNameTooLong() }),
    subjects: Joi.array().items(scheduleRow).min(1).max(60).required()
        .messages({ 'array.min': messages.scheduleIncomplete(), 'any.required': messages.scheduleIncomplete() }),
    acknowledgeWarnings: Joi.boolean().default(false),
};
const structureCreateSchema = Joi.object(structureBody);
const structureUpdateSchema = Joi.object({ ...structureBody, version: Joi.number().integer().min(1).required() });
const structureListSchema = Joi.object({
    adminId, session, search, classId: optionalId, streamId: optionalId, groupId: optionalId, sectionId: optionalId,
    page: Joi.number().integer().min(1).default(1),
});
const optionsSchema = Joi.object({ adminId, session, classId: objectId.required(), streamId: optionalId, groupId: optionalId });

// Generate Admit Card
const cardListSchema = Joi.object({
    adminId, session, classId: optionalId, streamId: optionalId, groupId: optionalId, sectionId: optionalId, search, after: optionalId, limit,
});
const cardPrintSchema = Joi.object({ adminId, session, cardIds: idList });

module.exports = {
    readSchema,
    sessionReadSchema,
    setupQuerySchema,
    setupSaveSchema,
    setupRemoveSchema,
    marksListSchema,
    marksFormSchema,
    marksSaveSchema,
    bulkFormSchema,
    bulkSaveSchema,
    marksPrintSchema,
    structureCreateSchema,
    structureUpdateSchema,
    structureListSchema,
    optionsSchema,
    cardListSchema,
    cardPrintSchema,
};
