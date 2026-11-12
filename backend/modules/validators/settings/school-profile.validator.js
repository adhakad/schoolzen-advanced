'use strict';
const Joi = require('joi');
const { BOARDS, STATES, MEDIUMS } = require('../../helpers/settings/v2-school-profile-lists');

// PUT /api/v2/settings/school-profile — every rule of settings/school-profile.md, server-side.
// The body may arrive as multipart (with a logo), so every value can be a string: Joi converts.
// Optional fields accept '' (cleared) and are stored as null by the controller.

const required = (max, message) => Joi.string().trim().max(max).required().messages({
    'any.required': message, 'string.empty': message, 'string.max': `Use at most ${max} characters.`,
});
const optional = (schema) => schema.allow('', null).optional();

const saveSchoolProfileSchema = Joi.object({
    schoolName: required(50, 'Enter the school name.'),
    board: Joi.string().trim().valid(...BOARDS).required()
        .messages({ 'any.only': 'Pick a board from the list.', 'any.required': 'Pick a board from the list.', 'string.empty': 'Pick a board from the list.' }),
    medium: Joi.string().trim().valid(...MEDIUMS).required()
        .messages({ 'any.only': 'Pick a medium from the list.', 'any.required': 'Pick a medium from the list.', 'string.empty': 'Pick a medium from the list.' }),
    affiliationNumber: required(15, 'Enter the affiliation / recognition number.'),
    schoolCode: required(15, 'Enter the school code.'),
    foundedYear: Joi.string().trim().pattern(/^(19|20)\d{2}$/).required()
        .messages({ 'string.pattern.base': 'Four digits, starting with 19 or 20.', 'any.required': 'Four digits, starting with 19 or 20.', 'string.empty': 'Four digits, starting with 19 or 20.' }),
    udiseNumber: optional(Joi.string().trim().pattern(/^\d{11}$/).messages({ 'string.pattern.base': 'UDISE number is 11 digits.' })),
    principalName: optional(Joi.string().trim().max(50).messages({ 'string.max': 'Use at most 50 characters.' })),
    street: required(100, 'Enter the street.'),
    city: required(50, 'Enter the city / town.'),
    district: required(50, 'Enter the district.'),
    state: Joi.string().trim().valid(...STATES).required()
        .messages({ 'any.only': 'Pick a state from the list.', 'any.required': 'Pick a state from the list.', 'string.empty': 'Pick a state from the list.' }),
    pinCode: Joi.string().trim().pattern(/^\d{6}$/).required()
        .messages({ 'string.pattern.base': 'Pin code is exactly 6 digits.', 'any.required': 'Pin code is exactly 6 digits.', 'string.empty': 'Pin code is exactly 6 digits.' }),
    phoneOne: Joi.string().trim().pattern(/^\d{10}$/).required()
        .messages({ 'string.pattern.base': '10 digits, numbers only.', 'any.required': '10 digits, numbers only.', 'string.empty': '10 digits, numbers only.' }),
    phoneSecond: optional(Joi.string().trim().pattern(/^\d{10}$/).messages({ 'string.pattern.base': '10 digits, numbers only.' })),
    email: Joi.string().trim().email({ tlds: { allow: false } }).max(100).required()
        .messages({ 'string.email': 'Enter a valid email.', 'any.required': 'Enter a valid email.', 'string.empty': 'Enter a valid email.' }),
    website: optional(Joi.string().trim().max(100)),
    // Required on the page; '' on a first save takes the School Name (school-profile.md).
    senderName: optional(Joi.string().trim().max(50).messages({ 'string.max': 'Use at most 50 characters.' })),
    removeLogo: optional(Joi.boolean()),
});

module.exports = { saveSchoolProfileSchema };
