'use strict';
const mongoose = require('mongoose');
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const PunchLogV2Model = require('../../models/attendance/punch-log');
const StaffV2Model = require('../../models/staff/staff');
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { ValidationError, ConflictError, NotFoundError, ExternalServiceError } = require('../../errors');
const messages = require('../../helpers/messages/attendance.messages');
const { toUtcMidnight, toDateKey } = require('../../helpers/date-only');
const { atWallClock } = require('../../helpers/attendance-time');
const { chipTime, isWeeklyOff } = require('../../helpers/attendance/status');
const { loadClassIndex, describePlacement } = require('../../helpers/student/student.utils');
const {
    MODULE, todayKey, monthDays, monthColumns, resolveSessionId, queue, escapeRegExp,
} = require('../../helpers/attendance/context');
const { getSchoolTerminalSns } = require('../../services/attendance-v2/ingest');
const { getActiveSession } = require('../../helpers/academic-session/session-resolver');
const { shiftIndex, getStaffShiftIdsForDate, getStudentShiftIds } = require('../../services/attendance-v2/shift-lookup');
const liveStats = require('../../services/attendance-v2/live-stats');
const { logActivity } = require('../../services/activity-log.service');
const { STATUSES } = AttendanceRecordV2Model;

// Attendance Overview (attendance-overview.md). The month grid is one bounded read per
// collection — people, their records for the month, today's unreconciled punches — never a
// query per day or per person. Individual records are never cached (optimization.md).

const MAX_PEOPLE = 1000;
const { ObjectId } = mongoose.Types;
const CHIP = { Present: 'P', Late: 'L', HalfDay: 'HD', Absent: 'A', Leave: 'LV', Holiday: 'H' };
const COUNTS_AS_PRESENT = ['Present', 'Late', 'HalfDay'];

/** Today's (or the month's first day's) expected shift name per person — the grid's sub-line. */
const attachShiftNames = async (adminId, personType, rows, dateKey, sessionId) => {
    const ids = rows.map((row) => row._id);
    const [shifts, assigned] = await Promise.all([
        shiftIndex(adminId),
        personType === 'staff'
            ? getStaffShiftIdsForDate(adminId, dateKey, ids)
            : getStudentShiftIds(adminId, sessionId, ids.map((id) => new ObjectId(id))),
    ]);
    return rows.map((row) => {
        const shift = shifts.get(assigned.get(row._id));
        return { ...row, shift: shift ? shift.name : null };
    });
};

/** The filtered people for the grid: [{ _id, name, sub }]. */
const loadPeople = async (adminId, query) => {
    const { personType, departmentId, designationId, classId, streamId, sectionId, search, session } = query;
    const pattern = search ? new RegExp(escapeRegExp(search), 'i') : null;

    if (personType === 'staff') {
        const filter = { adminId, status: 'active' };
        if (departmentId) filter.departmentId = departmentId;
        if (designationId) filter.designationId = designationId;
        if (pattern) filter.$or = [{ name: pattern }, { empCode: pattern }];
        const rows = await StaffV2Model.find(filter, { name: 1, empCode: 1, designation: 1 }).sort({ name: 1 }).limit(MAX_PEOPLE + 1).lean();
        return rows.map((row) => ({ _id: String(row._id), name: row.name, sub: row.designation || row.empCode || 'Staff', code: row.empCode || null }));
    }

    const sessionId = await resolveSessionId(adminId, session);
    const match = { adminId, sessionId: new ObjectId(sessionId) };
    if (classId) match.classId = new ObjectId(classId);
    if (streamId) match.streamId = new ObjectId(streamId);
    if (sectionId) match.sectionId = new ObjectId(sectionId);
    const [enrollments, classIndex] = await Promise.all([
        StudentEnrollmentModel.find(match, { studentId: 1, classId: 1, streamId: 1, groupId: 1, sectionId: 1, class: 1, rollNumber: 1 }).lean(),
        loadClassIndex(adminId),
    ]);
    const byStudent = new Map(enrollments.map((row) => [String(row.studentId), row]));
    const profileFilter = { adminId, _id: { $in: enrollments.map((row) => row.studentId) } };
    if (pattern) profileFilter.name = pattern;
    const students = await StudentProfileModel.find(profileFilter, { name: 1, admissionNo: 1 }).sort({ nameLower: 1 }).limit(MAX_PEOPLE + 1).lean();
    return students.map((row) => {
        const placement = describePlacement(classIndex, byStudent.get(String(row._id)));
        return { _id: String(row._id), name: row.name, sub: placement.tag || 'Student', code: row.admissionNo != null ? String(row.admissionNo) : null };
    });
};

