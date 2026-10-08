'use strict';
const mongoose = require('mongoose');

// v2 LeaveRequest (leave-requests.md). Status moves Pending → Approved | Rejected, and
// Approved → Cancelled ("Take Back"). Every transition is a conditional write on the
// current status (errors.md shape 9), never a read-then-write.
//
// Dates are calendar "YYYY-MM-DD" keys (helpers/date-only.js), never instants.
const STATUSES = Object.freeze(['Pending', 'Approved', 'Rejected', 'Cancelled']);

const LeaveRequestSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: String, required: true, trim: true },
    personType: { type: String, enum: ['staff', 'student'], required: true },
    personId: { type: String, required: true, trim: true },
    leaveTypeId: { type: String, required: true, trim: true },
    fromDateKey: { type: String, required: true },
    toDateKey: { type: String, required: true },
    // Working days in the range at filing time — recomputed at approval.
    days: { type: Number, required: true, min: 1 },
    reason: { type: String, trim: true, default: null },
    status: { type: String, enum: STATUSES, default: 'Pending' },
    // usedDays added on approval — exactly what Take Back gives back.
    chargedDays: { type: Number, default: 0 },
    // The attendance days THIS leave wrote, so Take Back removes exactly those.
    attendanceDateKeys: { type: [String], default: [] },
    forceApproved: { type: Boolean, default: false },
    actionedBy: { type: String, default: null },
    actionedAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: null },
    createdBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// The Requests table: one school, one session, by status and range.
LeaveRequestSchema.index({ adminId: 1, sessionId: 1, status: 1, fromDateKey: -1 });
// The overlap check and a person's own history.
LeaveRequestSchema.index({ adminId: 1, personType: 1, personId: 1, fromDateKey: 1 });
// Leave Type delete's cascade count.
LeaveRequestSchema.index({ adminId: 1, leaveTypeId: 1 });

const LeaveRequestV2Model = mongoose.model('v2-leave-request', LeaveRequestSchema);

module.exports = LeaveRequestV2Model;
module.exports.STATUSES = STATUSES;
