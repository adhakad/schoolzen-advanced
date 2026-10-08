'use strict';
const mongoose = require('mongoose');

// v2 Designation (designations.md). `departmentId` is genuinely optional — a designation can
// stand alone (null). Mongoose name 'v2-designation' — the legacy 'designation' collection is
// never read or written by v2 code.
const DesignationSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    departmentId: { type: String, trim: true, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// DESIGNATION_DUPLICATE — unique within a department; a standalone designation is unique
// among the other standalone ones (departmentId: null is a real key value here).
DesignationSchema.index(
    { adminId: 1, departmentId: 1, title: 1 },
    { unique: true, collation: { locale: 'en', strength: 2 } }
);

const DesignationV2Model = mongoose.model('v2-designation', DesignationSchema);

module.exports = DesignationV2Model;
