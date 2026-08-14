'use strict';

// Roster/attendance dates are calendar days, not instants. The frontend always sends a
// "YYYY-MM-DD" string built from the datepicker's LOCAL date parts; these build/read the
// matching UTC-midnight Date so a lookup can never drift a day across timezones.

const toUtcMidnight = (value) => {
    if (!value) return null;

    if (value instanceof Date) {
        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }

    // "YYYY-MM-DD" (anything after the date part, e.g. a full ISO string, is ignored)
    const dateKey = value.toString().trim().slice(0, 10);
    const parts = dateKey.split('-');
    if (parts.length !== 3) return null;

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!year || !month || !day) return null;

    return new Date(Date.UTC(year, month - 1, day));
};

const toDateKey = (date) => {
    if (!date) return '';
    const d = (date instanceof Date) ? date : new Date(date);
    const month = `${d.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${d.getUTCDate()}`.padStart(2, '0');
    return `${d.getUTCFullYear()}-${month}-${day}`;
};

// Parses a Date or "YYYY-MM-DD" straight to { year, month (1-12), day, dateKey }, or null.
// Shared by anything reading/writing the monthly-snapshot Roster shape (models/roster.js:
// one doc per adminId+personType+personId+year+month, days: Map<"YYYY-MM-DD", shiftId>) —
// controllers/roster.js and services/roster-lookup.js both key their queries off this.
// NOTE: month is 1-12 here (August = 8), NOT JS's 0-11.
const parseDateKey = (value) => {
    if (!value) return null;
    const dateKey = value instanceof Date ? toDateKey(value) : value.toString().trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day, dateKey };
};

// Expands a date range into UTC-midnight Dates. `weekdays` is an optional array of 0-6
// (Sun-Sat) — when present only those days are emitted, which is what makes
// "Morning shift, Mon-Sat, all of August" a single bulk call.
const eachDateInRange = (fromKey, toKey, weekdays) => {
    const start = toUtcMidnight(fromKey);
    const end = toUtcMidnight(toKey);
    if (!start || !end || start > end) return [];

    const filterDays = Array.isArray(weekdays) && weekdays.length > 0 ? weekdays.map(Number) : null;
    const dates = [];
    let cursor = start;
    while (cursor <= end) {
        if (!filterDays || filterDays.includes(cursor.getUTCDay())) {
            dates.push(cursor);
        }
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    return dates;
};

module.exports = { toUtcMidnight, toDateKey, parseDateKey, eachDateInRange };
