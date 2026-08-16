'use strict';
const { atWallClock, minutesBetween } = require('../helpers/attendance-time');
const logger = require('../helpers/logger');

// PURE status computation — no DB, no Express, no I/O. Everything it needs is passed in,
// which is what makes the late/half-day banding testable in isolation and keeps the
// reconcile worker to orchestration only.

const DEFAULT_LATE_AFTER = 15;
const DEFAULT_HALF_DAY_AFTER = 120;

/**
 * @param {Object}   args
 * @param {Date}     args.date        UTC-midnight calendar day
 * @param {Array}    args.punches     [{ punchTime: Date }, ...] for this person on this date
 * @param {Object}   args.rule        AttendanceRule for the school (may be null)
 * @param {Object}   args.shift       Roster-resolved Shift, or null to fall back to the rule
 * @param {String}   args.personType  'student' | 'teacher' | 'staff'
 * @param {String}   args.adminId     for log context only
 * @returns {Object|null} null when there are no punches — the caller writes NO row and the
 *                        calendar derives Absent at read time.
 */
const computeStatus = ({ date, punches, rule, shift, personType, adminId }) => {
    if (!Array.isArray(punches) || punches.length === 0) return null;

    // Students are never rostered (models/roster.js enums personType to staff|teacher), so
    // a student's status comes from the school-wide AttendanceRule ONLY. Enforced here
    // rather than trusting every call site to have filtered correctly.
    const effectiveShift = personType === 'student' ? null : (shift || null);

    // Sort once; firstIn/lastOut/punchCount all fall out of the ordering.
    const sorted = [...punches].sort((a, b) => a.punchTime - b.punchTime);
    const punchCount = sorted.length;
    const firstIn = sorted[0].punchTime;
    // A lone punch is an arrival, not a departure — pairing it with itself would render a
    // zero-minute working day.
    const lastOut = punchCount > 1 ? sorted[punchCount - 1].punchTime : null;

    const shiftId = effectiveShift ? effectiveShift._id.toString() : null;
    const expectedStart = effectiveShift ? effectiveShift.startTime : (rule ? rule.workStart : null);

    const base = {
        firstIn,
        lastOut,
        punchCount,
        shiftId,
        expectedStart: expectedStart || null,
    };

    // No baseline to measure against — the person demonstrably showed up, so record
    // Present rather than inventing a Late they can't be judged against.
    if (!expectedStart) {
        logger.warn('attendance-status.noBaseline', { adminId, personType, date });
        return { ...base, status: 'Present', lateByMinutes: null };
    }

    // Grace: a rostered shift's own graceMinutes wins over the school-wide lateAfter (per
    // the contract stated in models/shift.js). `!= null` not truthiness — graceMinutes: 0
    // means "no grace at all" and must not silently fall through to the rule.
    const lateAfter = (effectiveShift && effectiveShift.graceMinutes != null)
        ? effectiveShift.graceMinutes
        : (rule ? rule.lateAfter : DEFAULT_LATE_AFTER);

    // halfDayAfter ALWAYS comes from the school rule — Shift has no equivalent field. The
    // shift narrows *when the day starts*; the school rule decides *how late is half a day*.
    let halfDayAfter = rule ? rule.halfDayAfter : DEFAULT_HALF_DAY_AFTER;
    if (halfDayAfter <= lateAfter) {
        // A misconfigured school (e.g. halfDayAfter 10 against a 15-min shift grace) would
        // otherwise mark punctual people HalfDay. Clamp to an empty Late band instead.
        logger.warn('attendance-status.halfDayAfterTooSmall', { adminId, halfDayAfter, lateAfter });
        halfDayAfter = lateAfter + 1;
    }

    const expected = atWallClock(date, expectedStart);
    const lateByMinutes = minutesBetween(firstIn, expected);

    let status;
    if (lateByMinutes <= lateAfter) status = 'Present';
    else if (lateByMinutes <= halfDayAfter) status = 'Late';
    else status = 'HalfDay';

    // Overnight shifts are out of scope: when endTime < startTime the after-midnight
    // punches belong to the previous attendance day, but reconcile groups by each punch's
    // own dateKey. Surface it rather than being silently wrong.
    if (effectiveShift && effectiveShift.endTime && effectiveShift.endTime < effectiveShift.startTime) {
        logger.warn('attendance-status.overnightShift', { adminId, shiftId, date });
    }

    return { ...base, status, lateByMinutes };
};

// Single ordered resolver so override precedence lives in exactly one place.
// Order: manual (isOverridden) > Holiday > Leave > computed.
// Manual sits on top because "a manual override must never be clobbered by a later
// reconcile" is absolute — if Holiday outranked it, an admin could never record the
// teacher who came in for exam duty on a declared holiday. Holiday outranks Leave so
// nobody burns leave balance on a day the school was shut.
// Punch facts (firstIn/lastOut/punchCount) survive on Holiday and Leave rows.
const resolveStatus = ({ holiday, leave, computed }) => {
    if (!computed) return null;
    if (holiday) return { ...computed, status: 'Holiday', holidayId: holiday._id.toString() };
    if (leave) return { ...computed, status: 'Leave', leaveRequestId: leave._id.toString() };
    return computed;
};

module.exports = { computeStatus, resolveStatus };
