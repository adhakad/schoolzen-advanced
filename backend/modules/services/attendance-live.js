'use strict';
const PunchLogModel = require('../models/punch-log');
const { getActivePeople, personCode } = require('./person-lookup');
const { toUtcMidnight } = require('../helpers/date-only');

// The live board's INITIAL snapshot. Everything after it arrives over the socket.
//
// This reads PunchLog, not DailyAttendance, and that is the whole point. DailyAttendance is the
// slow path's output: it lags by RECONCILE_DEBOUNCE_MS (3 minutes by default) and it never
// stores 'Absent' at all — absence is derived at read time by attendance-calendar.js. A board
// whose job is "who has walked in so far this morning" has to read the raw punches.

// WHAT "IN" MEANS HERE
// Arrived / not yet arrived — NOT a punch-direction toggle. models/punch-log.js documents that
// these terminals routinely ship with IN/OUT unconfigured and send every punch as state '0',
// which is why punchState is stored for audit but branched on nowhere in the pipeline. So this
// reports the facts the data actually supports: the first punch of the day is the arrival, the
// last is the most recent sighting, and someone with no punches has not arrived yet.

/**
 * One school-day's live arrival board for one person type.
 *
 * Two queries total, regardless of headcount: the roll, and one grouped scan of the day's
 * punches served entirely by PunchLog's { adminId, date, personType, personId } index.
 *
 * @param {Object} params
 * @param {String} params.adminId
 * @param {String} params.personType 'student' | 'teacher' | 'staff'
 * @param {String} params.dateKey    "YYYY-MM-DD"
 * @param {Object} [params.extra]    narrows the roll, e.g. { class: '5' } for students
 * @returns {Promise<Object>} { dateKey, personType, total, arrivedCount, notArrivedCount, people }
 */
const getLiveBoard = async ({ adminId, personType, dateKey, extra = {} }) => {
    const date = toUtcMidnight(dateKey);
    if (!date) return { dateKey, personType, total: 0, arrivedCount: 0, notArrivedCount: 0, people: [] };

    const [people, punchGroups] = await Promise.all([
        getActivePeople(adminId, personType, extra),
        PunchLogModel.aggregate([
            { $match: { adminId, date, personType } },
            {
                $group: {
                    _id: '$personId',
                    firstIn: { $min: '$punchTime' },
                    lastPunch: { $max: '$punchTime' },
                    punchCount: { $sum: 1 },
                },
            },
        ]),
    ]);

    // Indexed by personId so the merge below is O(n) rather than a find() per person — a
    // 2000-student school would otherwise be four million comparisons.
    const punchByPerson = new Map();
    for (const group of punchGroups) punchByPerson.set(String(group._id), group);

    let arrivedCount = 0;

    const rows = people.map((person) => {
        const punches = punchByPerson.get(String(person._id));
        const arrived = !!punches;
        if (arrived) arrivedCount += 1;

        return {
            _id: person._id,
            name: person.name,
            code: personCode(personType, person),
            firstIn: arrived ? punches.firstIn : null,
            // null when there was only ONE punch — a lone punch is an arrival, not a
            // departure, matching how models/daily-attendance.js treats lastOut.
            lastPunch: arrived && punches.punchCount > 1 ? punches.lastPunch : null,
            punchCount: arrived ? punches.punchCount : 0,
            arrived,
        };
    });

    // Arrived first, most recent arrival at the top — the board is read during the morning
    // window, when "who just walked in" is the question being asked.
    rows.sort((a, b) => {
        if (a.arrived !== b.arrived) return a.arrived ? -1 : 1;
        if (a.arrived) return new Date(b.firstIn) - new Date(a.firstIn);
        return `${a.name}`.localeCompare(`${b.name}`);
    });

    return {
        dateKey,
        personType,
        total: rows.length,
        arrivedCount,
        notArrivedCount: rows.length - arrivedCount,
        people: rows,
    };
};

module.exports = { getLiveBoard };
