'use strict';

// STUB — the real Holiday model arrives in Phase 9 (HolidayTemplate + per-school Holiday
// calendar). The reconcile worker and the calendar reader both call this from day one, so
// Phase 9 only has to swap the internals here: no change to the status pipeline, no change
// to any caller.
//
// Shape mirrors roster-lookup.js deliberately: Express-unaware, called in-process, and
// batched per (school, month) rather than per day so a month render is one query.

/**
 * Holidays for one school in one month.
 * @param {String} adminId
 * @param {Number} year
 * @param {Number} month  1-12 (August = 8), matching helpers/date-only.js parseDateKey
 * @returns {Promise<Map<String, Object>>} "YYYY-MM-DD" -> Holiday doc. Empty until Phase 9.
 */
const getHolidayMapForMonth = async (adminId, year, month) => {
    return new Map();
};

/**
 * Convenience single-date form used by the reconcile worker.
 * @returns {Promise<Object|null>} the Holiday doc, or null. Always null until Phase 9.
 */
const getHolidayForDate = async (adminId, date) => {
    return null;
};

module.exports = { getHolidayMapForMonth, getHolidayForDate };
