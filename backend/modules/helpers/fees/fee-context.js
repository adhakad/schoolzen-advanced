'use strict';
const mongoose = require('mongoose');
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const FeePaymentModel = require('../../models/fees/fee-payment');
const { NotFoundError } = require('../../errors');
const messages = require('../messages/fees.messages');
const { findSessionId, loadSessionMap } = require('../academic-session/session-resolver');
const { loadClassIndex, describePlacement, titleCase } = require('../student/student.utils');
const { allows } = require('../../middleware/require-permission');
const { buildLedger } = require('./fee-ledger');

// Shared pieces of the four Fees controllers: permissions, actor, session ⇄ label, and the
// one batched ledger read (records + payments) every money figure is derived from.
const MODULE = 'fees';
const { ObjectId } = mongoose.Types;

// The explicit Roles & Permissions grants (models/settings/role.js).
const PERMISSIONS = Object.freeze({
    VIEW: 'fees',
    STRUCTURE: 'fees-structure',
    COLLECT: 'fees-collect',
    WAIVER: 'fees-waiver',
});

const actorOf = (req) => String((req.user && (req.user.staffId || req.user.id)) || req.staffId || 'admin');
const actorNameOf = (req) => {
    const user = req.user || {};
    return (user.payload && user.payload.name) || user.name || 'Admin';
};

/** Whether the caller holds `module`'s edit grant — the page hides controls on false. */
const canEditOf = (req, module) => Boolean(req.permissions && allows(req.permissions, module, 'edit'));

const isObjectId = (value) => ObjectId.isValid(String(value || '')) && String(new ObjectId(String(value))) === String(value);
const toObjectId = (value) => (value ? new ObjectId(String(value)) : null);

const studentNotFound = (id) => new NotFoundError(messages.studentNotFound(), { module: MODULE, code: 'STUDENT_NOT_FOUND', context: { id } });
const sessionNotFound = (label) => new NotFoundError(messages.sessionNotFound(), { module: MODULE, code: 'SESSION_NOT_FOUND', context: { label } });

/** The header's session label → its id; a label with no session yet is a 404. */
const requireSessionId = async (adminId, label) => {
    const id = await findSessionId(adminId, label);
    if (!id) throw sessionNotFound(label);
    return id;
};

/** Map<sessionId, label> for this school. */
const loadSessionLabels = async (adminId) => {
    const map = await loadSessionMap(adminId);
    return new Map(Object.entries(map).map(([label, id]) => [String(id), label]));
};

/** "2026-2027" → "2026-27", the references' short form. */
const shortSession = (label) => {
    const match = /^(\d{4})-(\d{4})$/.exec(String(label || ''));
    return match ? `${match[1]}-${match[2].slice(2)}` : String(label || '');
};

/**
 * Every live fee record + payment for these students, in TWO queries whatever the count:
 * Map<studentId, { records, payments }>, each record carrying its sessionLabel.
 */
const loadLedgerData = async (adminId, studentIds, { dbSession = null, sessionLabels = null } = {}) => {
    const ids = [...new Set(studentIds.map(String))].filter(isObjectId).map(toObjectId);
    const result = new Map(ids.map((id) => [String(id), { records: [], payments: [] }]));
    if (!ids.length) return result;
    const labels = sessionLabels || await loadSessionLabels(adminId);
    const records = await StudentFeeRecordModel.find({ adminId, studentId: { $in: ids }, deletedAt: null })
        .session(dbSession).lean();
    const byRecord = new Map();
    records.forEach((record) => {
        record.sessionLabel = labels.get(String(record.sessionId)) || null;
        result.get(String(record.studentId)).records.push(record);
        byRecord.set(String(record._id), String(record.studentId));
    });
    if (records.length) {
        const payments = await FeePaymentModel
            .find({ adminId, studentFeeRecordId: { $in: records.map((record) => record._id) }, deletedAt: null })
            .sort({ date: 1, createdAt: 1 }).session(dbSession).lean();
        payments.forEach((payment) => {
            const studentId = byRecord.get(String(payment.studentFeeRecordId));
            if (studentId) result.get(studentId).payments.push(payment);
        });
    }
    return result;
};

/** The student's record for `sessionId` and the ledger viewed from that session. */
const ledgerFor = (data, sessionId) => {
    const record = (data ? data.records : []).find((item) => String(item.sessionId) === String(sessionId)) || null;
    if (!record) return { record: null, ledger: null };
    return { record, ledger: buildLedger(data.records, data.payments, record._id) };
};

/** Students' profile fields the fees pages show, Map<studentId, profile>. */
const loadProfiles = async (adminId, studentIds) => {
    const ids = [...new Set(studentIds.map(String))].filter(isObjectId);
    if (!ids.length) return new Map();
    const rows = await StudentProfileModel.find(
        { adminId, _id: { $in: ids } },
        'name admissionNo fatherName motherName parentsContact photoUrl photoPublicId admissionType feesConcession'
    ).lean();
    return new Map(rows.map((row) => [String(row._id), row]));
};

/** Every enrollment of these students: Map<studentId, Map<sessionId, enrollment>>. */
const loadEnrollmentsBySession = async (adminId, studentIds) => {
    const ids = [...new Set(studentIds.map(String))].filter(isObjectId).map(toObjectId);
    const result = new Map(ids.map((id) => [String(id), new Map()]));
    if (!ids.length) return result;
    const rows = await StudentEnrollmentModel.find({ adminId, studentId: { $in: ids } },
        'studentId sessionId classId class streamId groupId sectionId rollNumber entryType').lean();
    rows.forEach((row) => result.get(String(row.studentId)).set(String(row.sessionId), row));
    return result;
};

/** Class / Stream / Group display names for one enrollment. */
const placementLabels = (classIndex, groupNames, enrollment) => {
    if (!enrollment) return { className: null, streamName: null, groupName: null };
    const placement = describePlacement(classIndex, enrollment);
    return {
        className: placement.className,
        streamName: placement.streamName,
        groupName: enrollment.groupId ? groupNames.get(String(enrollment.groupId)) || null : null,
    };
};

/**
 * Keyset page over rows already sorted by `_id` ascending: rows after `after`, `limit` of
 * them, plus the cursor for the next page (null on the last).
 */
const keysetPage = (rows, after, limit) => {
    const start = after ? rows.findIndex((row) => String(row._id) > String(after)) : 0;
    const from = start < 0 ? rows.length : start;
    const page = rows.slice(from, from + limit);
    const more = from + limit < rows.length;
    return { rows: page, nextCursor: more && page.length ? String(page[page.length - 1]._id) : null };
};

const offsetPage = (rows, page, limit) => ({
    rows: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    page,
    limit,
});

module.exports = {
    MODULE,
    PERMISSIONS,
    actorOf,
    actorNameOf,
    canEditOf,
    isObjectId,
    toObjectId,
    studentNotFound,
    requireSessionId,
    loadSessionLabels,
    shortSession,
    loadLedgerData,
    ledgerFor,
    loadProfiles,
    loadEnrollmentsBySession,
    placementLabels,
    loadClassIndex,
    titleCase,
    keysetPage,
    offsetPage,
};
