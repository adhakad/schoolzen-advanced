'use strict';
const FeeStructureModel = require('../../models/fees/fee-structure');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const { findSessionId } = require('../academic-session/session-resolver');
const { registerPromotionStep } = require('../student/student.utils');
const { buildLedger } = require('./fee-ledger');
const { loadLedgerData, loadSessionLabels } = require('./fee-context');
const { pickStructure } = require('./fee-record-sync');

// Class Promotion's fee carry-forward (student/class-promotion.md; fees/fees.md arrears).
//
// Runs INSIDE each promotion chunk's transaction (workers/student-worker.js →
// runPromotionSteps), so a student is never promoted without their next-session fee record,
// or the reverse. For every promoted/detained student it creates the new session's
// StudentFeeRecord:
//   - totalFee from the target placement's Fee Structure (0 until one exists — creating the
//     structure later re-prices it, helpers/fees/fee-record-sync.js);
//   - no admission fee (they are not newly admitted) and concession 0 (a concession is set
//     per session, through the Fees page's waiver action);
//   - arrears[] = one entry per earlier session still owing money right now, as a snapshot.
//     What is owed stays derived live from payments (fee-ledger.js).
// Upsert-on-insert only: a retried chunk, or a record that already exists, is left alone.

const carryForward = async ({ dbSession, adminId, fromSession, enrollments }) => {
    if (!enrollments.length) return;
    const toSessionId = enrollments[0].sessionId;
    const [fromSessionId, sessionLabels, structures] = await Promise.all([
        findSessionId(adminId, fromSession),
        loadSessionLabels(adminId),
        FeeStructureModel.find({ adminId, sessionId: toSessionId, deletedAt: null }).session(dbSession).lean(),
    ]);
    const ledgers = await loadLedgerData(adminId, enrollments.map((item) => item.studentId), { dbSession, sessionLabels });

    const now = new Date();
    const ops = enrollments.map((enrollment) => {
        const data = ledgers.get(String(enrollment.studentId)) || { records: [], payments: [] };
        // Everything up to the session they are leaving — never a later one.
        const earlier = data.records.filter((record) => String(record.sessionId) === String(fromSessionId)
            || (record.sessionLabel && record.sessionLabel <= fromSession));
        const latest = [...earlier].sort((a, b) => String(b.sessionLabel || '').localeCompare(String(a.sessionLabel || '')))[0];
        const ledger = latest ? buildLedger(data.records, data.payments, latest._id) : null;
        const arrears = ledger
            ? ledger.sessions.filter((session) => session.due > 0)
                .map((session) => ({ sessionId: session.sessionId, recordId: session.recordId, amount: session.due }))
            : [];
        const structure = pickStructure(structures, enrollment);
        return { updateOne: {
            filter: { adminId, studentId: enrollment.studentId, sessionId: toSessionId },
            update: { $setOnInsert: {
                adminId,
                studentId: enrollment.studentId,
                sessionId: toSessionId,
                feeStructureId: structure ? structure._id : null,
                totalFee: structure ? FeeStructureModel.totalOf(structure) : 0,
                admissionFee: 0,
                concession: 0,
                arrears,
                deletedAt: null,
                createdBy: 'promotion',
                createdAt: now,
                updatedAt: now,
            } },
            upsert: true,
        } };
    });
    await StudentFeeRecordModel.bulkWrite(ops, { ordered: false, session: dbSession });
};

registerPromotionStep('fees', carryForward);

module.exports = { carryForward };
