'use strict';
const mongoose = require('mongoose');

// One row per raw punch. This is the FAST path's only write — no computation, no status,
// no roster lookup. Everything derived lives in daily-attendance.js instead, so ingestion
// stays cheap during the 8-10am peak.
const PunchLogModel = mongoose.model('punch-log', {
    adminId: {
        // Tenant FK — resolved from device.assignedSchoolId via the punch's terminalSn.
        type: String,
        required: true,
        trim: true,
    },
    personType: {
        type: String,
        required: true,
        enum: ['student', 'teacher', 'staff'],
        trim: true,
    },
    personId: {
        // plain String FK -> student._id / teacher._id / staff._id. No Mongoose ref,
        // per repo convention.
        type: String,
        required: true,
        trim: true,
    },
    punchTime: {
        // School wall clock expressed as UTC (see helpers/attendance-time.js). Built by
        // parseWdmsPunchTime(), never by `new Date(string)`.
        type: Date,
        required: true,
    },
    punchTimeRaw: {
        // The untouched WDMS string. Kept so a misinterpreted timestamp can be repaired
        // from local data instead of re-pulling from WDMS, whose transaction window may
        // have rolled off by the time anyone notices.
        type: String,
        trim: true,
    },
    date: {
        // UTC-midnight calendar day derived from punchTime. Denormalised so reconcile can
        // query { adminId, date } as an equality match instead of a range scan.
        type: Date,
        required: true,
    },
    punchState: {
        // Stored for audit but NEVER branched on: these terminals routinely ship with
        // IN/OUT unconfigured and send every punch as state '0'. First punch of the day is
        // the arrival and last is the departure regardless of what the device labelled it.
        type: String,
        trim: true,
    },
    source: {
        type: String,
        enum: ['WDMS', 'MANUAL'],
        default: 'WDMS',
        trim: true,
    },
    terminalSn: {
        type: String,
        trim: true,
    },
    wdmsEmpCode: {
        type: String,
        trim: true,
    },
    punchHash: {
        // sha1(adminId + personId + punchTime). Unique-indexed, which is what makes
        // insertMany({ ordered: false }) idempotent across re-syncs — duplicates are
        // rejected by the index rather than checked for in application code.
        type: String,
        required: true,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Index style follows models/roster.js — declared after mongoose.model() because this
// codebase passes an inline literal (there is no Schema object to call .index() on first).

// The dedupe guard. Re-syncing the same WDMS window is a no-op because of this.
PunchLogModel.schema.index({ punchHash: 1 }, { unique: true });
// Reconcile's only scan: a whole school-day, grouped per person. personType+personId trail
// so the grouping is index-ordered and a single-person day lookup is a direct seek.
PunchLogModel.schema.index({ adminId: 1, date: 1, personType: 1, personId: 1 });
// "Latest punch for this person" — the fast-path event payload and Phase 7's live board.
// Descending so .sort({ punchTime: -1 }) is an index walk, never an in-memory sort.
PunchLogModel.schema.index({ adminId: 1, personId: 1, punchTime: -1 });

module.exports = PunchLogModel;
