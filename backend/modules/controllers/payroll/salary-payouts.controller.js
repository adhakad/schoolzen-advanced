'use strict';
const PayrollRunV2Model = require('../../models/payroll/payroll-run');
const PayrollPaymentV2Model = require('../../models/payroll/payroll-payment');
const SalarySlipV2Model = require('../../models/payroll/salary-slip');
const { CONFIRM_WINDOW_MS } = require('../../models/payroll/payroll-payment');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/payroll.messages');
const {
    MODULE, PERMISSIONS, actorOf, actorNameOf, canEditOf, runNotFound, isObjectId, findStaff, describeStaff, keysetPage,
} = require('../../helpers/payroll/context');
const {
    paymentTotals, payoutStatus, remainingDue, effectiveConfirmation, money,
} = require('../../helpers/payroll/payroll-rules');
const { withTransaction } = require('../../helpers/with-transaction');
const { buildLetterheadDocument } = require('../../services/pdf/letterhead.service');
const { logActivity } = require('../../services/activity-log.service');

// Salary Payouts (salary-payouts.md). ONLY `locked` runs exist here — every query carries
// `status: 'locked'`, so a draft run can never appear, be paid, or be slipped. Paid / due /
// confirmation are derived live from PayrollPayment sums on every read and never cached
// (payroll/optimization.md). Record Payment and slips need the explicit 'payroll-payout'
// grant (routes); Confirm/Dispute belong to the employee alone.

const paymentNotFound = () => new NotFoundError(messages.paymentNotFound(), { module: MODULE, code: 'PAYMENT_NOT_FOUND' });

const toPaymentRow = (payment, now) => ({
    _id: String(payment._id),
    amountPaid: payment.amountPaid,
    mode: payment.mode,
    reference: payment.reference || null,
    date: payment.date,
    paidBy: payment.paidByName || payment.paidBy || null,
    confirmationStatus: effectiveConfirmation(payment, now),
    confirmationExpiresAt: payment.confirmationExpiresAt,
    confirmedAt: payment.confirmedAt,
    disputeReason: payment.disputeReason || null,
});

/** One locked run's payout row — every figure derived from its payments. */
const toPayoutRow = (run, person, payments, now) => {
    // A pending payment past its window counts for nothing, even before the hourly sweep.
    const effective = payments.map((p) => ({ ...p, confirmationStatus: effectiveConfirmation(p, now) }));
    const totals = paymentTotals(effective);
    const status = payoutStatus(run.net, totals.confirmed);
    const due = remainingDue(run.net, totals.confirmed, totals.pending);
    const latest = effective.length ? effective[effective.length - 1] : null;
    return {
        _id: String(run._id),
        staffId: run.staffId,
        name: person ? person.name : null,
        code: person ? person.code : null,
        designation: person ? person.designation : null,
        department: person ? person.department : null,
        year: run.year,
        month: run.month,
        net: run.net,
        paid: totals.confirmed,
        pending: totals.pending,
        due,
        stillDue: money(Math.max(0, run.net - totals.confirmed)),
        status,
        latestPayment: latest ? toPaymentRow(latest, now) : null,
        payments: effective.map((p) => toPaymentRow(p, now)),
        actions: [status === 'full' ? 'slip' : null, due > 0 ? 'record' : null].filter(Boolean),
    };
};

const paymentsByRun = async (adminId, runIds, dbSession) => {
    const rows = await PayrollPaymentV2Model.find({ adminId, payrollRunId: { $in: runIds }, deletedAt: null })
        .sort({ createdAt: 1 }).session(dbSession || null).lean();
    const map = new Map(runIds.map((id) => [id, []]));
    rows.forEach((row) => { if (map.has(row.payrollRunId)) map.get(row.payrollRunId).push(row); });
    return map;
};

