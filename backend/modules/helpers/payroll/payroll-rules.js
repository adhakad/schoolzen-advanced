'use strict';

// THE payroll arithmetic — pure, so a single generate, a bulk generate (inline or in the
// worker) and scripts/test-payroll-v2.js all share one definition and can never produce
// different numbers for the same staff-month.
//
// money(), resolveEffectiveSalary() and calculatePay() are the legacy controllers/payroll.js
// helpers, kept exactly (payroll/errors.md: "must be copied verbatim, not re-derived"),
// adapted only to v2's `overrides.*` / `mode: monthly|daily` shape.

// Money is rounded ONCE, at the end, and only here. Rounding intermediate values instead
// would let a gross of 26000 and its own components disagree by a rupee on screen.
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const sumComponents = (components) => (components || [])
    .reduce((total, component) => total + (Number(component.amount) || 0), 0);

const cleanComponents = (components) => (components || []).map((component) => ({
    name: component.name,
    amount: money(component.amount),
}));

const hasValue = (value) => value !== null && value !== undefined;

/**
 * The group values with any per-person override applied on top — a MERGE, field by field.
 *
 * `=== null || === undefined` IS THE TEST, NEVER TRUTHINESS. An override HRA of 0 is a real
 * instruction (this person gets no HRA); a falsy check would silently pay them the group
 * value. Arrays replace the group's list only when present — [] means "none", null means
 * "use the group list".
 */
const resolveEffectiveSalary = (group, overrides) => {
    const own = overrides || {};
    return {
        basic: hasValue(own.basic) ? own.basic : group.basic,
        hra: hasValue(own.hra) ? own.hra : group.hra,
        allowances: Array.isArray(own.allowances) ? own.allowances : (group.allowances || []),
        deductions: Array.isArray(own.deductions) ? own.deductions : (group.deductions || []),
    };
};

/** True when any override field is set AND differs from the group's figure. */
const hasPersonalOverride = (group, overrides) => {
    if (!overrides || !group) return false;
    const sameList = (a, b) => JSON.stringify(cleanComponents(a)) === JSON.stringify(cleanComponents(b));
    return (hasValue(overrides.basic) && Number(overrides.basic) !== Number(group.basic))
        || (hasValue(overrides.hra) && Number(overrides.hra) !== Number(group.hra))
        || (Array.isArray(overrides.allowances) && !sameList(overrides.allowances, group.allowances))
        || (Array.isArray(overrides.deductions) && !sameList(overrides.deductions, group.deductions));
};

const NO_WORKING_DAYS = 'NO_WORKING_DAYS';

/**
 * The two pay formulas.
 * @param {Object} effective from resolveEffectiveSalary
 * @param {'monthly'|'daily'} mode
 * @param {{ presentDays, paidLeaveDays, unpaidLeaveDays, absentDays, totalWorkingDays }} counts
 * @returns {{ gross, attendanceDeduction, deductionTotal, net }|{ error: String }}
 */
const calculatePay = (effective, mode, counts) => {
    const allowanceTotal = sumComponents(effective.allowances);
    const deductionTotal = sumComponents(effective.deductions);
    const baseRate = (Number(effective.basic) || 0) + (Number(effective.hra) || 0) + allowanceTotal;

    if (mode === 'daily') {
        // The amounts are PER-DAY rates, so attendance is already inside gross. Paid leave is
        // payable; unpaid leave and absences simply are not counted.
        const payableDays = counts.presentDays + counts.paidLeaveDays;
        const gross = baseRate * payableDays;
        // Deductions stay FLAT — scaling them too would charge the same absence twice.
        return { gross: money(gross), attendanceDeduction: 0, deductionTotal: money(deductionTotal), net: money(gross - deductionTotal) };
    }

    // monthly: the amounts are a full month, and attendance bites through a deduction.
    if (!counts.totalWorkingDays || counts.totalWorkingDays <= 0) {
        // Dividing by this would save a -Infinity net. Refuse with the actual cause instead.
        return { error: NO_WORKING_DAYS };
    }
    const gross = baseRate;
    const unpaidDays = counts.absentDays + counts.unpaidLeaveDays;
    const attendanceDeduction = (gross / counts.totalWorkingDays) * unpaidDays;
    const total = deductionTotal + attendanceDeduction;
    return { gross: money(gross), attendanceDeduction: money(attendanceDeduction), deductionTotal: money(total), net: money(gross - total) };
};

