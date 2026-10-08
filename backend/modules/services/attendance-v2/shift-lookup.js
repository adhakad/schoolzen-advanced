'use strict';
const ShiftV2Model = require('../../models/attendance/shift');
const RosterV2Model = require('../../models/attendance/roster');
const ClassShiftV2Model = require('../../models/attendance/class-shift');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const cacheService = require('../cache/cache.service');
const cacheKeys = require('../cache/cache-keys');
const { COLLATION } = require('../../helpers/staff/lookups');
const { parseDateKey } = require('../../helpers/date-only');
const { shiftCode } = require('../../helpers/attendance/status');

// Who is expected on which shift — the reads the grid, Roster and the reconcile worker share.
// Every lookup is batched: a whole school-day resolves in a fixed number of queries,
// independent of headcount (CLAUDE.md, monthly-snapshot pattern).

const WEEK_OFF = 'WO';

/** The school's shifts, near-static cache (attendance/optimization.md, 45 min). */
const loadShifts = (adminId) => cacheService.wrap(
    cacheKeys.attendance.shifts(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const rows = await ShiftV2Model.find({ adminId }).sort({ name: 1 }).collation(COLLATION).lean();
        return rows.map((row) => ({
            _id: String(row._id),
            name: row.name,
            code: shiftCode(row.name),
            startTime: row.startTime,
            endTime: row.endTime,
            earlyInMinutes: row.earlyInMinutes,
            graceMinutes: row.graceMinutes,
            halfDayAfterMinutes: row.halfDayAfterMinutes,
            earlyOutMinutes: row.earlyOutMinutes,
            lateOutMinutes: row.lateOutMinutes,
            status: row.status,
        }));
    }
);

const shiftIndex = async (adminId) => new Map((await loadShifts(adminId)).map((shift) => [shift._id, shift]));

/** staffId → the shiftId (or 'WO') rostered on `dateKey`. One query for the whole list. */
const getStaffShiftIdsForDate = async (adminId, dateKey, staffIds) => {
    const parsed = parseDateKey(dateKey);
    const result = new Map();
    if (!parsed || !staffIds.length) return result;
    const docs = await RosterV2Model
        .find({ adminId, year: parsed.year, month: parsed.month, staffId: { $in: staffIds.map(String) } }, { staffId: 1, [`days.${dateKey}`]: 1 })
        .lean();
    docs.forEach((doc) => {
        const value = doc.days && doc.days[dateKey];
        if (value) result.set(doc.staffId, value);
    });
    return result;
};

/**
 * The ClassShift resolver for one session: most specific row wins — section, then stream,
 * then the bare class.
 */
const loadClassShiftResolver = async (adminId, sessionId) => {
    const rows = sessionId ? await ClassShiftV2Model.find({ adminId, sessionId: String(sessionId) }).lean() : [];
    const byKey = new Map(rows.map((row) => [`${row.classId}|${row.streamId || ''}|${row.sectionId || ''}`, row.shiftId]));
    return (placement) => {
        const classId = String(placement.classId || '');
        const streamId = placement.streamId ? String(placement.streamId) : '';
        const sectionId = placement.sectionId ? String(placement.sectionId) : '';
        return byKey.get(`${classId}|${streamId}|${sectionId}`)
            || (sectionId && byKey.get(`${classId}||${sectionId}`))
            || (streamId && byKey.get(`${classId}|${streamId}|`))
            || byKey.get(`${classId}||`)
            || null;
    };
};

/** studentId → shiftId for the given session's enrollments. Two queries, any headcount. */
const getStudentShiftIds = async (adminId, sessionId, studentIds) => {
    const result = new Map();
    if (!sessionId || !studentIds.length) return result;
    const [resolve, enrollments] = await Promise.all([
        loadClassShiftResolver(adminId, sessionId),
        StudentEnrollmentModel
            .find({ adminId, sessionId, studentId: { $in: studentIds } }, { studentId: 1, classId: 1, streamId: 1, sectionId: 1 })
            .lean(),
    ]);
    enrollments.forEach((row) => {
        const shiftId = resolve(row);
        if (shiftId) result.set(String(row.studentId), shiftId);
    });
    return result;
};

module.exports = {
    WEEK_OFF,
    loadShifts,
    shiftIndex,
    getStaffShiftIdsForDate,
    loadClassShiftResolver,
    getStudentShiftIds,
};
