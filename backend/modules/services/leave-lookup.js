'use strict';

// STUB — the real LeaveType/LeaveRequest models arrive in Phase 8. Same reasoning as
// holiday-lookup.js: reconcile calls this now so Phase 8 is an internals swap, not a
// rewrite of the status pipeline.
//
// Batched by (school, date) for the same reason roster-lookup.js is: reconciliation
// processes a whole school-day at once, and a per-person query would be thousands of
// round-trips per school per day at target scale.

/**
 * Approved leave covering one school-day, keyed the same way roster-lookup.js keys its
 * batch result so the reconcile worker can look both up with one composite key.
 * @param {String} adminId
 * @param {Date|String} date
 * @returns {Promise<Map<String, Object>>} "personType|personId" -> LeaveRequest doc.
 *                                         Empty until Phase 8.
 */
const getApprovedLeavesForDate = async (adminId, date) => {
    return new Map();
};

/**
 * Approved leave for one person across one month, for the calendar read path.
 * @returns {Promise<Map<String, Object>>} "YYYY-MM-DD" -> LeaveRequest. Empty until Phase 8.
 */
const getLeaveMapForMonth = async (adminId, personType, personId, year, month) => {
    return new Map();
};

module.exports = { getApprovedLeavesForDate, getLeaveMapForMonth };
