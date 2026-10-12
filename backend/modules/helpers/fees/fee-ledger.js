'use strict';

// THE fee ledger — pure functions, no database. Every money figure the Fees module shows or
// writes (Fees table, Collect modal, Fee Statement, receipts, reminders, promotion's
// carry-forward) comes out of here, so the four pages can never disagree (fees/fees.md:
// Paid / Due / Status are DERIVED from FeePayment, never stored).
//
// Shapes:
//   record  { _id, sessionId, sessionLabel, totalFee, admissionFee, concession, ... }
//   payment { _id, studentFeeRecordId, amount, allocations?: [{ recordId, sessionId, amount }] }
//
// A payment with allocations counts exactly where they say. One without (Admission's
// 'opening-balance') counts in full against its own record.

const STATUS = Object.freeze({ PAID: 'paid', HAS_ARREARS: 'has-arrears', PARTIAL: 'partial', UNPAID: 'unpaid' });
const STATUS_LABELS = Object.freeze({
    [STATUS.PAID]: 'Fully Paid',
    [STATUS.HAS_ARREARS]: 'Has Arrears',
    [STATUS.PARTIAL]: 'Partial',
    [STATUS.UNPAID]: 'Unpaid',
});

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** The annual gross a record bills: particulars total + admission fee (when it applies). */
const grossOf = (record) => money((record.totalFee || 0) + (record.admissionFee || 0));

/** What the student actually owes for the record's session: gross − concession. */
const chargeOf = (record) => money(Math.max(0, grossOf(record) - (record.concession || 0)));

/** Map<recordId, paid> — every payment's allocations, summed per record. */
const paidByRecord = (payments) => {
    const paid = new Map();
    const add = (recordId, amount) => {
        const key = String(recordId);
        paid.set(key, money((paid.get(key) || 0) + (Number(amount) || 0)));
    };
    for (const payment of payments || []) {
        if (payment.deletedAt) continue;
        if (payment.allocations && payment.allocations.length) {
            payment.allocations.forEach((item) => add(item.recordId, item.amount));
        } else {
            add(payment.studentFeeRecordId, payment.amount);
        }
    }
    return paid;
};

/**
 * One student's ledger up to (and including) `currentRecordId`'s session — sessions after it
 * are ignored, so viewing last year never counts next year's charges.
 *
 * @param {Object[]} records   the student's fee records (any order), each with sessionLabel
 * @param {Object[]} payments  every payment against those records
 * @param {String}   [currentRecordId]  defaults to the latest session
 * @returns {{ sessions: Object[], current: Object|null, arrears: Object[], totals: Object }}
 *   sessions oldest → newest, each { recordId, sessionId, sessionLabel, gross, concession,
 *   charge, paid, due, status }; arrears = earlier sessions still owing.
 */
const buildLedger = (records, payments, currentRecordId) => {
    const live = (records || []).filter((record) => !record.deletedAt);
    const sorted = [...live].sort((a, b) => String(a.sessionLabel || '').localeCompare(String(b.sessionLabel || '')));
    const currentIndex = currentRecordId
        ? sorted.findIndex((record) => String(record._id) === String(currentRecordId))
        : sorted.length - 1;
    const upTo = currentIndex < 0 ? [] : sorted.slice(0, currentIndex + 1);
    const paid = paidByRecord(payments);

    const sessions = upTo.map((record) => {
        const charge = chargeOf(record);
        const sessionPaid = paid.get(String(record._id)) || 0;
        return {
            recordId: String(record._id),
            sessionId: String(record.sessionId),
            sessionLabel: record.sessionLabel || null,
            gross: grossOf(record),
            concession: money(record.concession || 0),
            charge,
            paid: sessionPaid,
            due: money(Math.max(0, charge - sessionPaid)),
        };
    });
    sessions.forEach((session) => {
        session.status = session.due <= 0 ? STATUS.PAID : (session.paid > 0 ? STATUS.PARTIAL : STATUS.UNPAID);
    });

    const current = sessions.length ? sessions[sessions.length - 1] : null;
    const arrears = sessions.slice(0, -1).filter((session) => session.due > 0);
    const arrearsDue = money(arrears.reduce((sum, session) => sum + session.due, 0));
    const totalDue = money((current ? current.due : 0) + arrearsDue);

    let status = STATUS.PAID;
    if (totalDue > 0) {
        if (arrearsDue > 0) status = STATUS.HAS_ARREARS;
        else status = current && current.paid > 0 ? STATUS.PARTIAL : STATUS.UNPAID;
    }

    return {
        sessions,
        current,
        arrears,
        totals: {
            gross: current ? current.gross : 0,
            concession: current ? current.concession : 0,
            paid: current ? current.paid : 0,
            currentDue: current ? current.due : 0,
            arrearsDue,
            totalDue,
            status,
        },
    };
};

