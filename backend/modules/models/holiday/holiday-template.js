'use strict';
const mongoose = require('mongoose');

// A named bundle of Holiday ids (holiday/templates.md) — dated holidays only. Weekly offs
// live in the Roster, never here. Assigned by reference (`holidayTemplateId` on Staff /
// StudentEnrollment) — editing a template changes every assigned person's calendar
// immediately. Someone with no template simply has no dated holidays.
const HolidayTemplateSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    holidayIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'v2-holiday' }],
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

HolidayTemplateSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// Holiday delete detaches the id from every template holding it.
HolidayTemplateSchema.index({ adminId: 1, holidayIds: 1 });

const HolidayTemplateV2Model = mongoose.model('v2-holiday-template', HolidayTemplateSchema);

module.exports = HolidayTemplateV2Model;
