'use strict';
const mongoose = require('mongoose');

// v2 Department (departments.md). Referenced by Staff.departmentId and
// Designation.departmentId. Mongoose name 'v2-department' — the legacy 'department'
// collection is never read or written by v2 code.
const DepartmentSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// DEPARTMENT_DUPLICATE — case-insensitive, so "Science" and "science" collide.
DepartmentSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const DepartmentV2Model = mongoose.model('v2-department', DepartmentSchema);

module.exports = DepartmentV2Model;
