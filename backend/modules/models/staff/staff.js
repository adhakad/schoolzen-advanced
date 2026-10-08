'use strict';
const mongoose = require('mongoose');

// v2 Staff — MINIMAL, created by the Settings module (module 12) because Roles &
// Permissions' Step 2 and the isOwner rule need a v2 person to assign roles to, and the
// Staff module (module 3) has not been built yet. The Staff module EXTENDS this same model
// (photo, contact, bank, biometric…) rather than creating a second one.
//
// NOT models/staff.js: that is the legacy 'staff' collection, which no v2 code reads or
// writes (database-design-principles.md §0). The mongoose name differs so the two can never
// be confused — re-registering 'staff' would throw OverwriteModelError anyway.
const StaffSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    empCode: { type: String, trim: true, default: null },
    departmentId: { type: String, trim: true, default: null },
    designationId: { type: String, trim: true, default: null },
    // Display copies until v2 Department/Designation exist — filters read these.
    department: { type: String, trim: true, default: null },
    designation: { type: String, trim: true, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    // The school's signup admin (roles-permissions.md): exactly one per school, set at
    // creation (owner-bootstrap.js), never editable through any Settings endpoint. Their
    // Super Admin assignment can't be removed by anyone.
    isOwner: { type: Boolean, default: false },
    // The legacy admin account this owner row stands for (admin token `id`).
    adminUserId: { type: String, trim: true, default: null },
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Exactly one owner per school — a real index, which also makes the owner bootstrap's upsert
// race-safe (two concurrent first requests end with one row).
StaffSchema.index({ adminId: 1 }, { unique: true, partialFilterExpression: { isOwner: true } });
// The matrix's keyset scan: this school's staff, by _id.
StaffSchema.index({ adminId: 1, status: 1, _id: 1 });
StaffSchema.index({ adminId: 1, name: 1 });

const StaffV2Model = mongoose.model('v2-staff', StaffSchema);

module.exports = StaffV2Model;