let GetGrid = async (req, res) => {
    const { adminId, personType, month } = req.query;
    const people = await loadPeople(adminId, req.query);
    const truncated = people.length > MAX_PEOPLE;
    const keys = monthDays(month);
    const today = todayKey();
    const includesToday = keys.includes(today);
    const sessionId = personType === 'student' ? await resolveSessionId(adminId, req.query.session) : null;
    const rows = await attachShiftNames(adminId, personType, people.slice(0, MAX_PEOPLE), includesToday ? today : keys[0], sessionId);
    const ids = rows.map((row) => row._id);

    const [records, pending] = await Promise.all([
        AttendanceRecordV2Model.find(
            { adminId, personType, personId: { $in: ids }, date: { $gte: toUtcMidnight(keys[0]), $lte: toUtcMidnight(keys[keys.length - 1]) }, deletedAt: null },
            { personId: 1, dateKey: 1, status: 1, inTime: 1, outTime: 1 }
        ).lean(),
        includesToday
            ? PunchLogV2Model.distinct('personId', { adminId, dateKey: today, reconciled: false, personId: { $in: ids } })
            : [],
    ]);

    const cellsByPerson = new Map(ids.map((id) => [id, {}]));
    const live = new Set(pending.map(String));
    records.forEach((record) => {
        const cells = cellsByPerson.get(record.personId);
        if (!cells) return;
        cells[record.dateKey] = { s: CHIP[record.status] || 'A', t: record.inTime && record.status !== 'Absent' ? chipTime(record.inTime) : null };
        // Staff punched in today with no punch-out yet → the live ring.
        if (record.dateKey === today && personType === 'staff' && record.inTime && !record.outTime) live.add(record.personId);
    });

    const columns = monthColumns(month);
    const weeklyOff = columns.filter((col) => isWeeklyOff(col.dateKey)).map((col) => col.dateKey);
    const result = rows.map((row) => {
        const cells = cellsByPerson.get(row._id);
        weeklyOff.forEach((key) => { if (!cells[key]) cells[key] = { s: 'H', t: null }; });
        const presentCount = Object.values(cells).filter((cell) => ['P', 'L', 'HD'].includes(cell.s)).length;
        return { ...row, type: personType, cells, live: includesToday && live.has(row._id), presentCount };
    });

    return res.status(200).json({ month, personType, today, days: columns, rows: result, truncated });
};

let GetLiveStatus = async (req, res) => {
    const dateKey = req.query.date || todayKey();
    return res.status(200).json(await liveStats.read(req.query.adminId, dateKey));
};

