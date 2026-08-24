'use strict';
const mongoose = require('mongoose');

// One leave application. Pending until an admin approves or rejects it.
//
// TWO DATE REPRESENTATIONS, both load-bearing:
//   fromDate / toDate  — what the applicant ASKED for. Display, and the overlap/month
//                        range queries.
//   leaveDates         — what was actually GRANTED, expanded at approval with Sundays and
//                        holidays already removed.
//
// They are not redundant. Approval skips non-working days, so a plain
// `fromDate <= d <= toDate` lookup would report a Sunday as Leave that no DailyAttendance
// row backs — the calendar and the reconciler would disagree with each other about the
// same day. Storing the granted days makes that disagreement structurally impossible, and
// turns services/leave-lookup.js's per-date lookup into one multikey equality seek instead
// of a two-sided range scan.
const LeaveRequestModel = mongoose.model('leave-request', {
    adminId: {
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
        // FK -> student._id / teacher._id / staff._id, kept as a plain String like every
        // other relation in this codebase.
        type: String,
        required: true,
        trim: true,
    },
    leaveTypeId: {
        type: String,
        required: true,
        trim: true,
    },
    fromDate: {
        // UTC midnight — the calendar day, never an instant. Same frame as
        // DailyAttendance.date, so the two are directly comparable.
        type: Date,
        required: true,
    },
    toDate: {
        type: Date,
        required: true,
    },
    leaveDates: {
        // "YYYY-MM-DD" keys, written at APPROVAL only. Empty while Pending: expanding at
        // application time would freeze today's holiday calendar into a request that might
        // not be approved for weeks.
        type: [String],
        default: [],
    },
    dayCount: {
        // leaveDates.length, denormalised so the balance is one $sum and never a
        // re-expansion of every range the person has ever taken.
        type: Number,
        default: 0,
    },
    year: {
        // The leave year this request is counted against, taken from fromDate.
        //
        // A range that straddles New Year (Dec 28 - Jan 3) counts WHOLLY against fromDate's
        // year. Splitting it across two years would mean one approval producing two
        // records, which would break the single leaveRequestId back-reference every written
        // DailyAttendance row carries. The skew is at most a few days once a year, and the
        // alternative costs an aggregation over leaveDates for every balance read.
        type: Number,
        required: true,
    },
    reason: {
        type: String,
        trim: true,
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending',
        trim: true,
    },
    appliedByRole: {
        type: String,
        enum: ['admin', 'teacher'],
        default: 'admin',
        trim: true,
    },
    appliedById: {
        type: String,
        trim: true,
        default: null,
    },
    actionBy: {
        // Who approved or rejected — surfaced on the row so an approval is attributable,
        // the same way DailyAttendance.overriddenBy is.
        type: String,
        trim: true,
        default: null,
    },
    actionAt: {
        type: Date,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Multikey. getApprovedLeavesForDate() is one equality seek on all three keys — the
// reconcile worker calls it once per school-day, so it must never be a scan.
LeaveRequestModel.schema.index({ adminId: 1, status: 1, leaveDates: 1 });
// The balance aggregation, and the per-person month read on the calendar page.
LeaveRequestModel.schema.index({ adminId: 1, personType: 1, personId: 1, year: 1, status: 1 });
// The admin list, newest first, filtered by status.
LeaveRequestModel.schema.index({ adminId: 1, status: 1, fromDate: -1 });

module.exports = LeaveRequestModel;