let ListPayouts = async (req, res) => {
    const { adminId, year, month, mode, status, after, limit, departmentId, designationId, search } = req.query;
    const filtered = Boolean(departmentId || designationId || search);
    const [people, runs] = await Promise.all([
        filtered ? findStaff(adminId, req.query) : null,
        PayrollRunV2Model.find({ adminId, year, month, status: 'locked', deletedAt: null }).sort({ _id: 1 }).lean(),
    ]);
    const allowed = people ? new Set(people.rows.map((row) => row._id)) : null;
    const visibleRuns = allowed ? runs.filter((run) => allowed.has(run.staffId)) : runs;

    const runIds = runs.map((run) => String(run._id));
    const [payments, staff] = await Promise.all([
        paymentsByRun(adminId, runIds),
        describeStaff(adminId, visibleRuns.map((run) => run.staffId)),
    ]);
    const now = new Date();
    const allRows = runs.map((run) => toPayoutRow(run, staff.get(run.staffId), payments.get(String(run._id)) || [], now));
    const visibleIds = new Set(visibleRuns.map((run) => String(run._id)));

    const rows = allRows.filter((row) => visibleIds.has(row._id)
        && (!status || row.status === status)
        && (!mode || row.payments.some((p) => p.mode === mode)));
    const page = keysetPage(rows, after, limit);

    return res.status(200).json({
        rows: page.rows,
        nextCursor: page.nextCursor,
        total: rows.length,
        // The side card is the whole school's month.
        summary: {
            disbursed: money(allRows.reduce((sum, row) => sum + row.paid, 0)),
            full: allRows.filter((row) => row.status === 'full').length,
            partial: allRows.filter((row) => row.status === 'partial').length,
            unpaid: allRows.filter((row) => row.status === 'unpaid').length,
        },
        canEdit: canEditOf(req, PERMISSIONS.PAYOUT),
    });
};

/**
 * Record Payment — ONE transaction that re-reads the run as `locked` INSIDE it (never the
 * pre-transaction read), then sums reserved = confirmed + pending, then inserts. A concurrent
 * Unlock (which checks payments inside its own transaction) and a second Record Payment
 * both serialize against this (errors.md shape 9, the module's highest-severity finding).
 */
let RecordPayment = async (req, res) => {
    const { adminId, amountPaid, mode, reference, date } = req.body;
    const { runId } = req.params;
    if (!isObjectId(runId)) throw runNotFound(runId);
    const actor = actorOf(req);
    const now = new Date();

    const { run, payment } = await withTransaction(async (dbSession) => {
        const current = await PayrollRunV2Model.findOne({ _id: runId, adminId, deletedAt: null }).session(dbSession).lean();
        if (!current) throw runNotFound(runId);
        if (current.status !== 'locked') {
            throw new ConflictError(messages.paymentRunNotLocked(), { module: MODULE, code: 'PAYROLL_RUN_NOT_LOCKED' });
        }
        const existing = (await paymentsByRun(adminId, [String(current._id)], dbSession)).get(String(current._id));
        const totals = paymentTotals(existing.map((p) => ({ ...p, confirmationStatus: effectiveConfirmation(p, now) })));
        const remaining = remainingDue(current.net, totals.confirmed, totals.pending);
        if (remaining <= 0) throw new ConflictError(messages.alreadyPaid(), { module: MODULE, code: 'PAYROLL_ALREADY_PAID' });
        if (money(amountPaid) > remaining) {
            throw new ValidationError(messages.paymentExceedsDue(remaining), {
                module: MODULE, code: 'PAYMENT_EXCEEDS_DUE',
                fields: [{ field: 'amountPaid', message: messages.paymentExceedsDue(remaining), code: 'PAYMENT_EXCEEDS_DUE' }],
            });
        }
        const [created] = await PayrollPaymentV2Model.create([{
            adminId,
            payrollRunId: String(current._id),
            staffId: current.staffId,
            year: current.year,
            month: current.month,
            amountPaid: money(amountPaid),
            mode,
            reference: reference || null,
            date,
            paidBy: actor,
            paidByName: actorNameOf(req),
            confirmationStatus: 'pending',
            confirmationRequestedAt: now,
            confirmationExpiresAt: new Date(now.getTime() + CONFIRM_WINDOW_MS),
        }], { session: dbSession });
        return { run: current, payment: created.toObject() };
    });

    await logActivity(req, {
        module: MODULE, action: 'payroll.payment.record', targetId: String(payment._id),
        meta: { payrollRunId: String(run._id), staffId: run.staffId, amountPaid: payment.amountPaid, mode, year: run.year, month: run.month },
    });
    const [payments, staff] = await Promise.all([paymentsByRun(adminId, [String(run._id)]), describeStaff(adminId, [run.staffId])]);
    return res.status(200).json({
        message: messages.paymentRecorded(),
        row: toPayoutRow(run, staff.get(run.staffId), payments.get(String(run._id)), new Date()),
    });
};