/** Recent Arrivals: each person's first punch today, newest first, with a monthly tally. */
let GetRecentArrivals = async (req, res) => {
    const { adminId } = req.query;
    const dateKey = req.query.date || todayKey();
    const first = await PunchLogV2Model.aggregate([
        { $match: { adminId, dateKey } },
        { $group: { _id: { personType: '$personType', personId: '$personId' }, time: { $min: '$punchTime' } } },
        { $sort: { time: -1 } },
        { $limit: 40 },
    ]);
    const staffIds = first.filter((row) => row._id.personType === 'staff').map((row) => row._id.personId);
    const studentIds = first.filter((row) => row._id.personType === 'student').map((row) => row._id.personId);
    const monthStart = toUtcMidnight(`${dateKey.slice(0, 7)}-01`);
    const session = studentIds.length ? await getActiveSession(adminId) : null;
    const sessionId = session ? String(session._id) : null;
    const [staff, students, enrollments, classIndex, tallies, shifts, staffShifts, studentShifts] = await Promise.all([
        staffIds.length ? StaffV2Model.find({ adminId, _id: { $in: staffIds } }, { name: 1, empCode: 1, designation: 1 }).lean() : [],
        studentIds.length ? StudentProfileModel.find({ adminId, _id: { $in: studentIds } }, { name: 1 }).lean() : [],
        sessionId ? StudentEnrollmentModel.find({ adminId, sessionId, studentId: { $in: studentIds } }, { studentId: 1, classId: 1, streamId: 1, sectionId: 1, class: 1, rollNumber: 1 }).lean() : [],
        studentIds.length ? loadClassIndex(adminId) : new Map(),
        AttendanceRecordV2Model.aggregate([
            { $match: { adminId, personId: { $in: [...staffIds, ...studentIds] }, date: { $gte: monthStart, $lte: toUtcMidnight(dateKey) }, status: { $in: COUNTS_AS_PRESENT }, deletedAt: null } },
            { $group: { _id: '$personId', count: { $sum: 1 } } },
        ]),
        shiftIndex(adminId),
        getStaffShiftIdsForDate(adminId, dateKey, staffIds),
        getStudentShiftIds(adminId, sessionId, studentIds),
    ]);
    const shiftName = (id) => (shifts.get(id) ? shifts.get(id).name : null);
    const placements = new Map(enrollments.map((row) => [String(row.studentId), row]));
    const names = new Map([
        ...staff.map((row) => [String(row._id), {
            name: row.name, role: row.designation || 'Staff', idLabel: 'Staff ID', code: row.empCode || null, shift: shiftName(staffShifts.get(String(row._id))),
        }]),
        ...students.map((row) => {
            const placement = placements.get(String(row._id));
            return [String(row._id), {
                name: row.name,
                role: placement ? `Class ${describePlacement(classIndex, placement).tag}` : 'Student',
                idLabel: 'Roll No',
                code: placement && placement.rollNumber != null ? String(placement.rollNumber) : null,
                shift: shiftName(studentShifts.get(String(row._id))),
            }];
        }),
    ]);
    const counts = new Map(tallies.map((row) => [row._id, row.count]));
    const toRow = (row) => {
        const person = names.get(row._id.personId);
        if (!person) return null;
        return { personId: row._id.personId, ...person, time: chipTime(row.time), presentThisMonth: counts.get(row._id.personId) || 0 };
    };
    return res.status(200).json({
        dateKey,
        staff: first.filter((row) => row._id.personType === 'staff').map(toRow).filter(Boolean).slice(0, 20),
        student: first.filter((row) => row._id.personType === 'student').map(toRow).filter(Boolean).slice(0, 20),
    });
};

const assertPerson = async (adminId, personType, personId) => {
    const Model = personType === 'staff' ? StaffV2Model : StudentProfileModel;
    const person = await Model.findOne({ _id: personId, adminId }, { name: 1 }).lean();
    if (!person) throw new NotFoundError(messages.personNotFound(), { module: MODULE, code: 'PERSON_NOT_FOUND', context: { personType, personId } });
    return person;
};

/** The day-detail modal: that day's punch trail and its record. */
let GetDayPunches = async (req, res) => {
    const { adminId, personType, personId, date } = req.query;
    await assertPerson(adminId, personType, personId);
    const [punches, record] = await Promise.all([
        PunchLogV2Model.find({ adminId, personId, dateKey: date }, { punchTime: 1, terminalSn: 1 }).sort({ punchTime: 1 }).limit(50).lean(),
        AttendanceRecordV2Model.findOne({ adminId, personType, personId, date: toUtcMidnight(date), deletedAt: null }, { status: 1, inTime: 1, outTime: 1, isOverridden: 1, remark: 1 }).lean(),
    ]);
    return res.status(200).json({
        date,
        punches: punches.map((row) => ({ time: chipTime(row.punchTime), terminalSn: row.terminalSn })),
        record: record ? { status: record.status, inTime: chipTime(record.inTime), outTime: chipTime(record.outTime), isOverridden: record.isOverridden, remark: record.remark } : null,
    });
};

