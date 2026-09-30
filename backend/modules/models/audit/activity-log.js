'use strict';
const mongoose = require('mongoose');

// THE audit trail — one collection every v2 module writes to through
// services/activity-log.service.js, never a per-module `performedBy` shape
// (_core/additional-technical-considerations.md, "Audit / activity log").
//
// Student is the first writer: a Full (unmasked) Excel export and each reveal of a masked
// field on View Profile (student-fix4.md C). Settings' "Recent Activity" view is the reader.
//
// `changes` holds only changed fields, and never the raw value of a sensitive field — the
// log records THAT an Aadhar was revealed, not the Aadhar.
const ActivityLogSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    actorType: { type: String, enum: ['admin', 'staff', 'sales'], required: true },
    actorId: { type: String, required: true, trim: true },
    actorName: { type: String, trim: true, default: null },
    module: { type: String, required: true, trim: true },
    // Dotted verb, e.g. 'student.export.full', 'student.field.reveal'.
    action: { type: String, required: true, trim: true },
    targetId: { type: String, trim: true, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    changes: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ipAddress: { type: String, trim: true, default: null },
    userAgent: { type: String, trim: true, default: null },
    timestamp: { type: Date, default: Date.now },
});

ActivityLogSchema.index({ adminId: 1, timestamp: -1 });                 // recent activity
ActivityLogSchema.index({ adminId: 1, actorId: 1, timestamp: -1 });     // one person's trail
ActivityLogSchema.index({ adminId: 1, module: 1, targetId: 1 });        // one record's history

const ActivityLogModel = mongoose.model('activity-log', ActivityLogSchema);

module.exports = ActivityLogModel;
