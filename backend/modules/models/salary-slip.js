'use strict';
const mongoose = require('mongoose');

// THE AUDIT RECORD BEHIND A PRINTED SALARY SLIP.
//
// The PDF itself is not stored — the frontend renders it from live data and hands it to the
// browser's print flow, exactly as the fee receipt does (see printStudentData() in
// pages/admin/admin-student-fees-statement). What is stored is the fact that a slip was
// issued: its number, when, by whom, and which payments it covered. That is what makes
// "which slip did we give them for August" answerable months later without keeping a file.
//
// ONE SLIP PER PAYROLL, not one per payment.
//
// The fee receipt goes the other way — one receiptNo per installment — but a fee receipt
// acknowledges a transaction whereas a salary slip is a MONTHLY STATEMENT of what somebody
// earned. Three instalments of one August salary are still one August payslip. So payrollId
// is unique here, and paying the remainder REGENERATES the same slip with more payments
// attached rather than issuing a second one.
//
// SLIPNUMBER NEVER CHANGES ONCE ISSUED. A regeneration updates salaryPaymentIds and
// generatedAt but keeps the original number — a payslip whose number moved every time it was
// reprinted would be useless as the audit trail this record exists to be.
//
// year/month are denormalised off the Payroll. They are not decoration: they key the
// per-school-month sequence in the slip number, and they make the history queryable by period
// without joining every slip back through payroll first.
const SalarySlipModel = mongoose.model('salary-slip', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    payrollId: {
        // plain String FK -> Payroll._id. Unique — see the header.
        type: String,
        required: true,
        trim: true,
    },
    personType: {
        type: String,
        required: true,
        enum: ['staff', 'teacher'],
        trim: true,
    },
    personId: {
        type: String,
        required: true,
        trim: true,
    },
    year: {
        type: Number,
        required: true,
    },
    month: {
        // 1-12 (August = 8), never JS's 0-11 — same frame as models/payroll.js.
        type: Number,
        required: true,
    },
    slipNumber: {
        // "SLIP-<school>-<YYYYMM>-<seq>". Unique GLOBALLY, not per school: the school segment
        // is already inside the string, and a globally unique index is what lets the generator
        // resolve a sequence collision by simply retrying.
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    salaryPaymentIds: {
        // Which SalaryPayment rows this slip accounted for. Rewritten on every regeneration,
        // so it always describes what the CURRENT printed slip shows.
        type: [String],
        default: [],
    },
    generatedAt: {
        type: Date,
        default: Date.now,
    },
    generatedBy: {
        // Printed on the slip itself as the digital footprint, and kept here so the same fact
        // is queryable rather than only legible on paper.
        type: String,
        required: true,
        trim: true,
    },

    // ---- Reserved for a future automated payout. Unused this phase. --------
    //
    // Nothing writes these beyond their defaults. There is no Razorpay integration here: no
    // package, no API call, no payout. See the same note on models/salary-payment.js.
    //
    // A future payout's reference number does NOT need a new slot on the printed slip — it
    // fits the same "Reference Number" line a cheque or UPI reference already occupies
    // (SalaryPayment.referenceNumber). payoutReferenceId is for internal reconciliation
    // against the gateway's dashboard only, and is deliberately not printed.
    payoutReferenceId: {
        type: String,
        default: null,
        trim: true,
    },
    payoutMode: {
        type: String,
        enum: ['manual', 'automated'],
        default: 'manual',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// One slip per payroll — the structural half of the "monthly statement, not a transaction
// receipt" decision in the header.
SalarySlipModel.schema.index({ adminId: 1, payrollId: 1 }, { unique: true });
// The per-school-month sequence counts against this, and it answers "every slip issued for
// August" without a join.
SalarySlipModel.schema.index({ adminId: 1, year: 1, month: 1 });

module.exports = SalarySlipModel;
