'use strict';
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const FeePaymentModel = require('../../models/fees/fee-payment');
const FeeStructureModel = require('../../models/fees/fee-structure');
const FeeReceiptCounterModel = require('../../models/fees/fee-receipt-counter');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/fees.messages');
const { withTransaction } = require('../../helpers/with-transaction');
const { buildEnrollmentMatch, resolveSearchStudentIds, loadSubjectGroups } = require('../../helpers/student/student.utils');
const {
    MODULE, PERMISSIONS, actorOf, actorNameOf, canEditOf, isObjectId, toObjectId, studentNotFound, requireSessionId,
    loadSessionLabels, shortSession, loadLedgerData, ledgerFor, loadProfiles, loadEnrollmentsBySession, placementLabels,
    loadClassIndex,
} = require('../../helpers/fees/fee-context');
const {
    STATUS, STATUS_LABELS, money, grossOf, buildLedger, allocateOldestFirst, rupeesInWords,
} = require('../../helpers/fees/fee-ledger');
const { ensureRecords } = require('../../helpers/fees/fee-record-sync');
const { buildLetterheadDocument } = require('../../services/pdf/letterhead.service');
const { feesConfirmationMessage } = require('../../services/send-whatsapp-message');
const { logActivity } = require('../../services/activity-log.service');
const { onDashboardChanged } = require('../../helpers/dashboard/cache-invalidation');
const logger = require('../../helpers/logger');

// Fees (fees/fees.md) — the day-to-day collection screen. Paid / Due / Status are read
// straight from the ledger on every request, never cached (fees/optimization.md: "fee/payment
// balances" are the never-cached tier). Collect needs the explicit 'fees-collect' grant and
// the concession (waiver) edit 'fees-waiver' (routes).

const MAX_REPORT_ROWS = 5000;
const OPENING_BALANCE = 'opening-balance';

const recordNotFound = () => new NotFoundError(messages.feeRecordNotFound(), { module: MODULE, code: 'FEE_RECORD_NOT_FOUND' });
const amountError = (code, message) => new ValidationError(message, {
    module: MODULE, code, fields: [{ field: 'amount', message, code }],
});

/** Labels the rows need, read once per request. */
const loadRowContext = async (adminId) => {
    const [classIndex, groups, sessionLabels] = await Promise.all([
        loadClassIndex(adminId), loadSubjectGroups(adminId), loadSessionLabels(adminId),
    ]);
    return { classIndex, groupNames: new Map(groups.map((group) => [String(group._id), group.name])), sessionLabels };
};

/** The payment's own session — Collected By shows who took this session's latest one. */
const paymentsForRecord = (payments, recordId) => payments.filter((payment) => String(payment.studentFeeRecordId) === String(recordId)
    || (payment.allocations || []).some((item) => String(item.recordId) === String(recordId)));

/**
 * Table rows for these enrollments (one session) — every figure from the shared ledger.
 * Two queries for the ledger plus one for profiles and one for past enrollments, whatever
 * the page size.
 */
const buildRows = async (adminId, sessionId, enrollments, context) => {
    const ctx = context || await loadRowContext(adminId);
    const studentIds = enrollments.map((item) => item.studentId);
    const [profiles, ledgers, history] = await Promise.all([
        loadProfiles(adminId, studentIds),
        loadLedgerData(adminId, studentIds, { sessionLabels: ctx.sessionLabels }),
        loadEnrollmentsBySession(adminId, studentIds),
    ]);
    return enrollments.map((enrollment) => {
        const studentId = String(enrollment.studentId);
        const profile = profiles.get(studentId) || {};
        const data = ledgers.get(studentId);
        const { record, ledger } = ledgerFor(data, sessionId);
        const labels = placementLabels(ctx.classIndex, ctx.groupNames, enrollment);
        const classOf = (sessionKey) => {
            const past = history.get(studentId) && history.get(studentId).get(String(sessionKey));
            return past ? placementLabels(ctx.classIndex, ctx.groupNames, past).className : null;
        };
        const base = {
            _id: String(enrollment._id),
            studentId,
            name: profile.name || '—',
            admissionNo: profile.admissionNo != null ? profile.admissionNo : null,
            fatherName: profile.fatherName || null,
            ...labels,
        };
        if (!record) return { ...base, hasRecord: false };
        const current = paymentsForRecord(data.payments, record._id);
        const last = current[current.length - 1] || null;
        return {
            ...base,
            hasRecord: true,
            recordId: String(record._id),
            concession: ledger.totals.concession,
            concessionReason: record.concessionReason || null,
            gross: ledger.totals.gross,
            admissionFee: record.admissionFee || 0,
            paid: ledger.totals.paid,
            currentDue: ledger.totals.currentDue,
            arrearsDue: ledger.totals.arrearsDue,
            due: ledger.totals.totalDue,
            total: ledger.totals.gross,
            status: ledger.totals.status,
            statusLabel: STATUS_LABELS[ledger.totals.status],
            arrears: ledger.arrears.map((session) => ({
                sessionLabel: session.sessionLabel,
                sessionShort: shortSession(session.sessionLabel),
                className: classOf(session.sessionId),
                due: session.due,
            })),
            collectedBy: last ? (last.collectedByName || (last.mode === OPENING_BALANCE ? 'Opening balance' : null)) : null,
        };
    });
};

