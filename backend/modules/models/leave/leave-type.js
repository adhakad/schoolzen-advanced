'use strict';
const mongoose = require('mongoose');

// v2 LeaveType (leave-create.md) — the kinds of leave a school offers. Mongoose name
// 'v2-leave-type': the legacy 'leave-type' collection is never read or written by v2 code.
//
// `isPaid:false` is read by Payroll's generation logic to deduct salary for days taken
// under this type — a real cross-module dependency, kept even before Payroll exists.
const WHO_CAN_TAKE = Object.freeze(['everyone', 'staff', 'students']);

const LeaveTypeSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    whoCanTake: { type: String, enum: WHO_CAN_TAKE, default: 'everyone' },
    // The per-year default; Leave Assign overrides it per person / per class.
    defaultDays: { type: Number, required: true, min: 1, max: 366 },
    isPaid: { type: Boolean, default: true },
    // Inactive keeps the type on old requests but hides it from new ones.
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// LEAVE_TYPE_DUPLICATE — a real index (errors.md shape 9), case-insensitive.
LeaveTypeSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const LeaveTypeV2Model = mongoose.model('v2-leave-type', LeaveTypeSchema);

module.exports = LeaveTypeV2Model;
module.exports.WHO_CAN_TAKE = WHO_CAN_TAKE;
