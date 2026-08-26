'use strict';
const Joi = require('joi');

// Shapes only, same split as validators/holiday.js. Whether every id in holidayIds actually
// belongs to this school is a business rule and stays in controllers/holiday-template.js as a
// fail-fast check with a specific message.

const createHolidayTemplateSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    name: Joi.string().trim().required(),
    // An empty template is allowed on purpose: naming the year first and adding holidays to
    // it afterwards is the order an admin actually works in.
    holidayIds: Joi.array().items(Joi.string().trim()).default([]),
    _id: Joi.string().trim().allow('', null),
});

const updateHolidayTemplateSchema = createHolidayTemplateSchema.fork(
    Object.keys(createHolidayTemplateSchema.describe().keys),
    (schema) => schema.optional(),
);

// PUT /:id/add-holiday and /:id/remove-holiday — the "holidays in this template" sub-list.
// One id at a time, because that is what a checkbox toggle sends.
const templateHolidaySchema = Joi.object({
    holidayId: Joi.string().trim().required(),
});

// POST /generate-from-public. `state` and `year` pick the system-holiday document to clone;
// `templateName` is the admin's own name for the result, never derived from the preset — the
// spec is explicit that the school names it themselves.
const generateFromPublicSchema = Joi.object({
    adminId: Joi.string().trim().required(),
    state: Joi.string().trim().required(),
    year: Joi.number().integer().min(2000).max(2100).required(),
    templateName: Joi.string().trim().required(),
});

module.exports = {
    createHolidayTemplateSchema,
    updateHolidayTemplateSchema,
    templateHolidaySchema,
    generateFromPublicSchema,
};
