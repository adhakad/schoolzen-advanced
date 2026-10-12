'use strict';
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { matchesReminder, paidPercent } = require('./fee-ledger');
const { loadLedgerData, ledgerFor, loadProfiles } = require('./fee-context');

// Fee Reminder's live resolution (fees/fee-reminder.md): a filter is re-run against the
// CURRENT ledger every time — the table's "To Send", the Review & Send modal, and the send
// worker's own pre-send check. Nothing here is cached or stored.

/** The usable 10-digit mobile from a profile's parents' contact, or null. */
const mobileOf = (profile) => {
    const digits = String((profile && profile.parentsContact) || '').replace(/\D/g, '');
    const local = digits.length > 10 ? digits.slice(-10) : digits;
    return /^[6-9]\d{9}$/.test(local) ? local : null;
};

/** Per student: { ledger, record, lastPaymentAt } for `sessionId`. */
const ledgerSnapshot = (data, sessionId) => {
    const { record, ledger } = ledgerFor(data, sessionId);
    const lastPayment = data.payments.length ? data.payments[data.payments.length - 1] : null;
    return { record, ledger, lastPaymentAt: lastPayment ? lastPayment.date : null };
};

/**
 * Everyone in the filter's class (this session) the filter matches right now.
 * @returns {Promise<Object[]>} rows { studentId, name, mobile, paidPercent, due, total }
 */
const resolveRecipients = async (adminId, sessionId, filter, now = new Date()) => {
    const enrollments = await StudentEnrollmentModel.find({ adminId, sessionId, classId: filter.classId }, 'studentId').lean();
    const studentIds = enrollments.map((item) => item.studentId);
    const [profiles, ledgers] = await Promise.all([loadProfiles(adminId, studentIds), loadLedgerData(adminId, studentIds)]);
    const rows = [];
    for (const enrollment of enrollments) {
        const studentId = String(enrollment.studentId);
        const snapshot = ledgerSnapshot(ledgers.get(studentId), sessionId);
        if (!snapshot.ledger) continue;
        const matched = matchesReminder(filter, {
            totals: snapshot.ledger.totals,
            lastPaymentAt: snapshot.lastPaymentAt,
            lastReminderSentAt: snapshot.record.lastReminderSentAt,
        }, now);
        if (!matched) continue;
        const profile = profiles.get(studentId) || {};
        rows.push({
            studentId,
            name: profile.name || '—',
            admissionNo: profile.admissionNo != null ? profile.admissionNo : null,
            mobile: mobileOf(profile),
            paidPercent: paidPercent(snapshot.ledger.totals),
            due: snapshot.ledger.totals.totalDue,
            total: snapshot.ledger.totals.gross,
        });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
};

module.exports = { mobileOf, ledgerSnapshot, resolveRecipients };
