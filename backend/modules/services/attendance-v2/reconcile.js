'use strict';
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const PunchLogV2Model = require('../../models/attendance/punch-log');
const StaffV2Model = require('../../models/staff/staff');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { getActiveSession } = require('../../helpers/academic-session/session-resolver');
const { toUtcMidnight, toDateKey } = require('../../helpers/date-only');
const { nowWallClock } = require('../../helpers/attendance-time');
const { computeDayStatus } = require('../../helpers/attendance/status');
const { WEEK_OFF, shiftIndex, getStaffShiftIdsForDate, loadClassShiftResolver } = require('./shift-lookup');
const { DAY_TYPE, personKey, resolveDays } = require('../calendar/working-day');
const liveStats = require('./live-stats');
const { publishReconciled } = require('./publisher');
const logger = require('../../helpers/logger');

// THE SLOW PATH (attendance-overview.md): fold one school-day's PunchLog rows into
// AttendanceRecord — one document per person per day — computing each status against the
// person's expected Shift. Allowed to lag the fast path; the grid shows "live" meanwhile.
//
// Re-runnable by construction: every write is an upsert on the record's unique key, so a
// retried or duplicate job converges on the same rows. Leave marks (isOverridden) are never
// touched. A manual Present/Late mark (source 'manual') is kept while the person has no
// device punch that day — and replaced the moment one arrives: a device punch always wins.

const WRITE_CHUNK = 1000;

const groupPunches = (logs) => {
    const byPerson = new Map();
    logs.forEach((log) => {
        const key = `${log.personType}|${log.personId}`;
        if (!byPerson.has(key)) byPerson.set(key, { personType: log.personType, personId: log.personId, times: [] });
        byPerson.get(key).times.push(log.punchTime);
    });
    return byPerson;
};

/**
 * Everyone EXPECTED on a completed day, so a no-show becomes an Absent row. Only once the
 * day is over — today's absentees are not absent yet.
 */
const expectedPeople = async (adminId, dateKey, sessionId) => {
    const [staff, enrollments, resolve] = await Promise.all([
        StaffV2Model.find({ adminId, status: 'active' }, { _id: 1 }).lean(),
        sessionId
            ? StudentEnrollmentModel.find({ adminId, sessionId }, { studentId: 1, classId: 1, streamId: 1, sectionId: 1 }).lean()
            : [],
        loadClassShiftResolver(adminId, sessionId),
    ]);
    const staffIds = staff.map((row) => String(row._id));
    const staffShifts = await getStaffShiftIdsForDate(adminId, dateKey, staffIds);
    const people = [];
    staffShifts.forEach((shiftId, staffId) => people.push({ personType: 'staff', personId: staffId, shiftId }));
    enrollments.forEach((row) => {
        const shiftId = resolve(row);
        if (shiftId) people.push({ personType: 'student', personId: String(row.studentId), shiftId });
    });
    return people;
};

