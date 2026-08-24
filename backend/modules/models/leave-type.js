'use strict';
const mongoose = require('mongoose');

// The leave CATEGORIES a school configures once — Sick Leave, Casual Leave, and so on.
// A LeaveRequest points at one of these; the balance shown on the request form is
// maxDaysPerYear minus the days already approved against this type that year.
const LeaveTypeModel = mongoose.model('leave-type', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    isPaid: {
        // Read by Phase 10's payroll, which deducts for an unpaid leave day and does not
        // for a paid one. Nothing in this phase branches on it — it is stored now so the
        // school does not have to revisit every type later.
        type: Boolean,
        default: false,
    },
    maxDaysPerYear: {
        // The annual cap. Enforced at APPROVAL, not at application: a person may ask for
        // more than they have left, and the admin sees the shortfall in the error rather
        // than the request silently vanishing.
        type: Number,
        required: true,
    },
    applicableTo: {
        // Who may take this type. 'all' means any of the three person types.
        type: String,
        enum: ['all', 'staff', 'teacher', 'student'],
        default: 'all',
        trim: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Two types called "Sick Leave" in one school would make the balance strip ambiguous and
// the picker unusable. Unique per school, not globally — every school names its own.
LeaveTypeModel.schema.index({ adminId: 1, name: 1 }, { unique: true });
// The request form's picker: active types applicable to one person type.
LeaveTypeModel.schema.index({ adminId: 1, status: 1, applicableTo: 1 });

module.exports = LeaveTypeModel;
