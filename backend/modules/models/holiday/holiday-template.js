'use strict';
const mongoose = require('mongoose');

// A named bundle of Holiday ids plus the weekly off-days (holiday/templates.md). Assigned by
// reference (`holidayTemplateId` on Staff / StudentEnrollment) — editing a template changes
// every assigned person's calendar immediately.
//
// Each school has exactly one Default template (Sunday off, seeded on first use). Anyone
// without an assigned template falls back to it, so no one silently works every day.
const HolidayTemplateSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    holidayIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'v2-holiday' }],
    // 0 = Sunday … 6 = Saturday.
    weeklyOffDays: { type: [Number], default: [0] },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

HolidayTemplateSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// One Default per school — also makes the lazy seed race-safe.
HolidayTemplateSchema.index({ adminId: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
// Holiday delete detaches the id from every template holding it.
HolidayTemplateSchema.index({ adminId: 1, holidayIds: 1 });

const HolidayTemplateV2Model = mongoose.model('v2-holiday-template', HolidayTemplateSchema);

module.exports = HolidayTemplateV2Model;