// ---- the employee's own Confirm / Dispute -------------------------------------------------

/**
 * The caller's own payment — identity from the verified JWT ONLY (`staffId` claim of the
 * unified Staff login), never the body or URL. Someone else's payment reads exactly like a
 * missing one (PAYMENT_NOT_FOUND, never 403).
 */
const loadOwnPayment = async (req) => {
    const user = req.user || {};
    const staffId = user.staffId ? String(user.staffId) : null;
    const adminId = String(user.adminId || '');
    if (!staffId || !adminId || !isObjectId(req.params.id)) throw paymentNotFound();
    const payment = await PayrollPaymentV2Model.findOne({ _id: req.params.id, adminId, staffId, deletedAt: null }).lean();
    if (!payment) throw paymentNotFound();
    // Stored status AND the raw expiry — never only the hourly sweep (errors.md shape 5).
    const status = effectiveConfirmation(payment);
    if (status !== 'pending') {
        throw new ConflictError(messages.paymentAlreadyActioned(status), { module: MODULE, code: 'PAYMENT_ALREADY_ACTIONED' });
    }
    req.adminId = adminId;
    return payment;
};

/** Conditional on still-pending AND unexpired, so a racing confirm/dispute/sweep loses cleanly. */
const actionPayment = async (payment, set) => {
    const now = new Date();
    const updated = await PayrollPaymentV2Model.findOneAndUpdate(
        { _id: payment._id, adminId: payment.adminId, confirmationStatus: 'pending', confirmationExpiresAt: { $gt: now } },
        { $set: { ...set, updatedAt: now } },
        { new: true }
    ).lean();
    if (!updated) throw new ConflictError(messages.paymentAlreadyActioned('actioned'), { module: MODULE, code: 'PAYMENT_ALREADY_ACTIONED' });
    return updated;
};

let ConfirmPayment = async (req, res) => {
    const payment = await loadOwnPayment(req);
    const updated = await actionPayment(payment, {
        confirmationStatus: 'confirmed',
        confirmedAt: new Date(),
        confirmedByDeviceInfo: { ...(req.body.deviceInfo || {}), ip: req.ip || null, userAgent: (req.get && req.get('user-agent')) || null },
    });
    await logActivity(req, { module: MODULE, action: 'payroll.payment.confirm', targetId: String(updated._id), meta: { payrollRunId: updated.payrollRunId } });
    return res.status(200).json({ message: messages.paymentConfirmed(), payment: toPaymentRow(updated, new Date()) });
};

let DisputePayment = async (req, res) => {
    const payment = await loadOwnPayment(req);
    const updated = await actionPayment(payment, { confirmationStatus: 'disputed', disputeReason: req.body.disputeReason });
    await logActivity(req, { module: MODULE, action: 'payroll.payment.dispute', targetId: String(updated._id), meta: { payrollRunId: updated.payrollRunId } });
    return res.status(200).json({ message: messages.paymentDisputed(), payment: toPaymentRow(updated, new Date()) });
};

// ---- Salary Slip --------------------------------------------------------------------------

const slipNumberFor = async (adminId, year, month, attempt) => {
    // Last six characters of the school id — enough to tell schools apart on a printed line.
    const school = String(adminId).slice(-6).toUpperCase();
    const period = `${year}${String(month).padStart(2, '0')}`;
    const issued = await SalarySlipV2Model.countDocuments({ adminId, year, month });
    return `SLP-${school}-${period}-${String(issued + 1 + attempt).padStart(4, '0')}`;
};

