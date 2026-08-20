'use strict';
const { DateTime } = require('luxon');

// Three clocks collide in attendance and getting them into ONE frame is the whole job of
// this file:
//   - punchTime  : a real timestamp from WDMS, delivered as a NAIVE local string
//                  ("2026-08-16 09:07:23") with no offset
//   - workStart / shift.startTime : wall-clock "HH:mm" strings
//   - date-only.js : calendar days pinned to UTC midnight
//
// The frame we force everything into is "school wall clock expressed as UTC". That makes
// toDateKey(punchTime) the correct school-day key with zero conversion, and lets a
// UTC-midnight date + "HH:mm" be compared against a punch by plain epoch arithmetic.
//
// NEVER call `new Date(someWdmsString)` on punch data. That parses in the SERVER's
// timezone — IST on a dev laptop, UTC in a container, 5h30m apart — which silently turns
// every punctual 09:00 arrival into a HalfDay and pushes early punches onto the previous
// calendar date. Use parseWdmsPunchTime() instead; it reads the digits explicitly.

const MIN_MS = 60 * 1000;
const SCHOOL_TZ = process.env.SCHOOL_TIMEZONE || 'Asia/Kolkata';

// "HH:mm" -> minutes since wall-clock midnight, or null when unparseable.
const parseHhMm = (value) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec((value || '').toString().trim());
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
};

// UTC-midnight Date (from date-only.toUtcMidnight) + "HH:mm" -> an instant in the same
// frame punchTime is stored in. Pure epoch-ms arithmetic — no timezone parsing anywhere.
const atWallClock = (utcMidnightDate, hhmm) => {
    const minutes = parseHhMm(hhmm);
    if (minutes === null || !utcMidnightDate) return null;
    return new Date(utcMidnightDate.getTime() + minutes * MIN_MS);
};

// Matches a trailing UTC offset: "Z", "+05:30", "-0800". Anchored to the end of the string
// so it cannot be confused with the date's own hyphens.
const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

// The only safe way to read a WDMS punch timestamp. Handles BOTH shapes an iclock instance
// can emit, and normalises each into the one frame this file exists to enforce — school wall
// clock expressed as UTC:
//
//   1. NAIVE  "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DDTHH:mm:ss"  (what our WDMS sends today)
//      The digits ARE the school's wall clock, because the terminal is configured to the
//      school's own timezone and WDMS stores what the terminal reported. So they are read
//      verbatim — no conversion, because there is no offset to convert FROM. Applying one
//      here would shift every punch by SCHOOL_TIMEZONE's offset and mark punctual arrivals
//      as HalfDay.
//
//   2. OFFSET-BEARING  "...T09:18:44Z" / "...+05:30" / "...-0800"
//      This is a true instant, NOT a wall clock, and the old parser silently dropped the
//      suffix — storing 09:18 as if it were 09:18 local when it actually meant 14:48 IST.
//      Every punch would land ~5h30m early against workStart and the whole school would
//      read Present. So the instant is converted into SCHOOL_TIMEZONE first, and only the
//      resulting local wall-clock fields are kept.
//
// Which shape arrives is a property of the WDMS deployment, not of our code, so both are
// accepted rather than assumed.
const parseWdmsPunchTime = (value) => {
    if (!value) return null;
    const raw = value.toString().trim();

    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
    if (!m) return null;

    if (OFFSET_SUFFIX.test(raw)) {
        // setZone:true keeps the offset the string carried instead of reinterpreting it in
        // the server's timezone; .setZone(SCHOOL_TZ) then re-expresses that same instant as
        // the school's local time, and DST/offset history comes from luxon's tz database
        // rather than a hardcoded +5:30.
        const local = DateTime.fromISO(raw.replace(' ', 'T'), { setZone: true }).setZone(SCHOOL_TZ);
        if (!local.isValid) return null;
        return new Date(Date.UTC(
            local.year, local.month - 1, local.day,
            local.hour, local.minute, local.second,
        ));
    }

    return new Date(Date.UTC(
        Number(m[1]), Number(m[2]) - 1, Number(m[3]),
        Number(m[4]), Number(m[5]), Number(m[6] || 0),
    ));
};

// "Now", in the school's wall clock, expressed as UTC — i.e. the same frame as a stored
// punchTime. A bare Date.now() is a true UTC instant and is NOT comparable to punch data.
const nowWallClock = () => {
    const now = DateTime.now().setZone(SCHOOL_TZ);
    return new Date(Date.UTC(now.year, now.month - 1, now.day, now.hour, now.minute, now.second));
};

// Signed minutes from `b` to `a` — negative means `a` is earlier (an early arrival).
const minutesBetween = (a, b) => Math.round((a.getTime() - b.getTime()) / MIN_MS);

module.exports = {
    parseHhMm,
    atWallClock,
    parseWdmsPunchTime,
    nowWallClock,
    minutesBetween,
    SCHOOL_TZ,
};
