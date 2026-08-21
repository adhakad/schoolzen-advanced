'use strict';
const { atWallClock, minutesBetween } = require('../helpers/attendance-time');
const logger = require('../helpers/logger');

// PURE status computation — no DB, no Express, no I/O. Everything it needs is passed in,
// which is what makes the banding testable in isolation and keeps the reconcile worker to
// orchestration only.
//
// THE SHIFT IS THE ONLY SOURCE OF TIMING. There is no school-wide fallback rule any more:
// staff and teachers get their shift from Roster, students from ClassShift, and a person
// with neither produces no row at all. That is deliberate — a fallback baseline is how you
// end up silently recording a whole school as Present against a default nobody configured.
//
// Two windows per shift, and a punch outside BOTH is ignored entirely:
//
//   startTime                                        endTime
//      |                                                |
//   [--+---------- ARRIVAL ----------)[---- DEPARTURE --+----]
//   ^                                ^                       ^
//   startTime                    endTime                 endTime
//   - earlyPunchMinutes          - earlyCheckoutMinutes  + lateCheckoutMinutes
//
// The arrival window is HALF-OPEN and ends exactly where the departure window begins, so a
// single punch can never be counted as both an arrival and a departure. That is also why
// there is no "only one punch today" special case: firstIn and lastOut are structurally
// incapable of being the same row.

const MS_PER_MINUTE = 60 * 1000;

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * MS_PER_MINUTE);

// Shift fields are `required` with defaults on the model, but a document written before
// those fields existed has none of them. Falling back to the model defaults keeps an old
// shift working instead of producing NaN windows that silently match no punches.
const SHIFT_DEFAULTS = {
    earlyPunchMinutes: 30,
    graceMinutes: 10,
    halfDayAfterMinutes: 120,
    earlyCheckoutMinutes: 30,
    lateCheckoutMinutes: 60,
};

const minutesOf = (shift, field) => {
    const value = Number(shift[field]);
    return Number.isFinite(value) ? value : SHIFT_DEFAULTS[field];
};

/**
 * Turn a Shift plus a calendar day into the two absolute time windows a punch is matched
 * against. Computed ONCE per shift per job, not once per person — a 500-pupil class on one
 * shift shares one set of windows.
 *
 * Everything stays in the "school wall clock expressed as UTC" frame that
 * helpers/attendance-time.js enforces, so these are directly comparable with a stored
 * punchTime by plain epoch arithmetic.
 *
 * @param {Object} args
 * @param {Date}   args.date  UTC-midnight calendar day
 * @param {Object} args.shift lean Shift document
 * @param {String} args.adminId for log context only
 * @returns {Object|null} { shiftId, expectedStart, shiftStart, inFrom, inTo, outFrom, outTo,
 *                          graceMinutes, halfDayAfterMinutes } — null if the shift's
 *                          startTime/endTime cannot be parsed.
 */
