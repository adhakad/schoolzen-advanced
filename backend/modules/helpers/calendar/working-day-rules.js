'use strict';
const { toUtcMidnight, toDateKey } = require('../date-only');

// THE "is this a working day" rule — pure, so the resolver service, Leave, Attendance, the
// reconcile worker and scripts/test-working-day.js all share one definition.
//
// Precedence for one person on one day:
//   1. Holiday   — a dated holiday from the person's assigned Holiday template
//   2. Leave     — a day an approved leave was charged for
//   3. WeeklyOff — the person's Roster cell is WO
//   4. Working   — otherwise
// A day with NO roster entry (every student day; staff not rostered that day) keeps the
// behaviour from before the Holiday build: Sunday is the weekly off.

const WEEK_OFF = 'WO';
const DAY_TYPE = Object.freeze({ HOLIDAY: 'Holiday', LEAVE: 'Leave', WEEKLY_OFF: 'WeeklyOff', WORKING: 'Working' });
const DAY_MS = 86400000;
const MAX_SPAN_DAYS = 400;

const isUnrosteredWeeklyOff = (dateKey) => {
    const date = toUtcMidnight(dateKey);
    return Boolean(date) && date.getUTCDay() === 0;
};

/**
 * @param {{ dateKey: String, holiday: Boolean, leave: Boolean, rosterValue: String|null|undefined }} day
 *   rosterValue: the Roster cell — a shiftId, 'WO', or empty for "no roster entry".
 */
const resolveDayType = ({ dateKey, holiday, leave, rosterValue }) => {
    if (holiday) return DAY_TYPE.HOLIDAY;
    if (leave) return DAY_TYPE.LEAVE;
    if (rosterValue === WEEK_OFF) return DAY_TYPE.WEEKLY_OFF;
    if (rosterValue) return DAY_TYPE.WORKING;
    return isUnrosteredWeeklyOff(dateKey) ? DAY_TYPE.WEEKLY_OFF : DAY_TYPE.WORKING;
};

/** Every "YYYY-MM-DD" from..to inclusive (capped), or [] for a missing/reversed range. */
const eachKey = (fromKey, toKey) => {
    const start = toUtcMidnight(fromKey);
    const end = toUtcMidnight(toKey);
    if (!start || !end || start > end) return [];
    const keys = [];
    for (let day = start; day <= end && keys.length < MAX_SPAN_DAYS; day = new Date(day.getTime() + DAY_MS)) keys.push(toDateKey(day));
    return keys;
};

/** The distinct { year, month (1-12) } a range touches — the Roster's monthly-snapshot keys. */
const monthsOf = (fromKey, toKey) => {
    const seen = new Map();
    eachKey(fromKey, toKey).forEach((key) => {
        const year = Number(key.slice(0, 4));
        const month = Number(key.slice(5, 7));
        seen.set(`${year}-${month}`, { year, month });
    });
    return [...seen.values()];
};

module.exports = { WEEK_OFF, DAY_TYPE, resolveDayType, isUnrosteredWeeklyOff, eachKey, monthsOf };
