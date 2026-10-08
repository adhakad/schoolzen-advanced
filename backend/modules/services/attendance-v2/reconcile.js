'use strict';
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const PunchLogV2Model = require('../../models/attendance/punch-log');
const StaffV2Model = require('../../models/staff/staff');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { getActiveSession } = require('../../helpers/academic-session/session-resolver');
const { toUtcMidnight, toDateKey } = require('../../helpers/date-only');
const { nowWallClock } = require('../../helpers/attendance-time');
const { computeDayStatus, isWeeklyOff } = require('../../helpers/attendance/status');
const { WEEK_OFF, shiftIndex, getStaffShiftIdsForDate, loadClassShiftResolver } = require('./shift-lookup');
const liveStats = require('./live-stats');
const { publishReconciled } = require('./publisher');
const logger = require('../../helpers/logger');

// THE SLOW PATH (attendance-overview.md): fold one school-day's PunchLog rows into
// AttendanceRecord — one document per person per day — computing each status against the
// person's expected Shift. Allowed to lag the fast path; the grid shows "live" meanwhile.
//
// Re-runnable by construction: every write is an upsert on the record's unique key, so a
// retried or duplicate job converges on the same rows. Manual corrections (isOverridden)
// are never touched.

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
        AttendanceRecordV2Model.find({ adminId, date, isOverridden: true }, { personType: 1, personId: 1 }).lean(),
        getActiveSession(adminId),
        shiftIndex(adminId),
    ]);
    const skip = new Set(overridden.map((row) => `${row.personType}|${row.personId}`));
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

    const entries = [];
    punched.forEach((person, key) => {
        if (skip.has(key)) return;
        const rostered = person.personType === 'staff' ? staffShifts.get(person.personId) : studentShifts.get(person.personId);
        const shiftId = rostered && rostered !== WEEK_OFF ? rostered : null;
        const result = computeDayStatus({ dateKey, personType: person.personType, shift: shiftId ? shifts.get(shiftId) : null, punchTimes: person.times });
        // Before the day is over, "no arrival in the window" is not yet an absence.
        if (!dayComplete && result.status === 'Absent') return;
        entries.push({ personType: person.personType, personId: person.personId, shiftId, ...result });
    });

    if (dayComplete) {
        const expected = await expectedPeople(adminId, dateKey, sessionId);
        expected.forEach((person) => {
            const key = `${person.personType}|${person.personId}`;
            if (skip.has(key) || punched.has(key)) return;
            const off = person.shiftId === WEEK_OFF || isWeeklyOff(dateKey);
            entries.push({
                personType: person.personType,
                personId: person.personId,
                shiftId: off ? null : person.shiftId,
                status: off ? 'Holiday' : 'Absent',
                inTime: null,
                outTime: null,
                punches: [],
            });
        });
    }

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
                        updatedBy: 'reconcile',
                        updatedAt: now,
                    },
                    $setOnInsert: { createdAt: now, isOverridden: false, deletedAt: null },
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
