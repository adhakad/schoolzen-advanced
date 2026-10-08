'use strict';
const mongoose = require('mongoose');

// v2 LeaveLimit (leave-assign.md) — one person's yearly allowance for one leave type in one
// academic session. `usedDays` changes ONLY inside Leave Requests' approve/cancel
// transactions. Never cached (leave/optimization.md): it is the balance-gating field.
//
// `source` tells a class re-assign what it may touch: 'class' rows follow their class's
// default, 'override' rows were set for that one student and are left alone unless the
// admin confirms overwriting them; staff rows are always 'staff'.
const SOURCES = Object.freeze(['staff', 'class', 'override']);

const LeaveLimitSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: String, required: true, trim: true },
    personType: { type: String, enum: ['staff', 'student'], required: true },
    personId: { type: String, required: true, trim: true },
    leaveTypeId: { type: String, required: true, trim: true },
    allocatedDays: { type: Number, required: true, min: 0 },
    usedDays: { type: Number, default: 0, min: 0 },
    source: { type: String, enum: SOURCES, required: true },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// The upsert-and-skip bulk assign only works if this is genuinely unique (errors.md).
LeaveLimitSchema.index({ adminId: 1, sessionId: 1, personType: 1, personId: 1, leaveTypeId: 1 }, { unique: true });
// Leave Type delete's cascade count.
LeaveLimitSchema.index({ adminId: 1, leaveTypeId: 1 });

const LeaveLimitV2Model = mongoose.model('v2-leave-limit', LeaveLimitSchema);

module.exports = LeaveLimitV2Model;
module.exports.SOURCES = SOURCES;
