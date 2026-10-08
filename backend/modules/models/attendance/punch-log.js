'use strict';
const mongoose = require('mongoose');

// v2 PunchLog — the FAST path's raw landing table (attendance-overview.md). Written by
// insertMany only, deduped by `punchHash = sha1(adminId|personId|punchTime)`: a retried
// delivery fails the unique index and is skipped, never duplicated. No status lives here;
// the reconcile worker reads the unreconciled rows and folds them into AttendanceRecord.
const PunchLogSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    personType: { type: String, enum: ['staff', 'student'], required: true },
    personId: { type: String, required: true, trim: true },
    // School wall clock expressed as UTC (helpers/attendance-time.js).
    punchTime: { type: Date, required: true },
    dateKey: { type: String, required: true },
    terminalSn: { type: String, default: null },
    punchHash: { type: String, required: true },
    reconciled: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

// Write-dedup only.
PunchLogSchema.index({ punchHash: 1 }, { unique: true });
// Tenant-scoped reads (errors.md data-modeling note): one person's day, and a day's backlog.
PunchLogSchema.index({ adminId: 1, personId: 1, dateKey: 1 });
PunchLogSchema.index({ adminId: 1, dateKey: 1, reconciled: 1 });

const PunchLogV2Model = mongoose.model('v2-punch-log', PunchLogSchema);

module.exports = PunchLogV2Model;