const buildShiftWindows = ({ date, shift, adminId }) => {
    if (!shift || !date) return null;

    const shiftStart = atWallClock(date, shift.startTime);
    const shiftEnd = atWallClock(date, shift.endTime);
    if (!shiftStart || !shiftEnd) {
        logger.warn('attendance-status.unparseableShiftTimes', {
            adminId, shiftId: shift._id, startTime: shift.startTime, endTime: shift.endTime,
        });
        return null;
    }

    const earlyPunchMinutes = minutesOf(shift, 'earlyPunchMinutes');
    const graceMinutes = minutesOf(shift, 'graceMinutes');
    const earlyCheckoutMinutes = minutesOf(shift, 'earlyCheckoutMinutes');
    const lateCheckoutMinutes = minutesOf(shift, 'lateCheckoutMinutes');

    let halfDayAfterMinutes = minutesOf(shift, 'halfDayAfterMinutes');
    if (halfDayAfterMinutes <= graceMinutes) {
        // A misconfigured shift (halfDayAfter 10 against a 15-minute grace) would otherwise
        // mark punctual people HalfDay. Clamp to an empty Late band instead.
        logger.warn('attendance-status.halfDayAfterTooSmall', {
            adminId, shiftId: shift._id, halfDayAfterMinutes, graceMinutes,
        });
        halfDayAfterMinutes = graceMinutes + 1;
    }

    const inFrom = addMinutes(shiftStart, -earlyPunchMinutes);
    let inTo = addMinutes(shiftEnd, -earlyCheckoutMinutes);
    let outFrom = inTo;
    let outTo = addMinutes(shiftEnd, lateCheckoutMinutes);

    if (inTo <= inFrom) {
        // Either an overnight shift (endTime < startTime, out of scope — punches after
        // midnight belong to the previous attendance day but reconcile groups by each
        // punch's own dateKey), or a very short shift whose checkout window opens before
        // anyone could arrive. Either way the arrival window has collapsed to nothing and
        // EVERY punch would be discarded. Fall back to the half-day boundary so the day is
        // still assessable, and say so.
        logger.warn('attendance-status.collapsedArrivalWindow', {
            adminId, shiftId: shift._id, startTime: shift.startTime, endTime: shift.endTime,
        });
        inTo = addMinutes(shiftStart, halfDayAfterMinutes);
        outFrom = inTo;
        if (outTo < outFrom) outTo = outFrom;
    }

    return {
        shiftId: shift._id.toString(),
        expectedStart: shift.startTime,
        shiftStart,
        inFrom,
        inTo,     // exclusive
        outFrom,  // inclusive
        outTo,    // inclusive
        graceMinutes,
        halfDayAfterMinutes,
    };
};

/**
 * One person's day, from their windowed punches.
 *
 * STUDENTS ARE BANDED DIFFERENTLY, and deliberately so. A school records that a child
 * turned up and whether they were late; it does not clock them out, and "half a day of
 * school" is not a thing anybody acts on. So for personType 'student':
 *   - the ARRIVAL punch is the entire decision — Present or Late, never HalfDay
 *   - lastOut is always null (services/punch-ingest.js does not even store an out-punch
 *     for a student, so there would be nothing to report anyway)
 *   - halfDayAfterMinutes / earlyCheckoutMinutes / lateCheckoutMinutes are never read
 *
 * Those three fields stay on the Shift model for staff and teachers. Note that the
 * DEPARTURE window is still BUILT for a student's shift — it is what closes the arrival
 * window at endTime - earlyCheckoutMinutes — it just never produces a value.
 *
 * @param {Object} args
 * @param {String} args.personType 'student' | 'teacher' | 'staff'
 * @param {Date}   args.firstIn    earliest punch inside the ARRIVAL window, or null
 * @param {Date}   args.lastOut    latest punch inside the DEPARTURE window, or null
 * @param {Number} args.punchCount every punch that day, in-window or not — the audit count
 *                                 behind the calendar cell, not an input to the status
 * @param {Object} args.windows    from buildShiftWindows()
 * @returns {Object|null} null when there is no in-window arrival: the caller writes NO row
 *                        and the calendar derives Absent at read time.
 */
const computeStatus = ({ personType, firstIn, lastOut, punchCount, windows }) => {
    // No arrival inside the window means the person is Absent, even if they punched — a
    // departure-only or wildly-out-of-hours punch is not evidence they worked the shift.
    if (!firstIn || !windows) return null;

    // The whole decision, in one comparison against one number: how many minutes after the
    // shift's own start time their first accepted punch landed. Negative = arrived early.
    const lateByMinutes = minutesBetween(firstIn, windows.shiftStart);
    const isStudent = personType === 'student';

    let status;
    if (lateByMinutes <= windows.graceMinutes) status = 'Present';
    else if (isStudent) status = 'Late';
    else if (lateByMinutes <= windows.halfDayAfterMinutes) status = 'Late';
    else status = 'HalfDay';

    return {
        status,
        firstIn,
        // null for every student, and for anyone who did not punch inside the departure
        // window.
        lastOut: isStudent ? null : (lastOut || null),
        punchCount,
        lateByMinutes,
        shiftId: windows.shiftId,
        expectedStart: windows.expectedStart,
    };
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

module.exports = { buildShiftWindows, computeStatus, resolveStatus };