/** Sync Now — confirm-gated; deduped by the job key; one run per school-day at a time. */
let SyncNow = async (req, res) => {
    const { adminId } = req.body;
    const dateKey = req.body.date || todayKey();
    if (dateKey > todayKey()) {
        throw new ValidationError(messages.dateRangeInvalid(), { module: MODULE, code: 'DATE_RANGE_INVALID', fields: [{ field: 'date', message: 'Pick today or an earlier day.' }] });
    }
    const terminals = await getSchoolTerminalSns(adminId);
    if (!terminals.length) throw new ValidationError(messages.syncNoDevices(), { module: MODULE, code: 'SYNC_NO_DEVICES' });

    let q;
    try {
        q = queue();
    } catch (error) {
        throw new ExternalServiceError(messages.queueUnavailable(), { module: MODULE, code: 'QUEUE_UNAVAILABLE', context: { reason: error.message } });
    }
    if (await q.isRunning(q.syncJobId(adminId, dateKey))) {
        throw new ConflictError(messages.syncAlreadyRunning(), { module: MODULE, code: 'SYNC_ALREADY_RUNNING', context: { dateKey } });
    }
    const jobId = await q.addSyncJob({ adminId, dateKey });
    await logActivity(req, { module: MODULE, action: 'attendance.sync', meta: { dateKey, terminals: terminals.length } });
    return res.status(202).json({ message: messages.syncQueued(), jobId, dateKey });
};

const statusError = (code, message, field = 'status') => new ValidationError(message, {
    module: MODULE, code, fields: [{ field, message, code }],
});

/** A manual correction — wins over every later reconcile of that day (isOverridden). */
let SaveManualAttendance = async (req, res) => {
    const { adminId, personType, personId, date, status, inTime, outTime, remark } = req.body;
    if (!STATUSES.includes(status)) throw statusError('STATUS_INVALID', messages.statusInvalid());
    if (status === 'HalfDay' && personType === 'student') throw statusError('HALFDAY_NOT_APPLICABLE', messages.halfDayNotApplicable());
    if (inTime && outTime && outTime < inTime) throw statusError('MANUAL_TIME_RANGE_INVALID', messages.manualTimeRangeInvalid(), 'outTime');
    await assertPerson(adminId, personType, personId);

    const day = toUtcMidnight(date);
    const timed = !['Absent', 'Leave', 'Holiday'].includes(status);
    const inAt = timed && inTime ? atWallClock(day, inTime) : null;
    const outAt = timed && outTime && personType === 'staff' ? atWallClock(day, outTime) : null;
    const punches = [];
    if (inAt) punches.push({ time: inAt, type: 'in' });
    if (outAt) punches.push({ time: outAt, type: 'out' });
    const actor = String(req.user && req.user.id || 'admin');
    const now = new Date();

    await AttendanceRecordV2Model.updateOne(
        { adminId, personType, personId, date: day },
        {
            $set: { dateKey: toDateKey(day), status, inTime: inAt, outTime: outAt, punches, isOverridden: true, remark, deletedAt: null, updatedBy: actor, updatedAt: now },
            $setOnInsert: { createdAt: now },
        },
        { upsert: true }
    );
    // Write-through: that day's counts change in the same request (optimization.md).
    await liveStats.recompute(adminId, toDateKey(day));
    await logActivity(req, { module: MODULE, action: 'attendance.manual', targetId: personId, meta: { personType, date, status } });
    return res.status(200).json({ message: messages.manualSaved() });
};

module.exports = {
    GetGrid,
    GetLiveStatus,
    GetRecentArrivals,
    GetDayPunches,
    SyncNow,
    SaveManualAttendance,
};
