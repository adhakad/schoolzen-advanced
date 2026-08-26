'use strict';
const mongoose = require('mongoose');

// WHERE A STAFF MEMBER'S MONEY WOULD BE SENT — stored, and read by nothing yet.
//
// A SEPARATE COLLECTION RATHER THAN FIELDS ON models/staff.js, for the same reason
// models/biometric-mapping.js links to student/teacher instead of widening them: Staff is
// read by Department, Designation, Roster, attendance and now payroll, and account numbers
// have no business travelling with every one of those reads.
//
// PHASE 10 WRITES THIS AND STOPS. There is no payout integration, no razorpay package, no
// call to any bank or gateway, and no validation of an IFSC against anything live — plain
// fields an admin types. It exists now so the future "Automated Payout" phase (Razorpay
// Route linked accounts, one per staff member) is a code change rather than a schema
// migration on a live payroll table.
const StaffBankDetailsModel = mongoose.model('staff-bank-details', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    staffId: {
        // plain String FK -> Staff._id
        type: String,
        required: true,
        trim: true,
    },
    accountHolderName: {
        // Not assumed to equal Staff.name: bank records carry initials and expansions a
        // school register does not, and a transfer fails on the mismatch.
        type: String,
        trim: true,
        default: '',
    },
    accountNumber: {
        type: String,
        trim: true,
        default: '',
    },
    ifscCode: {
        type: String,
        trim: true,
        default: '',
    },
    bankName: {
        type: String,
        trim: true,
        default: '',
    },
    upiId: {
        type: String,
        trim: true,
        default: '',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// One set of bank details per staff member. unique so a re-save can only ever be an upsert.
StaffBankDetailsModel.schema.index({ adminId: 1, staffId: 1 }, { unique: true });

module.exports = StaffBankDetailsModel;