/** The side card: this month's collections + the whole session's status counts. */
const summarize = async (adminId, sessionId, ctx) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [collected, enrollments] = await Promise.all([
        FeePaymentModel.aggregate([
            { $match: { adminId, date: { $gte: monthStart }, mode: { $ne: OPENING_BALANCE }, deletedAt: null } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        StudentEnrollmentModel.find({ adminId, sessionId }, 'studentId').lean(),
    ]);
    const ledgers = await loadLedgerData(adminId, enrollments.map((item) => item.studentId), { sessionLabels: ctx.sessionLabels });
    const counts = { [STATUS.PAID]: 0, [STATUS.HAS_ARREARS]: 0, [STATUS.PARTIAL]: 0, [STATUS.UNPAID]: 0 };
    enrollments.forEach((enrollment) => {
        const { ledger } = ledgerFor(ledgers.get(String(enrollment.studentId)), sessionId);
        if (ledger) counts[ledger.totals.status] += 1;
    });
    return {
        collectedThisMonth: money(collected.length ? collected[0].total : 0),
        fullyPaid: counts[STATUS.PAID],
        hasArrears: counts[STATUS.HAS_ARREARS],
        partial: counts[STATUS.PARTIAL],
        unpaid: counts[STATUS.UNPAID],
    };
};

/** Enrollments matching the toolbar's filters + search, `_id` ascending. */
const findEnrollments = async (adminId, sessionId, query, { after = null, limit = null, studentIds = null } = {}) => {
    const match = buildEnrollmentMatch(adminId, sessionId, query);
    const searchIds = await resolveSearchStudentIds(adminId, query.search);
    if (searchIds) match.studentId = { $in: searchIds };
    if (studentIds && studentIds.length) {
        const wanted = studentIds.map(toObjectId);
        match.studentId = searchIds
            ? { $in: wanted.filter((id) => searchIds.some((item) => String(item) === String(id))) }
            : { $in: wanted };
    }
    if (after) match._id = { $gt: toObjectId(after) };
    let cursor = StudentEnrollmentModel.find(match, 'studentId sessionId classId class streamId groupId sectionId rollNumber entryType')
        .sort({ _id: 1 });
    if (limit) cursor = cursor.limit(limit);
    return cursor.lean();
};

let ListFees = async (req, res) => {
    const { adminId, session, after, limit } = req.query;
    const sessionId = await requireSessionId(adminId, session);
    const found = await findEnrollments(adminId, sessionId, req.query, { after, limit: limit + 1 });
    const page = found.slice(0, limit);
    // Safety net: a structure created after these students were enrolled bills them here.
    await ensureRecords(adminId, sessionId, page, actorOf(req));

    const ctx = await loadRowContext(adminId);
    const [rows, summary] = await Promise.all([
        buildRows(adminId, sessionId, page, ctx),
        after ? null : summarize(adminId, sessionId, ctx),
    ]);
    return res.status(200).json({
        rows,
        nextCursor: found.length > limit && page.length ? String(page[page.length - 1]._id) : null,
        summary,
        canCollect: canEditOf(req, PERMISSIONS.COLLECT),
        canWaive: canEditOf(req, PERMISSIONS.WAIVER),
    });
};

/** One student's fresh row — every mutation returns it, so the page never re-GETs. */
const freshRow = async (adminId, sessionId, studentId) => {
    const enrollment = await StudentEnrollmentModel.findOne({ adminId, studentId, sessionId },
        'studentId sessionId classId class streamId groupId sectionId rollNumber entryType').lean();
    return enrollment ? (await buildRows(adminId, sessionId, [enrollment]))[0] : null;
};

/** Every write to a student's ledger first bumps all their records' lock inside the txn. */
const lockLedger = (adminId, studentId, dbSession) => StudentFeeRecordModel.updateMany(
    { adminId, studentId: toObjectId(studentId), deletedAt: null },
    { $inc: { ledgerVersion: 1 } },
    { session: dbSession }
);

const receiptNumberFor = (year, seq) => `RCPT-${year}-${String(seq).padStart(4, '0')}`;

/**
 * Collect Fee — ONE transaction (fees/errors.md shape 9, the module's top-priority fix):
 * lock the student's ledger, re-read it INSIDE the transaction, allocate oldest-due-first
 * (the shared allocateOldestFirst — PAYMENT_EXCEEDS_DUE is enforced right here, on the
 * re-read balance), take the next receipt number from the atomic counter, insert. A
 * concurrent collect for the same student write-conflicts on the lock and retries against
 * this one's committed ledger, so two payments can never both spend the same due.
 */
let CollectFee = async (req, res) => {
    const { adminId, session, amount, mode } = req.body;
    const { studentId } = req.params;
    if (!isObjectId(studentId)) throw studentNotFound(studentId);
    const sessionId = await requireSessionId(adminId, session);
    const enrollment = await StudentEnrollmentModel.findOne({ adminId, studentId, sessionId },
        'studentId sessionId classId streamId groupId entryType').lean();
    if (!enrollment) throw recordNotFound();
    await ensureRecords(adminId, sessionId, [enrollment], actorOf(req));

    const now = new Date();
    const year = now.getFullYear();
    // The counter row exists before the transaction, so its first-ever upsert can't race.
    await FeeReceiptCounterModel.updateOne({ adminId, year }, { $setOnInsert: { seq: 0 } }, { upsert: true })
        .catch((error) => { if (error.code !== 11000) throw error; });
    const idempotencyKey = (req.get && req.get('Idempotency-Key')) || null;

    const payment = await withTransaction(async (dbSession) => {
        await lockLedger(adminId, studentId, dbSession);
        const data = (await loadLedgerData(adminId, [studentId], { dbSession })).get(String(studentId));
        const { record, ledger } = ledgerFor(data, sessionId);
        if (!record) throw recordNotFound();
        const result = allocateOldestFirst(ledger, amount);
        if (result.error === 'PAYMENT_AMOUNT_INVALID') throw amountError('PAYMENT_AMOUNT_INVALID', messages.paymentAmountInvalid());
        if (result.error === 'PAYMENT_EXCEEDS_DUE') {
            throw amountError('PAYMENT_EXCEEDS_DUE', ledger.totals.totalDue > 0 ? messages.paymentExceedsDue(ledger.totals.totalDue) : messages.nothingDue());
        }
        const counter = await FeeReceiptCounterModel.findOneAndUpdate(
            { adminId, year }, { $inc: { seq: 1 } }, { new: true, session: dbSession }
        ).lean();
        const [created] = await FeePaymentModel.create([{
            adminId,
            studentFeeRecordId: record._id,
            studentId: toObjectId(studentId),
            sessionId,
            amount: money(amount),
            mode,
            date: now,
            collectedBy: actorOf(req),
            collectedByName: actorNameOf(req),
            receiptNo: receiptNumberFor(year, counter.seq),
            allocations: result.allocations.map((item) => ({
                recordId: toObjectId(item.recordId), sessionId: toObjectId(item.sessionId), amount: item.amount,
            })),
            idempotencyKey,
        }], { session: dbSession });
        return created.toObject();
    }).catch((error) => {
        if (error && error.code === 11000 && /idempotencyKey/.test(String(error.message || ''))) {
            throw new ConflictError(messages.paymentAlreadyRecorded(), { module: MODULE, code: 'PAYMENT_ALREADY_RECORDED' });
        }
        throw error;
    });

    await logActivity(req, {
        module: MODULE, action: 'fees.payment.collect', targetId: String(payment._id),
        meta: {
            studentId, session, amount: payment.amount, mode, receiptNo: payment.receiptNo,
            allocations: payment.allocations.map((item) => ({ sessionId: String(item.sessionId), amount: item.amount })),
        },
    });
    // A fee payment is one of the Dashboard's named invalidation triggers (optimization.md).
    await onDashboardChanged(adminId, ['fees']);
    const [row, receipt] = await Promise.all([freshRow(adminId, sessionId, studentId), buildReceipt(adminId, payment)]);
    // Fire-and-forget: a WhatsApp failure never turns a recorded payment into an error
    // (fees/errors.md shape 8).
    notifyReceipt(adminId, receipt).catch((error) => logger.warn('fees.receiptNotifyFailed', { adminId, reason: error.message }));
    return res.status(200).json({ message: messages.collected(payment.amount), row, receipt });
};

const notifyReceipt = async (adminId, receipt) => {
    if (!process.env.MSG91_FEE_CONFIRMATION) return;
    const phone = String(receipt.student.parentsContact || '').replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) return;
    await feesConfirmationMessage(phone, receipt.school.schoolName, receipt.session, receipt.student.name,
        String(receipt.amountReceived), receipt.dateText, receipt.receiptNo, receipt.student.className || '',
        String(receipt.student.admissionNo || ''), receipt.student.fatherName || '', receipt.student.motherName || '');
};

/**
 * Concession (waiver) — 'fees-waiver'. Bounded by the fee itself and by what was already
 * paid (the due can never go negative); a reason is required and the before/after is logged.
 * Same ledger lock as Collect, so a concurrent payment can't slip under it.
 */
let UpdateConcession = async (req, res) => {
    const { adminId, session, amount, reason } = req.body;
    const { studentId } = req.params;
    if (!isObjectId(studentId)) throw studentNotFound(studentId);
    const sessionId = await requireSessionId(adminId, session);

    const { before, after } = await withTransaction(async (dbSession) => {
        await lockLedger(adminId, studentId, dbSession);
        const data = (await loadLedgerData(adminId, [studentId], { dbSession })).get(String(studentId));
        const { record, ledger } = ledgerFor(data, sessionId);
        if (!record) throw recordNotFound();
        const gross = grossOf(record);
        const value = money(amount);
        if (value > gross) throw amountError('CONCESSION_EXCEEDS_FEE', messages.concessionExceedsFee(gross));
        if (gross - value < ledger.totals.paid) {
            throw amountError('CONCESSION_BELOW_PAID', messages.concessionBelowPaid(money(Math.max(0, gross - ledger.totals.paid))));
        }
        await StudentFeeRecordModel.updateOne({ _id: record._id, adminId },
            { $set: { concession: value, concessionReason: reason, updatedAt: new Date() } }, { session: dbSession });
        return {
            before: { concession: record.concession || 0, concessionReason: record.concessionReason || null },
            after: { concession: value, concessionReason: reason },
        };
    });

    await logActivity(req, {
        module: MODULE, action: 'fees.concession.update', targetId: String(studentId),
        meta: { session }, changes: { before, after },
    });
    await onDashboardChanged(adminId, ['fees']);
    return res.status(200).json({ message: messages.concessionUpdated(), row: await freshRow(adminId, sessionId, studentId) });
};

const DATE_FORMAT = { day: '2-digit', month: 'short', year: 'numeric' };
const dateText = (date) => new Date(date).toLocaleDateString('en-GB', DATE_FORMAT);

/**
 * The printable receipt — rebuilt from the stored payment every time (the serial number
 * never changes), with the school header from the ONE shared letterhead service. Balances
 * are as of this payment, so a reprint shows what the original showed.
 */
const buildReceipt = async (adminId, payment) => {
    const record = await StudentFeeRecordModel.findOne({ _id: payment.studentFeeRecordId, adminId }).lean();
    const studentId = String(record.studentId);
    const [data, profiles, history, letterhead, ctx, structure] = await Promise.all([
        loadLedgerData(adminId, [studentId]).then((map) => map.get(studentId)),
        loadProfiles(adminId, [studentId]),
        loadEnrollmentsBySession(adminId, [studentId]),
        buildLetterheadDocument({ adminId, title: 'FEE RECEIPT', fields: [] }),
        loadRowContext(adminId),
        record.feeStructureId ? FeeStructureModel.findOne({ _id: record.feeStructureId, adminId }).lean() : null,
    ]);
    const profile = profiles.get(studentId) || {};
    const classOf = (sessionKey) => {
        const enrollment = history.get(studentId).get(String(sessionKey));
        return enrollment ? placementLabels(ctx.classIndex, ctx.groupNames, enrollment).className : null;
    };
    // As of this payment: itself and everything recorded before it.
    const paidSoFar = data.payments.filter((item) => new Date(item.createdAt) <= new Date(payment.createdAt));
    const ledger = buildLedger(data.records, paidSoFar, record._id);
    const sessionLabel = ctx.sessionLabels.get(String(record.sessionId)) || null;
    const className = classOf(record.sessionId);

    const lines = (structure ? structure.particulars : []).map((item) => ({ label: item.name, amount: item.amount, kind: 'particular' }));
    if (record.admissionFee) lines.push({ label: 'Admission Fee', amount: record.admissionFee, kind: 'admission' });
    (payment.allocations || [])
        .filter((item) => String(item.recordId) !== String(record._id))
        .forEach((item) => {
            const pastClass = classOf(item.sessionId);
            lines.push({ label: `Previous Year Due${pastClass ? ` (${pastClass})` : ''}`, amount: item.amount, kind: 'arrear' });
        });
    const words = rupeesInWords(payment.amount);

    return {
        _id: String(payment._id),
        school: letterhead.header,
        receiptNo: payment.receiptNo || (payment.mode === OPENING_BALANCE ? 'Opening balance' : '—'),
        date: payment.date,
        dateText: dateText(payment.date),
        mode: payment.mode,
        session: shortSession(sessionLabel),
        student: {
            name: profile.name || '—',
            admissionNo: profile.admissionNo != null ? profile.admissionNo : null,
            className,
            fatherName: profile.fatherName || null,
            motherName: profile.motherName || null,
            parentsContact: profile.parentsContact || null,
        },
        lines,
        concession: record.concession || 0,
        amountReceived: payment.amount,
        totals: { totalFee: ledger.totals.gross, paid: ledger.totals.paid, due: ledger.totals.totalDue },
        amountInWords: words,
        note: `${words} received towards fee for ${className || 'the class'}, Session ${shortSession(sessionLabel)}.`,
    };
};

let GetReceipt = async (req, res) => {
    const { adminId } = req.query;
    const notFound = new NotFoundError(messages.paymentNotFound(), { module: MODULE, code: 'PAYMENT_NOT_FOUND' });
    if (!isObjectId(req.params.paymentId)) throw notFound;
    const payment = await FeePaymentModel.findOne({ _id: req.params.paymentId, adminId, deletedAt: null }).lean();
    if (!payment) throw notFound;
    return res.status(200).json({ receipt: await buildReceipt(adminId, payment) });
};

/** First instant of the report's period. */
const periodStart = (period, sessionLabel, now = new Date()) => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const back = (days) => new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
    const monthsBack = (months) => new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    switch (period) {
        case 'day': return today;
        case '7d': return back(6);
        case '15d': return back(14);
        case '1m': return monthsBack(1);
        case '3m': return monthsBack(3);
        case '6m': return monthsBack(6);
        default: return new Date(Number(String(sessionLabel).slice(0, 4)), 3, 1);
    }
};

