'use strict';
const mongoose = require('mongoose');
const SalaryPaymentModel = require('../models/salary-payment');
const PayrollModel = require('../models/payroll');
const TeacherUserModel = require('../models/users/teacher-user');
const { getModel, personCode } = require('../services/person-lookup');
const {
    SETTLED_MATCH,
    RESERVED_MATCH,
    isSettled,
    isAwaitingConfirmation,
    paymentStatusOf,
    confirmationDeadlineFrom,
} = require('../services/salary-payment-status');
const logger = require('../helpers/logger');

// RECORDING THAT MONEY MOVED — separate from working out what was owed.
//
// Only against a LOCKED payroll: the amount can still change on a DRAFT, and a payment
// recorded against a number that later moves reconciles against nothing.
//
// Many rows per payroll (advance, then remainder). The SUM across rows is what settles it,
// and that same sum derives paymentStatus — nothing stores it. See models/salary-payment.js.

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Trimmed hard. This is provenance, not analytics, and a 900-character Chrome UA string on
// every payment row is storage nobody will ever read to the end of.
const MAX_DEVICE_INFO = 200;
const deviceInfoOf = (req) => String(req.headers['user-agent'] || 'unknown').slice(0, MAX_DEVICE_INFO);

/**
 * The Teacher record id behind a verified teacher token.
 *
 * The JWT's `id` is the teacher-USER (the login account), NOT the teacher record that
 * SalaryPayment.personId stores — controllers/users/teacher-user.js signs
 * { id: teacherUser._id, adminId, email, name }. Same two-hop resolution
 * CreateTeacherLeaveRequest does; see controllers/leave-request.js.
 *
 * @returns {Promise<{adminId: String, personId: String}|null>} null when the session cannot
 *   be resolved, which the caller reports as 403 rather than guessing an identity.
 */
