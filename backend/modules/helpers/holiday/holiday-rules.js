'use strict';
const { toUtcMidnight, toDateKey } = require('../date-only');

// The Holiday module's pure rules — no DB, so scripts/test-holiday-v2.js checks them directly.

const DAY_MS = 86400000;
const MAX_HOLIDAY_DAYS = 31;
const MAX_SPAN_DAYS = 400;

/** Inclusive day count of a "YYYY-MM-DD" range, or 0 when missing/reversed. */
const holidayDays = (startKey, endKey) => {
    const start = toUtcMidnight(startKey);
    const end = toUtcMidnight(endKey);
    if (!start || !end || start > end) return 0;
    return Math.round((end - start) / DAY_MS) + 1;
};

/** Every "YYYY-MM-DD" inside from..to covered by one of the holiday `ranges` ({ startDateKey, endDateKey }). */
const holidayKeysFor = (ranges, fromKey, toKey) => {
    const keys = new Set();
    if (!fromKey || !toKey || fromKey > toKey) return keys;
    (ranges || []).forEach((range) => {
        const start = range.startDateKey > fromKey ? range.startDateKey : fromKey;
        const end = range.endDateKey < toKey ? range.endDateKey : toKey;
        if (start > end) return;
        let count = 0;
        for (let day = toUtcMidnight(start); day <= toUtcMidnight(end) && count < MAX_SPAN_DAYS; day = new Date(day.getTime() + DAY_MS), count += 1) {
            keys.add(toDateKey(day));
        }
    });
    return keys;
};

/**
 * Assign is for never-assigned people, Edit for already-assigned ones (holiday/assign.md):
 * 'assign' | 'edit' | 'mixed' | 'empty' for rows carrying `templateId` (null = not set).
 */
const classifySelection = (rows) => {
    if (!rows.length) return 'empty';
    const assigned = rows.filter((row) => Boolean(row.templateId)).length;
    if (assigned === 0) return 'assign';
    if (assigned === rows.length) return 'edit';
    return 'mixed';
};

const dedupeKey = (name, startDateKey) => `${String(name).trim().toLowerCase()}|${startDateKey}`;

/**
 * Public-holiday entries not already declared (same name, case-insensitive, same start) and
 * not repeated within the dataset itself. Returns { fresh, skipped }.
 */
const dedupePublic = (existing, incoming) => {
    const seen = new Set(existing.map((row) => dedupeKey(row.name, row.startDateKey)));
    const fresh = [];
    let skipped = 0;
    incoming.forEach((entry) => {
        const key = dedupeKey(entry.name, entry.date);
        if (seen.has(key)) { skipped += 1; return; }
        seen.add(key);
        fresh.push({ name: String(entry.name).trim(), startDateKey: entry.date, endDateKey: entry.date });
    });
    return { fresh, skipped };
};

/** True when a holiday range touches `dateKey`. */
const coversDay = (range, dateKey) => Boolean(range) && range.startDateKey <= dateKey && range.endDateKey >= dateKey;

module.exports = { MAX_HOLIDAY_DAYS, holidayDays, holidayKeysFor, classifySelection, dedupePublic, coversDay };
