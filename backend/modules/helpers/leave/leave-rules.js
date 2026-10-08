'use strict';
const { toUtcMidnight, toDateKey } = require('../date-only');
const { isWeeklyOff } = require('../attendance/status');

// The Leave module's pure rules — no DB, so scripts/test-leave-v2.js can check them directly.

const MAX_RANGE_DAYS = 366;

/**
 * Sunday only until the Holiday module (#6) exists — this is the ONE place its calendar
 * joins in (leave-requests.md: "excluding Sundays + Holiday rows").
 */
const isNonWorkingDay = (dateKey, holidayKeys) => isWeeklyOff(dateKey) || Boolean(holidayKeys && holidayKeys.has(dateKey));

/** Every "YYYY-MM-DD" from..to inclusive, or [] for a missing/reversed/over-long range. */
const eachDayKey = (fromKey, toKey) => {
    const start = toUtcMidnight(fromKey);
    const end = toUtcMidnight(toKey);
    if (!start || !end || start > end) return [];
    const keys = [];
    for (let day = start; day <= end && keys.length <= MAX_RANGE_DAYS; day = new Date(day.getTime() + 86400000)) {
        keys.push(toDateKey(day));
    }
    return keys;
};

/** The grantable days of a range — what a leave is charged and marks on attendance. */
const expandWorkingDays = (fromKey, toKey, holidayKeys) =>
    eachDayKey(fromKey, toKey).filter((key) => !isNonWorkingDay(key, holidayKeys));

/** Inclusive calendar-range overlap on "YYYY-MM-DD" keys (string compare is date order). */
const rangesOverlap = (aFrom, aTo, bFrom, bTo) => aFrom <= bTo && aTo >= bFrom;

/**
 * The row action per status — never all of them at once (leave-requests.md):
 * Pending → approve/reject, Approved → cancel (only while not completed), Rejected → delete.
 */
const actionsForStatus = (status, toDateKey, todayKey) => {
    if (status === 'Pending') return ['approve', 'reject'];
    if (status === 'Approved') return toDateKey >= todayKey ? ['cancel'] : [];
    if (status === 'Rejected') return ['delete'];
    return [];
};

/** Whether `personType` may take a leave type. */
const isApplicable = (whoCanTake, personType) => whoCanTake === 'everyone'
    || (whoCanTake === 'staff' && personType === 'staff')
    || (whoCanTake === 'students' && personType === 'student');

/**
 * The limit that applies to a person for one type: their own LeaveLimit, else (students) the
 * class default they inherit, else null — "never assigned".
 */
const effectiveLimit = (limit, classDefault) => {
    if (limit) return { allocatedDays: limit.allocatedDays, usedDays: limit.usedDays || 0, source: limit.source, assigned: true };
    if (classDefault) return { allocatedDays: classDefault.allocatedDays, usedDays: 0, source: 'class', assigned: true, inherited: true };
    return null;
};

/** Remaining days, deliberately not clamped — a force-approval can take it negative. */
const remainingOf = (effective) => (effective ? effective.allocatedDays - effective.usedDays : null);

/** True when `requested` more days would go past the allowance. */
const exceedsBalance = (effective, requested) => Boolean(effective) && effective.usedDays + requested > effective.allocatedDays;

/** usedDays after giving back a cancelled leave — never below zero. */
const releasedUsedDays = (usedDays, charged) => Math.max(0, (usedDays || 0) - (charged || 0));

/** "classId|streamId|sectionId" — one Leave Assign class row. */
const classKey = (row) => `${row.classId}|${row.streamId || ''}|${row.sectionId || ''}`;

module.exports = {
    MAX_RANGE_DAYS,
    isNonWorkingDay,
    eachDayKey,
    expandWorkingDays,
    rangesOverlap,
    actionsForStatus,
    isApplicable,
    effectiveLimit,
    remainingOf,
    exceedsBalance,
    releasedUsedDays,
    classKey,
};
