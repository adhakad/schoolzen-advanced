'use strict';
const { toUtcMidnight, toDateKey } = require('../date-only');
const { money } = require('../fees/fee-ledger');

// The Dashboard's pure rules — no database, no cache. Every percentage the page shows is
// computed HERE, once (errors.md: "the same divide-by-zero guard only has to exist once"),
// and the frontend only renders it.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "YYYY-MM-DD" ± n days, on the date-only (UTC-midnight) frame. */
const addDays = (dateKey, n) => toDateKey(new Date(toUtcMidnight(dateKey).getTime() + n * DAY_MS));

/**
 * One day's attendance % from its status counts, or null with the reason there is no
 * number — never NaN/Infinity (errors.md shape 8). Leave / Holiday / WeeklyOff are not
 * working days for that person, so they sit outside the denominator.
 *
 * @param {Object} counts { Present, Late, HalfDay, Absent, Leave, Holiday, WeeklyOff }
 * @returns {{ pct: Number|null, reason: null|'holiday'|'weekly-off'|'not-marked' }}
 */
const attendanceDayPct = (counts = {}) => {
    const c = (key) => Number(counts[key]) || 0;
    const attended = c('Present') + c('Late') + c('HalfDay');
    const denominator = attended + c('Absent');
    if (denominator > 0) return { pct: Math.round((attended / denominator) * 100), reason: null };
    if (c('Holiday') > 0 && c('Holiday') >= c('WeeklyOff')) return { pct: null, reason: 'holiday' };
    if (c('WeeklyOff') > 0) return { pct: null, reason: 'weekly-off' };
    return { pct: null, reason: 'not-marked' };
};

/**
 * The 7 bars ending today, oldest first: label (weekday; "Today" for the last), the day's
 * % (or null + reason). `rows` are `$group` results: { _id: { dateKey, status }, count }.
 */
const buildWeekBars = (todayKey, rows = []) => {
    const byDay = new Map();
    rows.forEach((row) => {
        const { dateKey, status } = row._id || {};
        if (!dateKey) return;
        const day = byDay.get(dateKey) || {};
        day[status] = (day[status] || 0) + (Number(row.count) || 0);
        byDay.set(dateKey, day);
    });
    const bars = [];
    for (let back = 6; back >= 0; back -= 1) {
        const dateKey = addDays(todayKey, -back);
        const { pct, reason } = attendanceDayPct(byDay.get(dateKey));
        bars.push({
            dateKey,
            label: back === 0 ? 'Today' : WEEKDAY_SHORT[toUtcMidnight(dateKey).getUTCDay()],
            pct,
            reason,
            isToday: back === 0,
        });
    }
    return bars;
};

/** The first 7-day window's start — the attendance pipeline's $match lower bound. */
const weekStartKey = (todayKey) => addDays(todayKey, -6);

/**
 * Fee donut: Collected vs Due for the session, arrears included. `totals` is the pipeline's
 * single $group row (or undefined when the session has no fee records).
 */
const feeDonut = (totals) => {
    const collected = money(totals && totals.collected);
    const due = money(totals && totals.due);
    const base = collected + due;
    return {
        collected,
        due,
        // Nothing billed yet → no percentage, never 0/0.
        collectedPct: base > 0 ? Math.round((collected / base) * 100) : null,
    };
};

/** "YYYY-MM" → { monthKey, startKey, endKey }, or null for a malformed value. */
const monthBounds = (monthKey) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const pad = (n) => String(n).padStart(2, '0');
    return { monthKey: `${year}-${pad(month)}`, startKey: `${year}-${pad(month)}-01`, endKey: `${year}-${pad(month)}-${pad(last)}` };
};

const monthOf = (dateKey) => String(dateKey).slice(0, 7);

/** Day-of-month numbers inside `monthKey` that any holiday range covers, ascending. */
const holidayDaysInMonth = (monthKey, holidays = []) => {
    const bounds = monthBounds(monthKey);
    if (!bounds) return [];
    const days = new Set();
    holidays.forEach((holiday) => {
        const from = holiday.startDateKey > bounds.startKey ? holiday.startDateKey : bounds.startKey;
        const to = holiday.endDateKey < bounds.endKey ? holiday.endDateKey : bounds.endKey;
        for (let key = from; key <= to; key = addDays(key, 1)) days.add(Number(key.slice(8, 10)));
    });
    return [...days].sort((a, b) => a - b);
};

/**
 * The quick-action tiles, in the reference's order, each with the grant it needs. A tile
 * the viewer can't use is still listed (rendered locked), but `allowed` is decided HERE,
 * from the same Roles & Permissions check the target page's API enforces.
 */
const QUICK_ACTIONS = Object.freeze([
    { key: 'new-admission', module: 'student', action: 'edit' },
    { key: 'collect-fee', module: 'fees-collect', action: 'edit' },
    { key: 'apply-leave', module: 'leave', action: 'edit' },
    { key: 'issue-tc', module: 'tc-generate', action: 'edit' },
    { key: 'generate-marksheet', module: 'marksheet', action: 'view' },
]);

/** Pending-approval row → whether THIS viewer may approve/reject it from the dashboard. */
const canActOn = (allows, permissions, sourcePermission) =>
    Boolean(sourcePermission) && allows(permissions, 'approvals-action', 'edit') && allows(permissions, sourcePermission, 'edit');

module.exports = {
    WEEKDAY_SHORT,
    addDays,
    attendanceDayPct,
    buildWeekBars,
    weekStartKey,
    feeDonut,
    monthBounds,
    monthOf,
    holidayDaysInMonth,
    QUICK_ACTIONS,
    canActOn,
};
