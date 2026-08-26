'use strict';
const mongoose = require('mongoose');

// ONE ACTUAL DISBURSEMENT against a LOCKED payroll.
//
// Generating and locking a payroll works out what is OWED. This records that money MOVED —
// two different facts, and the school needs both. Recording against a DRAFT is refused in
// controllers/salary-payment.js: the amount can still change on a draft, and a payment
// against a number that later moves is unreconcilable.
//
// MANY ROWS PER PAYROLL. Schools pay advances and remainders, so amountPaid is not assumed
// to equal netSalary — the sum across every row for a payrollId is what settles it, and
// that sum is also what derives the Payroll's paymentStatus ('Unpaid' / 'Partially Paid' /
// 'Fully Paid'). Nothing stores that status; the sum is the truth.
//
// ---------------------------------------------------------------------------
// RESERVED FIELDS — payoutMode, payoutGatewayId, payoutStatus.
//
// NOTHING IN THIS PHASE WRITES OR READS THEM beyond their defaults. There is no payment
// gateway here: no razorpay package, no API call, no "Pay Now" button. paymentMode below is
// a manual record of how a human paid.
//
// They exist because a future "Automated Payout" phase (Razorpay Route: a linked account per
// staff member from models/staff-bank-details.js, a split transfer on lock, payoutStatus
// updated by webhook) would otherwise need a migration on a table already holding a year of
// live payment history. Adding three defaulted fields now costs nothing and removes that.
// ---------------------------------------------------------------------------
const SalaryPaymentModel = mongoose.model('salary-payment', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    payrollId: {
        // plain String FK -> Payroll._id. The payroll must be LOCKED — enforced in the
        // controller, not here, because this codebase reports business rules as specific
        // strings and a Mongoose validator cannot look at another collection.
        type: String,
        required: true,
        trim: true,
    },
    staffId: {
        // Denormalised from the Payroll so the history list can filter and label by person
        // without joining every row back through payroll first.
        type: String,
        required: true,
        trim: true,
    },
    amountPaid: {
        // Usually netSalary, but a partial payment is legitimate — see the file header.
        type: Number,
        required: true,
    },
    paymentDate: {
        type: Date,
        required: true,
    },
    paymentMode: {
        // How a human actually paid. NOT a gateway instruction — see the reserved-fields
        // note above.
        type: String,
        enum: ['cash', 'bankTransfer', 'upi', 'cheque'],
        required: true,
        trim: true,
    },
    referenceNumber: {
        // Transaction id, UTR or cheque number. Optional: cash has none.
        type: String,
        trim: true,
        default: '',
    },
    paidBy: {
        // Who recorded it — the admin's id or name. Surfaced on the row so a payment is
        // attributable, the same way Payroll.lockedBy is.
        type: String,
        required: true,
        trim: true,
    },
    remarks: {
        type: String,
        trim: true,
        default: '',
    },

    // ---- Reserved for a future automated payout. Unused this phase. --------
    payoutMode: {
        type: String,
        enum: ['manual', 'automated'],
        default: 'manual',
        trim: true,
    },
    payoutGatewayId: {
        // Future: the Razorpay payout/transfer id.
        type: String,
        default: null,
        trim: true,
    },
    payoutStatus: {
        // Future: driven by webhook. null for every manually recorded payment, which is
        // every payment this phase creates.
        type: String,
        enum: ['pending', 'processing', 'success', 'failed', null],
        default: null,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// The per-payroll sum, run once per page of BOTH the Generate and Payment History tables to
// derive paymentStatus. It must be answerable from the index alone.
SalaryPaymentModel.schema.index({ adminId: 1, payrollId: 1 });
// The history list, newest first.
SalaryPaymentModel.schema.index({ adminId: 1, paymentDate: -1 });
// Filtering the history by person.
SalaryPaymentModel.schema.index({ adminId: 1, staffId: 1, paymentDate: -1 });

module.exports = SalaryPaymentModel;
