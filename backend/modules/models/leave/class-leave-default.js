'use strict';
const mongoose = require('mongoose');

// A class's (class + stream + section) allowance for one leave type in one session — what
// Leave Assign's student mode sets. Saving fans out one LeaveLimit per enrolled student;
// a student admitted later has no LeaveLimit yet and inherits this value (read as the
// effective limit everywhere, materialized into a LeaveLimit on their first approval).
const ClassLeaveDefaultSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: String, required: true, trim: true },
    classId: { type: String, required: true, trim: true },
    streamId: { type: String, default: null },
    sectionId: { type: String, default: null },
    leaveTypeId: { type: String, required: true, trim: true },
    allocatedDays: { type: Number, required: true, min: 0 },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

ClassLeaveDefaultSchema.index(
    { adminId: 1, sessionId: 1, classId: 1, streamId: 1, sectionId: 1, leaveTypeId: 1 },
    { unique: true }
);
ClassLeaveDefaultSchema.index({ adminId: 1, leaveTypeId: 1 });

const ClassLeaveDefaultV2Model = mongoose.model('v2-class-leave-default', ClassLeaveDefaultSchema);

module.exports = ClassLeaveDefaultV2Model;