const reconcileDay = async (adminId, dateKey) => {
    const date = toUtcMidnight(dateKey);
    if (!date) return { dateKey, written: 0 };
    const today = toDateKey(nowWallClock());
    const dayComplete = dateKey < today;

    const [logs, overridden, session, shifts] = await Promise.all([
        PunchLogV2Model.find({ adminId, dateKey }, { personType: 1, personId: 1, punchTime: 1, reconciled: 1 }).lean(),
        AttendanceRecordV2Model.find(
            { adminId, date, deletedAt: null, $or: [{ isOverridden: true }, { source: 'manual' }] },
            { personType: 1, personId: 1, isOverridden: 1, source: 1 }
        ).lean(),
        getActiveSession(adminId),
        shiftIndex(adminId),
    ]);
    const skip = new Set(overridden.filter((row) => row.isOverridden).map((row) => `${row.personType}|${row.personId}`));
    // Marked by hand and no punch: keep the mark (never turned into an end-of-day Absent).
    const manual = new Set(overridden.filter((row) => !row.isOverridden && row.source === 'manual').map((row) => `${row.personType}|${row.personId}`));
    const sessionId = session ? session._id : null;
    const punched = groupPunches(logs);

    // Expected shift per person who punched.
    const staffIds = [...punched.values()].filter((p) => p.personType === 'staff').map((p) => p.personId);
    const studentIds = [...punched.values()].filter((p) => p.personType === 'student').map((p) => p.personId);
    const [staffShifts, studentEnrollments, resolve] = await Promise.all([
        getStaffShiftIdsForDate(adminId, dateKey, staffIds),
        sessionId && studentIds.length
            ? StudentEnrollmentModel.find({ adminId, sessionId, studentId: { $in: studentIds } }, { studentId: 1, classId: 1, streamId: 1, sectionId: 1 }).lean()
            : [],
        loadClassShiftResolver(adminId, sessionId),
    ]);
    const studentShifts = new Map(studentEnrollments.map((row) => [String(row.studentId), resolve(row)]));

    // Who is decided today: everyone who punched, plus — once the day is over — everyone
    // expected on a shift, so a no-show becomes an Absent row.
    const expected = dayComplete
        ? (await expectedPeople(adminId, dateKey, sessionId)).filter((person) => {
            const key = personKey(person.personType, person.personId);
            return !punched.has(key) && !manual.has(key);
        })
        : [];
    const people = [...punched.values()].map((p) => ({ personType: p.personType, personId: p.personId }))
        .concat(expected.map((p) => ({ personType: p.personType, personId: p.personId })))
        .filter((p) => !skip.has(personKey(p.personType, p.personId)));
    // The shared working-day resolver decides Holiday > Leave > WeeklyOff before any punch is
    // measured — the same answer Overview and Leave get.
    const dayTypes = await resolveDays(adminId, { sessionId, people, fromKey: dateKey, toKey: dateKey });
    const dayTypeOf = (key) => (dayTypes.get(key) && dayTypes.get(key).get(dateKey)) || DAY_TYPE.WORKING;

    const entries = [];
    punched.forEach((person, key) => {
        if (skip.has(key)) return;
        const rostered = person.personType === 'staff' ? staffShifts.get(person.personId) : studentShifts.get(person.personId);
        const shiftId = rostered && rostered !== WEEK_OFF ? rostered : null;
        const result = computeDayStatus({ dateKey, personType: person.personType, shift: shiftId ? shifts.get(shiftId) : null, punchTimes: person.times });
        const dayType = dayTypeOf(key);
        if (dayType !== DAY_TYPE.WORKING) {
            // Punches on a day off are kept on the row; the day itself stays off.
            entries.push({ personType: person.personType, personId: person.personId, shiftId: null, ...result, status: dayType, source: 'device' });
            return;
        }
        // Before the day is over, "no arrival in the window" is not yet an absence.
        if (!dayComplete && result.status === 'Absent') return;
        entries.push({ personType: person.personType, personId: person.personId, shiftId, ...result, source: 'device' });
    });

    expected.forEach((person) => {
        const key = personKey(person.personType, person.personId);
        if (skip.has(key)) return;
        const dayType = dayTypeOf(key);
        const working = dayType === DAY_TYPE.WORKING;
        entries.push({
            personType: person.personType,
            personId: person.personId,
            shiftId: working ? person.shiftId : null,
            status: working ? 'Absent' : dayType,
            inTime: null,
            outTime: null,
            punches: [],
            source: 'system',
        });
    });

    const now = new Date();
    for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
        const ops = entries.slice(i, i + WRITE_CHUNK).map((entry) => ({
            updateOne: {
                filter: { adminId, personType: entry.personType, personId: entry.personId, date },
                update: {
                    $set: {
                        dateKey,
                        status: entry.status,
                        inTime: entry.inTime,
                        outTime: entry.outTime,
                        punches: entry.punches,
                        shiftId: entry.shiftId,
                        source: entry.source,
                        deletedAt: null,
                        updatedBy: 'reconcile',
                        updatedAt: now,
                    },
                    $setOnInsert: { createdAt: now, isOverridden: false },
                },
                upsert: true,
            },
        }));
        await AttendanceRecordV2Model.bulkWrite(ops, { ordered: false });
    }

    const pendingIds = logs.filter((log) => !log.reconciled).map((log) => log._id);
    if (pendingIds.length) {
        await PunchLogV2Model.updateMany({ adminId, _id: { $in: pendingIds } }, { $set: { reconciled: true } });
    }

    // A reconcile can correct a fast-path guess (on time → Late), so the counts are rebuilt.
    await liveStats.recompute(adminId, dateKey);
    await publishReconciled(adminId, dateKey, entries.map((entry) => entry.personId));
    logger.info('attendance-v2.reconcile.done', { adminId, dateKey, written: entries.length, dayComplete });
    return { dateKey, written: entries.length };
};

module.exports = { reconcileDay };
