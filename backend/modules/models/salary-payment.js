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
// TWO PARTIES, ONE DOCUMENT.
//
// Recording a payment is the school's claim that money moved. Confirming it is the
// employee's agreement that it arrived. Both halves live on THIS ROW — paidBy/paymentDate
// for one side, confirmationStatus/confirmedAt/confirmedByDeviceInfo for the other — and
// there is deliberately no second PaymentConfirmation or TransactionLog collection. A
// payment and its acknowledgement are one fact about one disbursement; splitting them across
// two documents would create a pair that can disagree and an audit that needs a join.
//
// A payment counts toward the Payroll's paid total ONLY once confirmationStatus reads
// 'Confirmed'. PendingConfirmation, Expired and Disputed rows exist, are visible, and settle
// nothing — that is the whole point, and services/salary-payment-status.js is where the rule
// is written once for every reader of it.
//
// STAFF ARE CONFIRMED ON CREATION. There is no staff login in this system (admin, teacher and
// sales are the three), so a staff payment left pending would expire with nobody able to act
// on it — a confirmation nobody can give is not a safeguard, it is a permanent Unpaid. See
// controllers/salary-payment.js.
// ---------------------------------------------------------------------------
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
    personType: {
        // Denormalised from the Payroll alongside personId, for the same reason.
        type: String,
        required: true,
        enum: ['staff', 'teacher'],
        default: 'staff',
        trim: true,
    },
    personId: {
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

    // ---- The employee's half of the record --------------------------------
    confirmationStatus: {
        // PendingConfirmation -> Confirmed | Disputed, or -> Expired by the hourly sweep in
        // services/cron-salary-confirmation-service.js. Only 'Confirmed' settles money.
        type: String,
        enum: ['PendingConfirmation', 'Confirmed', 'Disputed', 'Expired'],
        default: 'PendingConfirmation',
        trim: true,
    },
    confirmationRequestedAt: {
        type: Date,
        default: Date.now,
    },
    confirmationExpiresAt: {
        // requestedAt + 24h, stamped at creation rather than computed at read time so the
        // sweep can find lapsed rows with an indexed range query instead of scanning.
        type: Date,
        default: null,
    },
    confirmedAt: {
        type: Date,
        default: null,
    },
    confirmedByDeviceInfo: {
        // The user agent of whoever confirmed. A light footprint, matching what this codebase
        // already records for an attributable action (DailyAttendance.overriddenBy,
        // Payroll.lockedBy) rather than a new request-logging layer.
        type: String,
        default: null,
        trim: true,
    },
    disputeReason: {
        // Captured, not acted on. Resolving a dispute is a manual admin follow-up — this
        // module records that one was raised and why, and nothing more.
        type: String,
        default: null,
        trim: true,
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
// Filtering the history by person — and, with confirmationStatus read off the row, the
// teacher's own "what am I being asked to confirm" list.
SalaryPaymentModel.schema.index({ adminId: 1, personType: 1, personId: 1, paymentDate: -1 });
// The hourly expiry sweep: every still-pending row whose deadline has passed, across all
// schools. Equality on status, range on the deadline — one index walk, never a collection
// scan, however much payment history accumulates.
SalaryPaymentModel.schema.index({ confirmationStatus: 1, confirmationExpiresAt: 1 });

module.exports = SalaryPaymentModel;
