'use strict';
const mongoose = require('mongoose');

// A school's own profile for v2 (letterhead, print headers, state-specific admission fields,
// reminder sender name). Fresh v2 collection (shared-fix5 Rule 23.7): nothing is ever copied
// from the legacy `schools` collection. One row per school; until it is set every reader
// handles "not set yet" (letterhead falls back to "SCHOOL", state-specific fields to none).
const SchoolProfileSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    schoolName: { type: String, trim: true, default: null },
    schoolLogo: { type: String, trim: true, default: null },
    schoolLogoPublicId: { type: String, trim: true, default: null },
    affiliationNumber: { type: String, trim: true, default: null },
    schoolCode: { type: String, trim: true, default: null },
    foundedYear: { type: Number, default: null },
    udiseNumber: { type: String, trim: true, default: null },
    principalName: { type: String, trim: true, default: null },
    board: { type: String, trim: true, default: null },
    medium: { type: String, trim: true, default: null },
    street: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    district: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: 'India' },
    pinCode: { type: String, trim: true, default: null },
    phoneOne: { type: String, trim: true, default: null },
    phoneSecond: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    website: { type: String, trim: true, default: null },
    // Sender name in WhatsApp fee reminders; defaults to schoolName on the first save.
    senderName: { type: String, trim: true, default: null },
    // Shown as "Last saved ... by <name>" (resolved the same way as the activity log actor).
    updatedByName: { type: String, trim: true, default: null },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

SchoolProfileSchema.index({ adminId: 1 }, { unique: true });

const SchoolProfileV2Model = mongoose.model('v2-school-profile', SchoolProfileSchema, 'v2-school-profiles');

module.exports = SchoolProfileV2Model;
