'use strict';
const crypto = require('crypto');
const { atWallClock, minutesBetween, parseHhMm } = require('../attendance-time');
const { toUtcMidnight } = require('../date-only');

// Pure attendance rules — no database, so the reconcile worker and the tests share them.
// Every instant here is in the "school wall clock expressed as UTC" frame
// (helpers/attendance-time.js).

/** sha1(adminId|personId|punchTime) — the PunchLog dedup key. Separators stop "1"+"23" == "12"+"3". */
const buildPunchHash = (adminId, personId, punchTime) =>
    crypto.createHash('sha1').update(`${adminId}|${personId}|${new Date(punchTime).toISOString()}`).digest('hex');

/** Sunday is the weekly off until the Holiday module supplies a school's own calendar. */
const isWeeklyOff = (dateKey) => {
    const date = toUtcMidnight(dateKey);
    return Boolean(date) && date.getUTCDay() === 0;
};

/**
 * The day's status from its punches against the expected shift.
 *
 *  - arrival = the first punch inside [start − earlyIn, end]
 *  - no arrival                                → Absent
 *  - late by ≤ grace                           → Present
 *  - staff, late by > halfDayAfter (when set)  → HalfDay
 *  - otherwise                                 → Late
 *  - staff leaving more than earlyOut minutes before end (when set) → HalfDay
 *
 * A student's day is decided by the arrival alone; the staff-only minutes never apply.
 * No shift means nothing to measure against: any punch is Present.
 *
 * @returns {{ status: String, inTime: Date|null, outTime: Date|null, punches: Array }}
 */
const computeDayStatus = ({ dateKey, personType, shift, punchTimes }) => {
    const times = (punchTimes || []).map((time) => new Date(time)).sort((a, b) => a - b);
    const day = toUtcMidnight(dateKey);

    if (!shift) {
        if (!times.length) return { status: 'Absent', inTime: null, outTime: null, punches: [] };
        const out = personType === 'staff' && times.length > 1 ? times[times.length - 1] : null;
        return { status: 'Present', inTime: times[0], outTime: out, punches: toPunches(times[0], out) };
    }

    const start = atWallClock(day, shift.startTime);
    const end = atWallClock(day, shift.endTime);
    const windowOpen = new Date(start.getTime() - (shift.earlyInMinutes || 0) * 60000);
    const arrival = times.find((time) => time >= windowOpen && time <= end) || null;
    if (!arrival) return { status: 'Absent', inTime: null, outTime: null, punches: [] };

    const lateBy = minutesBetween(arrival, start);
    let status = 'Present';
    if (lateBy > (shift.graceMinutes || 0)) {
        status = personType === 'staff' && shift.halfDayAfterMinutes != null && lateBy > shift.halfDayAfterMinutes
            ? 'HalfDay'
            : 'Late';
    }

    let outTime = null;
    if (personType === 'staff') {
        const later = times.filter((time) => time > arrival);
        outTime = later.length ? later[later.length - 1] : null;
        if (outTime && shift.earlyOutMinutes != null && minutesBetween(end, outTime) > shift.earlyOutMinutes) {
            status = 'HalfDay';
        }
    }
    return { status, inTime: arrival, outTime, punches: toPunches(arrival, outTime) };
};

const toPunches = (inTime, outTime) => {
    const punches = [{ time: inTime, type: 'in' }];
    if (outTime) punches.push({ time: outTime, type: 'out' });
    return punches;
};

/** "HH:mm" → "h:mm" for a grid chip (the reference shows 8:23, 9:50). */
const chipTime = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const hours = d.getUTCHours();
    return `${hours % 12 === 0 ? 12 : hours % 12}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/** Short shift code for roster chips — "Morning Shift" → "MS", "Evening" → "E". */
const shiftCode = (name) => {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0][0].toUpperCase();
    const meaningful = words.filter((word) => !/^shift$/i.test(word));
    const source = meaningful.length ? meaningful : words;
    return source.slice(0, 2).map((word) => word[0].toUpperCase()).join('');
};

/** True when start is strictly before end — both "HH:mm". */
const isTimeRangeValid = (startTime, endTime) => {
    const start = parseHhMm(startTime);
    const end = parseHhMm(endTime);
    return start !== null && end !== null && start < end;
};

module.exports = { buildPunchHash, isWeeklyOff, computeDayStatus, chipTime, shiftCode, isTimeRangeValid };
