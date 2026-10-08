'use strict';
const mongoose = require('mongoose');

// v2 Staff — the ONE collection for every teaching and administrative staff member
// (manage-staff.md, R1 unification: no separate Teacher collection). First created minimal by
// the Settings module (module 12) because Roles & Permissions and the isOwner rule needed a
// v2 person to assign roles to; the Staff module (module 3) extends this same model.
//
// NOT models/staff.js: that is the legacy 'staff' collection, which no v2 code reads or
// writes (database-design-principles.md §0). The mongoose name differs so the two can never
// be confused — re-registering 'staff' would throw OverwriteModelError anyway.

// Terminal verify-mode codes pushed to WDMS as `verify_mode` (Staff has three; Student two).
const VERIFY_MODES = Object.freeze({ CARD_ONLY: 4, CARD_AND_FINGERPRINT: 10, CARD_AND_PIN: 11 });

const StaffSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Optional, unique per school when present — bulk card-upload CSVs match on it.
    empCode: { type: String, trim: true, default: null },
    departmentId: { type: String, trim: true, default: null },
    designationId: { type: String, trim: true, default: null },
    // Display copies of the referenced Department name / Designation title. Roles &
    // Permissions filters on these; the Staff module keeps them in sync on every staff write
    // and on every Department/Designation rename.
    department: { type: String, trim: true, default: null },
    designation: { type: String, trim: true, default: null },
    joiningDate: { type: Date, default: null },
    // Teaching staff only (legacy Teacher's field, kept rather than dropped by the merge).
    education: { type: String, trim: true, default: null },
    // 'terminated' is the soft delete: Payroll, SalaryStructure, LeaveRequest and attendance
    // keep pointing at this row for historic reports, so it is never removed (errors.md).
    status: { type: String, enum: ['active', 'inactive', 'terminated'], default: 'active' },
    terminatedAt: { type: Date, default: null },
    terminatedBy: { type: String, default: null },
    archivedEmpCode: { type: String, default: null },
    cardNumber: { type: String, trim: true, default: null },
    verifyMode: { type: Number, enum: Object.values(VERIFY_MODES), default: VERIFY_MODES.CARD_ONLY },
    // The school's signup admin (roles-permissions.md): exactly one per school, set at
    // creation (owner-bootstrap.js), never editable through any endpoint. Their Super Admin
    // assignment can't be removed and they can't be deactivated or terminated.
    isOwner: { type: Boolean, default: false },
    // The legacy admin account this owner row stands for (admin token `id`).
    adminUserId: { type: String, trim: true, default: null },
    schemaVersion: { type: Number, default: 2 },
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
// Manage Staff's Department → Designation → Status filter chain (manage-staff.md).
StaffSchema.index({ adminId: 1, departmentId: 1, designationId: 1, status: 1 });
// Real uniqueness guards (errors.md shape 9), only where a value is present. Terminating a
// staff member moves their code to `archivedEmpCode` (and a card must already be removed),
// so a terminated row never holds a code or card a new hire needs.
StaffSchema.index({ adminId: 1, empCode: 1 }, { unique: true, partialFilterExpression: { empCode: { $type: 'string' } } });
StaffSchema.index({ adminId: 1, cardNumber: 1 }, { unique: true, partialFilterExpression: { cardNumber: { $type: 'string' } } });

const StaffV2Model = mongoose.model('v2-staff', StaffSchema);

module.exports = StaffV2Model;
module.exports.VERIFY_MODES = VERIFY_MODES;
