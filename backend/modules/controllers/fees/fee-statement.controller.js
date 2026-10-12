'use strict';
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const FeeStructureModel = require('../../models/fees/fee-structure');
const { imageUrl } = require('../../services/media/cloudinary.service');
const { STATUS_LABELS, money, buildLedger } = require('../../helpers/fees/fee-ledger');
const { resolveFeeStructure } = require('../../helpers/fees/fee-structure-resolver');
const {
    isObjectId, studentNotFound, requireSessionId, shortSession, loadLedgerData, ledgerFor, loadProfiles,
    placementLabels,
} = require('../../helpers/fees/fee-context');
const { loadRowContext } = require('./fees.controller');

// Fee Statement (fees/fee-statement.md) — ONE read-composed view per student: profile,
// summary, every past session they were EVER enrolled in (a fully-paid one stays listed),
// this year's particulars and payments. Composed server-side in one request (no client-side
// joins) and never cached — it reads the same live balances as the Fees page.

const toPayment = (payment, recordId) => {
    // The part of this payment that went to this session (a later payment may have cleared
    // an arrear here).
    const share = payment.allocations && payment.allocations.length
        ? payment.allocations.filter((item) => String(item.recordId) === String(recordId)).reduce((sum, item) => sum + item.amount, 0)
        : payment.amount;
    return {
        _id: String(payment._id),
        receiptNo: payment.receiptNo || (payment.mode === 'opening-balance' ? 'Opening balance' : '—'),
        amount: money(share),
        receiptAmount: payment.amount,
        date: payment.date,
        mode: payment.mode,
        collectedBy: payment.collectedByName || (payment.mode === 'opening-balance' ? 'Admission' : null),
        printable: payment.mode !== 'opening-balance',
    };
};

const paymentsTouching = (payments, recordId) => payments
    .filter((payment) => String(payment.studentFeeRecordId) === String(recordId)
        || (payment.allocations || []).some((item) => String(item.recordId) === String(recordId)))
    .map((payment) => toPayment(payment, recordId))
    .filter((payment) => payment.amount > 0);

let GetFeeStatement = async (req, res) => {
    const { adminId, session } = req.query;
    const { studentId } = req.params;
    if (!isObjectId(studentId)) throw studentNotFound(studentId);
    const profile = (await loadProfiles(adminId, [studentId])).get(String(studentId));
    if (!profile) throw studentNotFound(studentId);
    const sessionId = await requireSessionId(adminId, session);

    const [ctx, data, enrollments] = await Promise.all([
        loadRowContext(adminId),
        loadLedgerData(adminId, [studentId]).then((map) => map.get(String(studentId))),
        StudentEnrollmentModel.find({ adminId, studentId }).lean(),
    ]);
    const labelOf = (id) => ctx.sessionLabels.get(String(id)) || null;
    const recordBySession = new Map(data.records.map((record) => [String(record.sessionId), record]));
    const current = enrollments.find((item) => String(item.sessionId) === String(sessionId)) || null;
    const { record, ledger } = ledgerFor(data, sessionId);
    const sessionLedger = new Map((ledger ? ledger.sessions : []).map((item) => [item.sessionId, item]));

    // Every past session they were enrolled in — with or without a fee record, paid or not.
    const previous = enrollments
        .filter((item) => labelOf(item.sessionId) && labelOf(item.sessionId) < session)
        .sort((a, b) => String(labelOf(b.sessionId)).localeCompare(String(labelOf(a.sessionId))))
        .map((item) => {
            const sessionKey = String(item.sessionId);
            const past = recordBySession.get(sessionKey);
            // Viewed from the current session when there is one, else on its own.
            const line = sessionLedger.get(sessionKey)
                || (past ? buildLedger(data.records, data.payments, past._id).current : null);
            return {
                sessionLabel: labelOf(item.sessionId),
                sessionShort: shortSession(labelOf(item.sessionId)),
                className: placementLabels(ctx.classIndex, ctx.groupNames, item).className,
                hasRecord: Boolean(past),
                total: line ? line.charge : 0,
                paid: line ? line.paid : 0,
                due: line ? line.due : 0,
                status: line ? line.status : null,
                statusLabel: line ? STATUS_LABELS[line.status] : null,
                payments: past ? paymentsTouching(data.payments, past._id) : [],
            };
        });

    // This year's particulars — from the structure the record was priced from, else the one
    // that would apply to the placement.
    let structure = record && record.feeStructureId
        ? await FeeStructureModel.findOne({ _id: record.feeStructureId, adminId }).lean()
        : null;
    if (!structure && current) {
        const resolved = await resolveFeeStructure(adminId, sessionId, current);
        structure = resolved ? resolved.structure : null;
    }
    const particulars = (structure ? structure.particulars : []).map((item) => ({ name: item.name, amount: item.amount }));
    if (record && record.admissionFee) particulars.push({ name: 'Admission Fee', amount: record.admissionFee });

    const allSessions = buildLedger(data.records, data.payments);
    const placement = current ? placementLabels(ctx.classIndex, ctx.groupNames, current) : { className: null };

    return res.status(200).json({
        student: {
            _id: String(profile._id),
            name: profile.name,
            admissionNo: profile.admissionNo != null ? profile.admissionNo : null,
            fatherName: profile.fatherName || null,
            photoUrl: profile.photoPublicId ? imageUrl(profile.photoPublicId, 112) : (profile.photoUrl || null),
            className: placement.className,
            streamName: placement.streamName || null,
            groupName: placement.groupName || null,
            rollNumber: current && current.rollNumber != null ? current.rollNumber : null,
        },
        session,
        hasRecord: Boolean(record),
        summary: ledger ? {
            concession: ledger.totals.concession,
            paid: ledger.totals.paid,
            due: ledger.totals.totalDue,
            total: ledger.totals.gross,
            status: ledger.totals.status,
            statusLabel: STATUS_LABELS[ledger.totals.status],
            arrears: ledger.arrears.map((item) => {
                const enrollment = enrollments.find((row) => String(row.sessionId) === item.sessionId);
                return { sessionShort: shortSession(item.sessionLabel), className: enrollment ? placementLabels(ctx.classIndex, ctx.groupNames, enrollment).className : null, due: item.due };
            }),
        } : null,
        previous,
        particulars,
        payments: record ? paymentsTouching(data.payments, record._id) : [],
        lifetime: {
            sessionsEnrolled: enrollments.filter((item) => labelOf(item.sessionId) && labelOf(item.sessionId) <= session).length,
            totalPaid: money(data.payments.reduce((sum, payment) => sum + payment.amount, 0)),
            totalOutstanding: ledger ? ledger.totals.totalDue : money(allSessions.sessions.reduce((sum, item) => sum + item.due, 0)),
        },
    });
};

module.exports = { GetFeeStatement };