/**
 * Generate Report — the filtered (or selected) students' rows plus what each paid in the
 * chosen period. The page builds the Excel / CSV / PDF from this, client-side.
 */
let GetFeeReport = async (req, res) => {
    const { adminId, session, period, studentIds } = req.body;
    const sessionId = await requireSessionId(adminId, session);
    const enrollments = await findEnrollments(adminId, sessionId, req.body, { limit: MAX_REPORT_ROWS, studentIds });
    const from = periodStart(period, session);
    const rows = await buildRows(adminId, sessionId, enrollments);
    const recordIds = rows.filter((row) => row.hasRecord).map((row) => toObjectId(row.recordId));
    const inPeriod = recordIds.length ? await FeePaymentModel.aggregate([
        { $match: { adminId, studentFeeRecordId: { $in: recordIds }, date: { $gte: from }, mode: { $ne: OPENING_BALANCE }, deletedAt: null } },
        { $group: { _id: '$studentFeeRecordId', total: { $sum: '$amount' } } },
    ]) : [];
    const collected = new Map(inPeriod.map((item) => [String(item._id), money(item.total)]));
    return res.status(200).json({
        period: { key: period, from, to: new Date() },
        rows: rows.map((row) => ({ ...row, collectedInPeriod: row.hasRecord ? collected.get(row.recordId) || 0 : 0 })),
        truncated: enrollments.length >= MAX_REPORT_ROWS,
    });
};

module.exports = {
    ListFees,
    CollectFee,
    UpdateConcession,
    GetReceipt,
    GetFeeReport,
    buildReceipt,
    buildRows,
    loadRowContext,
};
