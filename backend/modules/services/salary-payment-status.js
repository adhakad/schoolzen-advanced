'use strict';

// WHAT COUNTS AS PAID.
//
// A SalaryPayment row records that an admin says money moved. That is one half of the fact.
// The other half is the employee agreeing it arrived — models/salary-payment.js carries that
// on the same row as confirmationStatus, and until it reads 'Confirmed' the payment does NOT
// settle anything. This file is the single place that rule is written down, because it is
// consulted from four directions (the Generate list's paymentStatus, the Payment History
// roll-up, the record-payment balance guard, and the salary slip's "money actually moved"
// precondition) and four copies of it would drift.
//
// TWO DIFFERENT QUESTIONS, TWO DIFFERENT FILTERS.
//
//   SETTLED  — "has this been paid?"      Confirmed only.
//   RESERVED — "is this money spoken for?" Confirmed + still-pending.
//
// The second exists so that recording a teacher's salary, then recording it again while the
// first request is still awaiting confirmation, is refused. Without it the balance guard
// would see nothing paid and cheerfully let the school pay twice, and only one of the two
// would ever get confirmed.
//
// null IS PART OF BOTH LISTS, AND IT IS NOT AN OVERSIGHT. Every payment written before
// confirmation existed has no confirmationStatus field at all, and a Mongo $in containing
// null matches a missing field. Leaving it out would silently flip a year of settled payroll
// history to Unpaid the moment this deploys.
const SETTLED_STATUSES = ['Confirmed', null];
const RESERVED_STATUSES = ['Confirmed', 'PendingConfirmation', null];

const SETTLED_MATCH = { confirmationStatus: { $in: SETTLED_STATUSES } };
const RESERVED_MATCH = { confirmationStatus: { $in: RESERVED_STATUSES } };

/**
 * True for a payment row already loaded in memory — the in-JS twin of SETTLED_MATCH, for the
 * handlers that have the documents rather than a query to add a clause to.
 */
const isSettled = (payment) => {
    if (!payment) return false;
    const status = payment.confirmationStatus;
    return status === undefined || status === null || status === 'Confirmed';
};

const isAwaitingConfirmation = (payment) => (
    !!payment && payment.confirmationStatus === 'PendingConfirmation'
);

/**
 * Unpaid / Partially Paid / Fully Paid, from netSalary and the SETTLED total.
 *
 * Lived in two controllers as identical copies before this file existed. Nothing stores the
 * result — see models/payroll.js; the sum is the truth.
 */
const paymentStatusOf = (netSalary, paid) => {
    if (!paid || paid <= 0) return 'Unpaid';
    // >= rather than ===: a rounding remainder of a paisa must not leave a fully settled
    // payroll reading as Partially Paid forever.
    if (paid >= netSalary) return 'Fully Paid';
    return 'Partially Paid';
};

// How long an employee has to acknowledge a payment before the request lapses. One place, so
// the value the row is stamped with and the value the hourly sweep enforces cannot disagree.
const CONFIRMATION_WINDOW_HOURS = 24;
const confirmationDeadlineFrom = (requestedAt) => (
    new Date(requestedAt.getTime() + CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000)
);

module.exports = {
    SETTLED_STATUSES,
    RESERVED_STATUSES,
    SETTLED_MATCH,
    RESERVED_MATCH,
    isSettled,
    isAwaitingConfirmation,
    paymentStatusOf,
    CONFIRMATION_WINDOW_HOURS,
    confirmationDeadlineFrom,
};