/** The structured slip; the frontend renders and prints it (same split as every print flow). */
const buildSlip = async (adminId, run, slip, payments) => {
    const [person, letterhead] = await Promise.all([
        describeStaff(adminId, [run.staffId]).then((map) => map.get(run.staffId) || null),
        buildLetterheadDocument({ adminId, title: 'PAYSLIP', fields: [] }),
    ]);
    const confirmed = payments.filter((p) => p.confirmationStatus === 'confirmed');
    const last = confirmed[confirmed.length - 1] || null;
    const s = run.attendanceSummary || {};
    return {
        school: letterhead.header,
        slipNumber: slip.slipNumber,
        generatedAt: slip.generatedAt,
        period: { year: run.year, month: run.month },
        employee: {
            name: person ? person.name : null,
            code: person ? person.code : null,
            designation: person ? person.designation : null,
            department: person ? person.department : null,
            mode: run.mode,
        },
        attendance: {
            present: s.present || 0, leave: (s.paidLeave || 0) + (s.unpaidLeave || 0), absent: s.absent || 0,
            holiday: s.holiday || 0, workingDays: s.workingDays || 0,
        },
        earnings: [
            { name: 'Basic', amount: run.basic },
            { name: 'HRA', amount: run.hra },
            ...(run.allowances || []),
        ],
        deductions: [
            ...(run.deductions || []),
            ...(run.attendanceDeduction ? [{ name: 'Attendance (unpaid days)', amount: run.attendanceDeduction }] : []),
        ],
        gross: run.gross,
        deductionTotal: run.deductionTotal,
        net: run.net,
        payment: last ? { date: last.date, mode: last.mode, reference: last.reference || null } : null,
    };
};

/** Issue (or return the already-issued) slip — only once a payment is CONFIRMED. */
let GenerateSlip = async (req, res) => {
    const { adminId } = req.body;
    const { runId } = req.params;
    if (!isObjectId(runId)) throw runNotFound(runId);
    const run = await PayrollRunV2Model.findOne({ _id: runId, adminId, status: 'locked', deletedAt: null }).lean();
    if (!run) throw runNotFound(runId);
    const payments = (await paymentsByRun(adminId, [String(run._id)])).get(String(run._id));
    if (!payments.some((p) => p.confirmationStatus === 'confirmed')) {
        throw new ValidationError(messages.slipNoConfirmedPayment(), { module: MODULE, code: 'SLIP_NO_CONFIRMED_PAYMENT' });
    }

    let slip = await SalarySlipV2Model.findOne({ adminId, payrollRunId: String(run._id) }).lean();
    if (!slip) {
        // Sequence collision under concurrency → retry with a recomputed number; a second
        // slip for the same run collides on {adminId, payrollRunId} and returns the first.
        for (let attempt = 0; attempt < 10 && !slip; attempt += 1) {
            try {
                const created = await SalarySlipV2Model.create({
                    adminId, payrollRunId: String(run._id), staffId: run.staffId, year: run.year, month: run.month,
                    slipNumber: await slipNumberFor(adminId, run.year, run.month, attempt), generatedBy: actorOf(req),
                });
                slip = created.toObject();
                await logActivity(req, { module: MODULE, action: 'payroll.slip.generate', targetId: String(slip._id), meta: { payrollRunId: String(run._id), slipNumber: slip.slipNumber } });
            } catch (error) {
                if (!(error && error.code === 11000)) throw error;
                slip = await SalarySlipV2Model.findOne({ adminId, payrollRunId: String(run._id) }).lean();
            }
        }
        if (!slip) throw new ConflictError('Could not allocate a slip number. Please try again.', { module: MODULE, code: 'SLIP_NUMBER_CONFLICT' });
    }
    return res.status(200).json({ slip: await buildSlip(adminId, run, slip, payments) });
};

module.exports = {
    ListPayouts,
    RecordPayment,
    ConfirmPayment,
    DisputePayment,
    GenerateSlip,
};
