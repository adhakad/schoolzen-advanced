'use strict';
const RosterV2Model = require('../../models/attendance/roster');
const LeaveRequestV2Model = require('../../models/leave/leave-request');
const { getHolidayKeysForPeople } = require('../holiday/holiday-calendar');
const { DAY_TYPE, resolveDayType, eachKey, monthsOf } = require('../../helpers/calendar/working-day-rules');

// THE working-day resolver. Attendance Overview, the reconcile worker and Leave (apply,
// day preview, approve) all ask this one service what each person's day is — so a day can
// never be "off" in one module and "working" in another. The rule itself is
// helpers/calendar/working-day-rules.js; this file only gathers its three inputs.
//
// Batched: any headcount over any range is one holiday lookup (cached per template), one
// Roster scan and one LeaveRequest scan — never a query per person or per day.

const personKey = (personType, personId) => `${personType}|${personId}`;

/** Map<staffId, { [dateKey]: shiftId|'WO' }> for the months the range touches. */
const loadRosterCells = async (adminId, staffIds, fromKey, toKey) => {
    const cells = new Map();
    if (!staffIds.length) return cells;
    const months = monthsOf(fromKey, toKey);
    // One day (the reconcile worker, a whole school): read just that cell.
    const projection = fromKey === toKey ? { staffId: 1, [`days.${fromKey}`]: 1 } : { staffId: 1, days: 1 };
    // batchSize: one doc per person — past 101 people the default first batch would cost a getMore.
    const docs = await RosterV2Model.find({ adminId, staffId: { $in: staffIds }, $or: months }, projection).batchSize(100000).lean();
    docs.forEach((doc) => cells.set(doc.staffId, { ...(cells.get(doc.staffId) || {}), ...(doc.days || {}) }));
    return cells;
};

/**
 * Map<"type|id", Map<dateKey, leaveTypeId>> — the days each person's approved leaves were
 * charged for, and under which leave type (Payroll reads the type's isPaid).
 */
const loadLeaveDays = async (adminId, people, fromKey, toKey) => {
    const days = new Map();
    if (!people.length) return days;
    const rows = await LeaveRequestV2Model.find(
        { adminId, status: 'Approved', personId: { $in: people.map((p) => String(p.personId)) }, fromDateKey: { $lte: toKey }, toDateKey: { $gte: fromKey } },
        { personType: 1, personId: 1, leaveTypeId: 1, dateKeys: 1, attendanceDateKeys: 1 }
    ).batchSize(100000).lean();
    rows.forEach((row) => {
        const key = personKey(row.personType, row.personId);
        if (!days.has(key)) days.set(key, new Map());
        // Requests approved before `dateKeys` existed only recorded the marks they wrote.
        ((row.dateKeys && row.dateKeys.length) ? row.dateKeys : row.attendanceDateKeys || [])
            .forEach((day) => days.get(key).set(day, row.leaveTypeId));
    });
    return days;
};

/** Map<"type|id", Set<dateKey>> — loadLeaveDays without the leave type. */
const loadLeaveKeys = async (adminId, people, fromKey, toKey) => {
    const keys = new Map();
    (await loadLeaveDays(adminId, people, fromKey, toKey)).forEach((byDay, key) => keys.set(key, new Set(byDay.keys())));
    return keys;
};

/**
 * Map<"type|id", Map<dateKey, DAY_TYPE>> for every person and every day in from..to.
 * @param {{ sessionId?: String, people: Array<{ personType, personId }>, fromKey: String, toKey: String, includeLeave?: Boolean }} opts
 *   sessionId resolves students' templates (their enrollment). includeLeave:false answers
 *   "what would this day be without any approved leave" — what a NEW leave is charged on.
 */
// `rosterCells` lets a caller that already read the Roster for the range (Overview's grid)
// hand it in instead of paying for the same scan twice.
// `assignedTemplates` likewise skips the holiday-template re-read; `rosterCells` may be a
// promise, so the caller's own roster read still runs in this same parallel stage.
const resolveDays = async (adminId, { sessionId = null, people, fromKey, toKey, includeLeave = true, rosterCells = null, assignedTemplates = null }) => {
    const result = new Map();
    const days = eachKey(fromKey, toKey);
    if (!people.length || !days.length) return result;
    const staffIds = people.filter((p) => p.personType === 'staff').map((p) => String(p.personId));
    const [holidays, roster, leave] = await Promise.all([
        getHolidayKeysForPeople(adminId, sessionId, people, fromKey, toKey, assignedTemplates),
        rosterCells || loadRosterCells(adminId, staffIds, fromKey, toKey),
        includeLeave ? loadLeaveKeys(adminId, people, fromKey, toKey) : new Map(),
    ]);
    people.forEach((p) => {
        const key = personKey(p.personType, p.personId);
        const holidayKeys = holidays.get(key) || new Set();
        const leaveKeys = leave.get(key) || new Set();
        const cells = p.personType === 'staff' ? roster.get(String(p.personId)) || {} : {};
        result.set(key, new Map(days.map((dateKey) => [dateKey, resolveDayType({
            dateKey, holiday: holidayKeys.has(dateKey), leave: leaveKeys.has(dateKey), rosterValue: cells[dateKey],
        })])));
    });
    return result;
};

/** One person's working days in from..to — what a leave is charged for. */
const workingDayKeys = async (adminId, { sessionId, personType, personId, fromKey, toKey, includeLeave = true }) => {
    const days = (await resolveDays(adminId, { sessionId, people: [{ personType, personId }], fromKey, toKey, includeLeave }))
        .get(personKey(personType, personId));
    return days ? [...days].filter(([, type]) => type === DAY_TYPE.WORKING).map(([dateKey]) => dateKey) : [];
};

module.exports = { DAY_TYPE, personKey, resolveDays, workingDayKeys, loadLeaveDays, loadRosterCells };
