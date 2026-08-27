'use strict';
const mongoose = require('mongoose');
const SalaryPaymentModel = require('../models/salary-payment');
const PayrollModel = require('../models/payroll');
const { getModel, personCode } = require('../services/person-lookup');
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
            adminId, payrollId, amountPaid, paymentDate,
            paymentMode, referenceNumber, paidBy, remarks,
        } = req.body;

        const payroll = await PayrollModel.findOne({ _id: payrollId, adminId: adminId }).lean();
        if (!payroll) {
            return res.status(404).json('Payroll not found!');
        }
        if (payroll.status !== 'LOCKED') {
            return res.status(400).json('Payment can only be recorded against a locked payroll!');
        }
        // THE PAYROLL IS THE AUTHORITY ON WHOSE SALARY THIS IS. personType and personId are
        // copied off it rather than trusted from the body — a mismatched id in the request
        // would otherwise put the payment on the history of somebody who was never paid, and
        // there is no reason for the client to be the source of truth for it.
        const personType = payroll.personType;
        const personId = String(payroll.personId);

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
                personType: personType,
                personId: personId,
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
            adminId: adminId, payrollId: payrollId,
            personType: personType, personId: personId,
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
        if (filters.personType) payrollFilter.personType = filters.personType;
        if (filters.month) payrollFilter.month = parseInt(filters.month);
        if (filters.year) payrollFilter.year = parseInt(filters.year);
        if (filters.personId) payrollFilter.personId = filters.personId;

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

        // Names come from two different collections, so they are fetched per type — one query
        // each at most, never one per row. A page of pure staff costs exactly one.
        const idsByType = new Map();
        for (const row of payrollRows) {
            const key = row.personType;
            if (!idsByType.has(key)) idsByType.set(key, new Set());
            idsByType.get(key).add(String(row.personId));
        }

        const [payments, ...peopleByTypeResults] = await Promise.all([
            payrollIds.length > 0
                ? SalaryPaymentModel.find({ adminId: adminId, payrollId: { $in: payrollIds } })
                    .sort({ paymentDate: -1 }).lean()
                : [],
            ...[...idsByType.entries()].map(async ([type, ids]) => {
                const model = getModel(type);
                if (!model) return { type, people: [] };
                const people = await model.find({ _id: { $in: [...ids] } }).lean();
                return { type, people };
            }),
        ]);

        // Keyed by "personType|personId" so a staff id and a teacher id can never collide.
        const personByKey = new Map();
        for (const entry of peopleByTypeResults) {
            for (const person of entry.people) {
                personByKey.set(`${entry.type}|${person._id.toString()}`, person);
            }
        }
        const paymentsByPayrollId = new Map();
        for (const payment of payments) {
            const key = String(payment.payrollId);
            if (!paymentsByPayrollId.has(key)) paymentsByPayrollId.set(key, []);
            paymentsByPayrollId.get(key).push(payment);
        }

        let historyList = payrollRows.map((row) => {
            const person = personByKey.get(`${row.personType}|${row.personId}`);
            const rowPayments = paymentsByPayrollId.get(row._id.toString()) || [];
            const paid = rowPayments.reduce((total, payment) => total + (payment.amountPaid || 0), 0);
            // The most recent payment supplies the Mode / Date / Paid By columns; the rest are
            // still shipped so the row can expand into its instalments without a second call.
            const latest = rowPayments.length > 0 ? rowPayments[0] : null;
            return {
                payrollId: row._id,
                personType: row.personType,
                personId: row.personId,
                name: person ? person.name : '',
                code: person ? personCode(row.personType, person) : '',
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
