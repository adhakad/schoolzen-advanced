'use strict';
const mongoose = require('mongoose');

// Today's precomputed Live Status counts (attendance/optimization.md, "Real-time /
// precomputed aggregates"): recomputed by the events that change them — a punch batch, a
// reconcile batch, a manual correction — and read by GET /live-status, so a page load never
// scans AttendanceRecord.
const LiveStatsSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    dateKey: { type: String, required: true },
    staff: { type: mongoose.Schema.Types.Mixed, default: {} },
    student: { type: mongoose.Schema.Types.Mixed, default: {} },
    computedAt: { type: Date, default: Date.now },
});

LiveStatsSchema.index({ adminId: 1, dateKey: 1 }, { unique: true });

const AttendanceLiveStatsModel = mongoose.model('v2-attendance-live-stats', LiveStatsSchema);

module.exports = AttendanceLiveStatsModel;
