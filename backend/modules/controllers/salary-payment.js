'use strict';
const mongoose = require('mongoose');
const SalaryPaymentModel = require('../models/salary-payment');
const PayrollModel = require('../models/payroll');
const StaffModel = require('../models/staff');
const logger = require('../helpers/logger');

// RECORDING THAT MONEY MOVED — separate from working out what was owed.
//
// Only against a LOCKED payroll: the amount can still change on a DRAFT, and a payment
// recorded against a number that later moves reconciles against nothing.
//
// Many rows per payroll (advance, then remainder). The SUM across rows is what settles it,
// and that same sum derives paymentStatus — nothing stores it. See models/salary-payment.js.

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const paymentStatusOf = (netSalary, paid) => {
    if (!paid || paid <= 0) return 'Unpaid';
    if (paid >= netSalary) return 'Fully Paid';
    return 'Partially Paid';
};

// ---------------------------------------------------------------------------
// POST /
//
// The balance re-read and the insert run inside a TRANSACTION, matching the pattern
// CreateBulkStudentRecord and controllers/leave-request.js already use.
//
// Without it, two admins recording the remaining half of a salary at the same moment would
// both read the same running total, both pass the balance check, and both insert — paying the
// person 150% and leaving a payroll that reads Fully Paid with no way to tell which row was
// the mistake.
// ---------------------------------------------------------------------------
let RecordPayment = async (req, res, next) => {
    try {
        const {
            adminId, payrollId, staffId, amountPaid, paymentDate,
            paymentMode, referenceNumber, paidBy, remarks,
        } = req.body;

        const payroll = await PayrollModel.findOne({ _id: payrollId, adminId: adminId }).lean();
        if (!payroll) {
            return res.status(404).json('Payroll not found!');
        }
        if (payroll.status !== 'LOCKED') {
            return res.status(400).json('Payment can only be recorded against a locked payroll!');
        }
        // The payroll is the authority on whose salary this is. A mismatched staffId in the
        // body is a client bug, and writing it would put the payment on the history of a
        // person who was never paid.
        if (String(payroll.staffId) !== String(staffId)) {
            return res.status(400).json('This payment does not belong to the selected staff member!');
        }

        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const grouped = await SalaryPaymentModel.aggregate([
                { $match: { adminId: adminId, payrollId: String(payrollId) } },
                { $group: { _id: '$payrollId', paid: { $sum: '$amountPaid' } } },
            ]).session(session);
            const alreadyPaid = grouped.length > 0 ? grouped[0].paid : 0;
            const remaining = money(payroll.netSalary - alreadyPaid);

            if (remaining <= 0) {
                await session.abortTransaction();
                return res.status(400).json('This payroll is already fully paid!');
            }
            if (money(amountPaid) > remaining) {
                await session.abortTransaction();
                return res.status(400).json(`This payment exceeds the remaining balance of ${remaining}!`);
            }

            await SalaryPaymentModel.create([{
                adminId: adminId,
                payrollId: String(payrollId),
                staffId: String(staffId),
                amountPaid: money(amountPaid),
                paymentDate: paymentDate,
                paymentMode: paymentMode,
                referenceNumber: referenceNumber || '',
                paidBy: paidBy,
                remarks: remarks || '',
                // The three reserved payout fields are left to their model defaults
                // ('manual' / null / null) — this phase records manual payments only. See
                // models/salary-payment.js.
            }], { session });

            await session.commitTransaction();
        } catch (transactionError) {
            await session.abortTransaction();
            throw transactionError;
        } finally {
            session.endSession();
        }

        logger.info('salary-payment.recorded', {
            adminId: adminId, payrollId: payrollId, staffId: staffId,
            amountPaid: money(amountPaid), paymentMode: paymentMode,
        });
        return res.status(200).json('Payment recorded successfully.');
    } catch (error) {
        logger.error('salary-payment.RecordPayment', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// Every payment against one payroll, for the breakdown modal.
let GetPaymentsForPayroll = async (req, res, next) => {
    try {
        const payrollId = req.params.payrollId;
        const payments = await SalaryPaymentModel
            .find({ payrollId: payrollId })
            .sort({ paymentDate: -1 })
            .lean();
        return res.status(200).json(payments);
    } catch (error) {
        logger.error('salary-payment.GetPaymentsForPayroll', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /payment-history
//
// THE PAYMENT HISTORY TAB IS A PAYROLL LIST, NOT A PAYMENT LIST.
//
// It has to show a locked payroll that has NOT been paid — that row is the whole reason the
// tab exists, and paging SalaryPayment rows would hide exactly the ones needing action. So
// this pages LOCKED payrolls and attaches their payments, rather than the other way round.
//
// paymentStatus is derived, so it cannot be filtered in the query. It is applied after the
// page is built, which means a status-filtered page can come back shorter than the limit;
// that is the honest tradeoff for not storing a field that two writes could disagree about.
// ---------------------------------------------------------------------------
let GetPaymentHistory = async (req, res, next) => {
    try {
        const adminId = req.body.adminId;
        const filters = req.body.filters || {};

        // Only LOCKED payrolls are payable, so a DRAFT has no place on this tab at all.
        const payrollFilter = { adminId: adminId, status: 'LOCKED' };
        if (filters.month) payrollFilter.month = parseInt(filters.month);
        if (filters.year) payrollFilter.year = parseInt(filters.year);
        if (filters.staffId) payrollFilter.staffId = filters.staffId;

        const limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        const page = req.body.page || 1;

        const [payrollRows, countPayroll] = await Promise.all([
            PayrollModel.find(payrollFilter).sort({ _id: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean(),
            PayrollModel.count(payrollFilter),
        ]);

        const payrollIds = payrollRows.map((row) => row._id.toString());
        const staffIds = [...new Set(payrollRows.map((row) => String(row.staffId)))];

        const [payments, staffList] = await Promise.all([
            payrollIds.length > 0
                ? SalaryPaymentModel.find({ adminId: adminId, payrollId: { $in: payrollIds } })
                    .sort({ paymentDate: -1 }).lean()
                : [],
            staffIds.length > 0
                ? StaffModel.find({ _id: { $in: staffIds } }, { name: 1, empCode: 1 }).lean()
                : [],
        ]);

        const staffById = new Map(staffList.map((staff) => [staff._id.toString(), staff]));
        const paymentsByPayrollId = new Map();
        for (const payment of payments) {
            const key = String(payment.payrollId);
            if (!paymentsByPayrollId.has(key)) paymentsByPayrollId.set(key, []);
            paymentsByPayrollId.get(key).push(payment);
        }

        let historyList = payrollRows.map((row) => {
            const staff = staffById.get(String(row.staffId));
            const rowPayments = paymentsByPayrollId.get(row._id.toString()) || [];
            const paid = rowPayments.reduce((total, payment) => total + (payment.amountPaid || 0), 0);
            // The most recent payment supplies the Mode / Date / Paid By columns; the rest are
            // still shipped so the row can expand into its instalments without a second call.
            const latest = rowPayments.length > 0 ? rowPayments[0] : null;
            return {
                payrollId: row._id,
                staffId: row.staffId,
                staffName: staff ? staff.name : '',
                empCode: staff ? (staff.empCode || '') : '',
                month: row.month,
                year: row.year,
                netSalary: row.netSalary,
                amountPaid: money(paid),
                remainingAmount: money(row.netSalary - paid),
                paymentStatus: paymentStatusOf(row.netSalary, paid),
                paymentMode: latest ? latest.paymentMode : '',
                paymentDate: latest ? latest.paymentDate : null,
                paidBy: latest ? latest.paidBy : '',
                referenceNumber: latest ? latest.referenceNumber : '',
                payments: rowPayments,
            };
        });

        // Derived filters, applied after the join — see the handler header.
        if (filters.paymentStatus) {
            historyList = historyList.filter((row) => row.paymentStatus === filters.paymentStatus);
        }
        if (filters.paymentMode) {
            historyList = historyList.filter((row) => (
                row.payments.some((payment) => payment.paymentMode === filters.paymentMode)
            ));
        }

        return res.json({ historyList: historyList, countPayroll: countPayroll });
    } catch (error) {
        logger.error('salary-payment.GetPaymentHistory', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    RecordPayment,
    GetPaymentsForPayroll,
    GetPaymentHistory,
}