/**
 * One person-month's attendance counts from the resolved calendar.
 * @param {Array<{ dateKey, dayType, status, leavePaid }>} days every day of the FULL month
 *   dayType: Working|Leave|Holiday|WeeklyOff (services/calendar/working-day.js)
 *   status:  that day's AttendanceRecord status, or null
 *   leavePaid: for a Leave day, the leave type's isPaid
 * @param {String} todayKey the school's today — that day and later have not happened yet
 *
 * totalWorkingDays is always the FULL month (generate-payroll.md, mid-month correctness):
 * never truncated to the days elapsed. A future day counts only when an approved leave
 * already covers it; any other future working day stays uncounted (neither present nor
 * absent) and is reported in `remainingDays`.
 */
const summarizeMonth = (days, todayKey) => {
    const out = {
        present: 0, late: 0, halfDay: 0, absent: 0, paidLeave: 0, unpaidLeave: 0,
        holiday: 0, weeklyOff: 0, workingDays: 0, remainingDays: 0, remainingCoveredByLeave: 0,
    };
    days.forEach(({ dateKey, dayType, status, leavePaid }) => {
        if (dayType === 'Holiday') { out.holiday += 1; return; }
        if (dayType === 'WeeklyOff') { out.weeklyOff += 1; return; }
        out.workingDays += 1;
        const future = dateKey >= todayKey;
        if (dayType === 'Leave') {
            if (leavePaid === false) out.unpaidLeave += 1; else out.paidLeave += 1;
            if (future) { out.remainingDays += 1; out.remainingCoveredByLeave += 1; }
            return;
        }
        if (future) { out.remainingDays += 1; return; }
        if (status === 'Present') out.present += 1;
        else if (status === 'Late') { out.present += 1; out.late += 1; }
        else if (status === 'HalfDay') { out.present += 0.5; out.absent += 0.5; out.halfDay += 1; }
        else out.absent += 1;   // Absent, or no record for a past working day
    });
    return out;
};

const countsFor = (summary) => ({
    presentDays: summary.present,
    paidLeaveDays: summary.paidLeave,
    unpaidLeaveDays: summary.unpaidLeave,
    absentDays: summary.absent,
    totalWorkingDays: summary.workingDays,
});

// ---- status / payouts ---------------------------------------------------------------------

/** Generate Payroll's row actions — exactly one set per status. */
const actionsForStatus = (status) => {
    if (status === 'locked') return ['slip', 'unlock'];
    if (status === 'draft') return ['regenerate', 'lock'];
    return ['generate'];
};

/**
 * Paid / reserved sums for one run's payments. Only `confirmed` is paid; `pending` is
 * reserved (it still blocks over-paying); disputed/expired count for nothing.
 */
const paymentTotals = (payments) => {
    let confirmed = 0;
    let pending = 0;
    (payments || []).forEach((payment) => {
        if (payment.deletedAt) return;
        if (payment.confirmationStatus === 'confirmed') confirmed += Number(payment.amountPaid) || 0;
        else if (payment.confirmationStatus === 'pending') pending += Number(payment.amountPaid) || 0;
    });
    return { confirmed: money(confirmed), pending: money(pending) };
};

/** Derived, never stored: 'unpaid' | 'partial' | 'full'. */
const payoutStatus = (net, confirmed) => {
    if (confirmed <= 0) return 'unpaid';
    return money(confirmed) >= money(net) ? 'full' : 'partial';
};

/** What may still be recorded: net − (confirmed + pending), never below zero. */
const remainingDue = (net, confirmed, pending) => Math.max(0, money(net - confirmed - pending));

/** A pending payment past its window is expired even before the hourly sweep runs. */
const effectiveConfirmation = (payment, now = new Date()) => {
    if (payment.confirmationStatus === 'pending' && payment.confirmationExpiresAt && new Date(payment.confirmationExpiresAt) <= now) {
        return 'expired';
    }
    return payment.confirmationStatus;
};

// ---- calendar -----------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const monthRange = (year, month) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { fromKey: `${year}-${pad(month)}-01`, toKey: `${year}-${pad(month)}-${pad(last)}` };
};

module.exports = {
    money,
    sumComponents,
    cleanComponents,
    resolveEffectiveSalary,
    hasPersonalOverride,
    calculatePay,
    summarizeMonth,
    countsFor,
    actionsForStatus,
    paymentTotals,
    payoutStatus,
    remainingDue,
    effectiveConfirmation,
    monthRange,
    NO_WORKING_DAYS,
};