const resolveTeacherIdentity = async (req) => {
    const adminId = req.user && req.user.adminId;
    const teacherUserId = req.user && req.user.id;
    if (!adminId || !teacherUserId) return null;
    const teacherUser = await TeacherUserModel.findOne({ _id: teacherUserId }, { teacherId: 1 }).lean();
    if (!teacherUser || !teacherUser.teacherId) return null;
    return { adminId: String(adminId), personId: String(teacherUser.teacherId) };
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

            // RESERVED, not settled: a payment still awaiting the employee's confirmation is
            // money the school has already committed. Counting only confirmed rows here would
            // let an admin record the same salary a second time while the first request is
            // open, and both would be legitimately confirmable.
            const grouped = await SalaryPaymentModel.aggregate([
                { $match: { adminId: adminId, payrollId: String(payrollId), ...RESERVED_MATCH } },
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

            // A TEACHER IS ASKED; A STAFF MEMBER CANNOT BE.
            //
            // Teachers have a login and confirm for themselves within 24 hours. There is no
            // staff login anywhere in this system, so a staff payment left pending would
            // expire with nobody able to act on it and the payroll would read Unpaid forever.
            // It is therefore confirmed on creation, with the reason recorded on the row so
            // the distinction is visible rather than inferred.
            const requestedAt = new Date();
            const awaitsEmployee = personType === 'teacher';
            const confirmationFields = awaitsEmployee
                ? {
                    confirmationStatus: 'PendingConfirmation',
                    confirmationRequestedAt: requestedAt,
                    confirmationExpiresAt: confirmationDeadlineFrom(requestedAt),
                    confirmedAt: null,
                    confirmedByDeviceInfo: null,
                }
                : {
                    confirmationStatus: 'Confirmed',
                    confirmationRequestedAt: requestedAt,
                    confirmationExpiresAt: confirmationDeadlineFrom(requestedAt),
                    confirmedAt: requestedAt,
                    confirmedByDeviceInfo: 'auto-confirmed: no staff login exists in this system',
                };

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
                ...confirmationFields,
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
            awaitsConfirmation: personType === 'teacher',
        });
        return res.status(200).json(personType === 'teacher'
            ? 'Payment recorded. It counts as paid once the teacher confirms receipt, within 24 hours.'
            : 'Payment recorded successfully.');
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
            // SETTLED only — an unconfirmed payment is not a paid one. pendingAmount rides
            // alongside so a row that reads Unpaid with money against it explains itself
            // instead of looking like the recording failed.
            const paid = rowPayments
                .filter(isSettled)
                .reduce((total, payment) => total + (payment.amountPaid || 0), 0);
            const pendingAmount = rowPayments
                .filter(isAwaitingConfirmation)
                .reduce((total, payment) => total + (payment.amountPaid || 0), 0);
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
                pendingAmount: money(pendingAmount),
                // Reduced by what is merely awaiting confirmation as well as by what is
                // settled, so the pre-filled amount on the Record Payment form cannot offer to
                // pay again what has already been handed over once.
                remainingAmount: money(row.netSalary - paid - pendingAmount),
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

// ---------------------------------------------------------------------------
// THE EMPLOYEE'S SIDE — all three behind isTeacherAuth.
//
// IDENTITY NEVER COMES FROM THE REQUEST. The payment id is in the URL, but whose payment it
// is comes from the verified token via resolveTeacherIdentity(). A teacher cannot confirm,
// dispute or even see somebody else's salary by guessing an id, and there is nothing in the
// body worth trusting. Same rule, same shape, as CreateTeacherLeaveRequest.
// ---------------------------------------------------------------------------

/**
 * The payment this teacher is allowed to act on, or a specific refusal.
 * @returns {Promise<{payment: Object}|{status: Number, error: String}>}
 */
const loadOwnPayment = async (req) => {
    const identity = await resolveTeacherIdentity(req);
    if (!identity) return { status: 403, error: 'Invalid session!' };

    const payment = await SalaryPaymentModel.findOne({ _id: req.params.id });
    // A payment belonging to somebody else is reported as NOT FOUND, never as forbidden —
    // "this exists but is not yours" would confirm the existence of another person's payment
    // to anyone willing to iterate ids.
    if (!payment
        || String(payment.adminId) !== identity.adminId
        || payment.personType !== 'teacher'
        || String(payment.personId) !== identity.personId) {
        return { status: 404, error: 'Payment not found!' };
    }
    return { payment: payment };
};

/**
 * Both actions are one-way and neither may run twice. Expiry is checked against the CLOCK as
 * well as the stored status, because the hourly sweep may not have run yet — a request that
 * lapsed forty minutes ago must be refused now, not at the top of the hour.
 */
const guardActionable = (payment) => {
    if (payment.confirmationStatus === 'Confirmed') {
        return 'This payment has already been confirmed!';
    }
    if (payment.confirmationStatus === 'Disputed') {
        return 'This payment has already been disputed!';
    }
    if (payment.confirmationStatus === 'Expired') {
        return 'This payment confirmation request has expired.';
    }
    if (payment.confirmationExpiresAt && payment.confirmationExpiresAt.getTime() < Date.now()) {
        return 'This payment confirmation request has expired.';
    }
    return '';
};

// ---------------------------------------------------------------------------
// PUT /:id/confirm  — isTeacherAuth
// ---------------------------------------------------------------------------
let ConfirmPayment = async (req, res, next) => {
    try {
        const loaded = await loadOwnPayment(req);
        if (loaded.error) return res.status(loaded.status).json(loaded.error);
        const payment = loaded.payment;

        const refusal = guardActionable(payment);
        if (refusal) return res.status(400).json(refusal);

        payment.confirmationStatus = 'Confirmed';
        payment.confirmedAt = new Date();
        payment.confirmedByDeviceInfo = deviceInfoOf(req);
        payment.disputeReason = null;
        await payment.save();

        // The moment a payroll actually becomes settled, and the only record of who agreed.
        logger.info('salary-payment.confirmed', {
            adminId: payment.adminId, paymentId: String(payment._id),
            payrollId: payment.payrollId, personId: payment.personId,
            amountPaid: payment.amountPaid,
        });
        return res.status(200).json('Payment receipt confirmed.');
    } catch (error) {
        logger.error('salary-payment.ConfirmPayment', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// PUT /:id/dispute  { disputeReason }  — isTeacherAuth
//
// Flags and records. It does not delete the payment, reverse it, or notify anybody: resolving
// a dispute is a manual admin follow-up, and inventing a workflow here would be a second,
// unsupervised way for salary records to change.
// ---------------------------------------------------------------------------
let DisputePayment = async (req, res, next) => {
    try {
        const loaded = await loadOwnPayment(req);
        if (loaded.error) return res.status(loaded.status).json(loaded.error);
        const payment = loaded.payment;

        const refusal = guardActionable(payment);
        if (refusal) return res.status(400).json(refusal);

        payment.confirmationStatus = 'Disputed';
        payment.disputeReason = String(req.body.disputeReason).trim();
        payment.confirmedAt = null;
        payment.confirmedByDeviceInfo = deviceInfoOf(req);
        await payment.save();

        logger.info('salary-payment.disputed', {
            adminId: payment.adminId, paymentId: String(payment._id),
            payrollId: payment.payrollId, personId: payment.personId,
            amountPaid: payment.amountPaid,
        });
        return res.status(200).json('Dispute raised. The school has been asked to review it.');
    } catch (error) {
        logger.error('salary-payment.DisputePayment', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// GET /my-payments  — isTeacherAuth
//
// Split rather than one list with a status column: the pending ones are a TO-DO with a
// deadline on it, and the rest are a receipt book. Nothing about them reads the same way.
//
// No notification is pushed for these. This system has no in-app notification mechanism, and
// the Socket.io rooms it does have are school-wide and class-wide — emitting a salary event
// into either would show one teacher's pay to every colleague in the building. So the page
// asks when it opens, which is the only place the answer is wanted.
// ---------------------------------------------------------------------------
let GetMyPayments = async (req, res, next) => {
    try {
        const identity = await resolveTeacherIdentity(req);
        if (!identity) return res.status(403).json('Invalid session!');

        const payments = await SalaryPaymentModel.find({
            adminId: identity.adminId, personType: 'teacher', personId: identity.personId,
        }).sort({ paymentDate: -1 }).lean();

        // One query for the months behind them, never one per row.
        const payrollIds = [...new Set(payments.map((payment) => String(payment.payrollId)))];
        const payrolls = payrollIds.length > 0
            ? await PayrollModel.find(
                { _id: { $in: payrollIds } },
                { month: 1, year: 1, netSalary: 1, status: 1 },
            ).lean()
            : [];
        const payrollById = new Map(payrolls.map((row) => [row._id.toString(), row]));

        const now = Date.now();
        const pending = [];
        const history = [];
        for (const payment of payments) {
            const payroll = payrollById.get(String(payment.payrollId)) || null;
            const expiresAt = payment.confirmationExpiresAt || null;
            const row = {
                _id: payment._id,
                payrollId: payment.payrollId,
                amountPaid: money(payment.amountPaid),
                paymentDate: payment.paymentDate,
                paymentMode: payment.paymentMode,
                referenceNumber: payment.referenceNumber || '',
                paidBy: payment.paidBy || '',
                remarks: payment.remarks || '',
                // A row written before confirmation existed has no status at all, and it was
                // settled money at the time — it reads as Confirmed rather than as a request
                // this teacher has somehow failed to answer.
                confirmationStatus: payment.confirmationStatus || 'Confirmed',
                confirmationExpiresAt: expiresAt,
                confirmedAt: payment.confirmedAt || null,
                disputeReason: payment.disputeReason || '',
                month: payroll ? payroll.month : null,
                year: payroll ? payroll.year : null,
                netSalary: payroll ? payroll.netSalary : 0,
            };
            // Lapsed-but-not-yet-swept rows are shown as history, not as something still
            // actionable — the sweep will catch up, and offering a button the server would
            // refuse is worse than showing none.
            const stillOpen = payment.confirmationStatus === 'PendingConfirmation'
                && (!expiresAt || expiresAt.getTime() > now);
            if (stillOpen) pending.push(row);
            else history.push(row);
        }

        return res.status(200).json({ pending: pending, history: history });
    } catch (error) {
        logger.error('salary-payment.GetMyPayments', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    RecordPayment,
    GetPaymentsForPayroll,
    GetPaymentHistory,
    ConfirmPayment,
    DisputePayment,
    GetMyPayments,
}