/**
 * Split `amount` across the ledger's dues, OLDEST SESSION FIRST — every arrear is cleared
 * before a rupee reaches the current year (fees/fees.md). The ONE allocation function: every
 * place a payment can be recorded calls this, none re-derives it.
 *
 * @returns {{ allocations: {recordId, sessionId, amount}[] } | { error: 'PAYMENT_AMOUNT_INVALID'|'PAYMENT_EXCEEDS_DUE', totalDue }}
 */
const allocateOldestFirst = (ledger, amount) => {
    const value = money(amount);
    const totalDue = ledger.totals.totalDue;
    if (!Number.isFinite(Number(amount)) || value <= 0) return { error: 'PAYMENT_AMOUNT_INVALID', totalDue };
    if (value > totalDue) return { error: 'PAYMENT_EXCEEDS_DUE', totalDue };

    let remaining = value;
    const allocations = [];
    for (const session of ledger.sessions) {
        if (remaining <= 0) break;
        if (session.due <= 0) continue;
        const take = money(Math.min(session.due, remaining));
        allocations.push({ recordId: session.recordId, sessionId: session.sessionId, amount: take });
        remaining = money(remaining - take);
    }
    return { allocations };
};

/**
 * Fee Reminder's match: someone still owing money, below the paid-% threshold, with no
 * payment for N days and not reminded within the gap. null thresholds don't filter.
 */
const matchesReminder = (filter, { totals, lastPaymentAt, lastReminderSentAt }, now = new Date()) => {
    if (totals.totalDue <= 0) return false;
    const dayMs = 24 * 60 * 60 * 1000;
    if (filter.paidBelowPercent != null && paidPercent(totals) >= Number(filter.paidBelowPercent)) return false;
    if (filter.noPaymentSinceDays != null && lastPaymentAt
        && now.getTime() - new Date(lastPaymentAt).getTime() < Number(filter.noPaymentSinceDays) * dayMs) return false;
    if (filter.gapSinceLastReminderDays != null && lastReminderSentAt
        && now.getTime() - new Date(lastReminderSentAt).getTime() < Number(filter.gapSinceLastReminderDays) * dayMs) return false;
    return true;
};

/** This session's paid share of its own charge — the Review & Send modal's "Paid %". */
const paidPercent = (totals) => {
    const charge = money(totals.gross - totals.concession);
    return charge > 0 ? Math.floor((totals.paid / charge) * 100) : 100;
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const belowHundred = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const belowThousand = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', belowHundred(n % 100)].filter(Boolean).join(' ');

/** 20000 → "Rupees Twenty Thousand Only" (Indian grouping: thousand, lakh, crore). */
const rupeesInWords = (amount) => {
    let n = Math.floor(money(amount));
    if (n === 0) return 'Rupees Zero Only';
    const parts = [];
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(`${belowThousand(crore)} Crore`);
    if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
    if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
    if (n) parts.push(belowThousand(n));
    return `Rupees ${parts.join(' ')} Only`;
};

module.exports = {
    STATUS,
    STATUS_LABELS,
    money,
    grossOf,
    chargeOf,
    paidByRecord,
    buildLedger,
    allocateOldestFirst,
    matchesReminder,
    paidPercent,
    rupeesInWords,
};
