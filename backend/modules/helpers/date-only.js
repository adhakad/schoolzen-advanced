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

module.exports = { toUtcMidnight, toDateKey, eachDateInRange };
