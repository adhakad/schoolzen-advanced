'use strict';
const mongoose = require('mongoose');
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const PunchLogV2Model = require('../../models/attendance/punch-log');
const StaffV2Model = require('../../models/staff/staff');
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { ValidationError, ConflictError, NotFoundError, ExternalServiceError, PermissionError } = require('../../errors');
const messages = require('../../helpers/messages/attendance.messages');
const { toUtcMidnight } = require('../../helpers/date-only');
const { atWallClock, nowWallClock } = require('../../helpers/attendance-time');
const { chipTime, hhmmLabel } = require('../../helpers/attendance/status');
const { loadClassIndex, describePlacement } = require('../../helpers/student/student.utils');
const {
    MODULE, todayKey, monthDays, monthColumns, resolveSessionId, queue, escapeRegExp,
} = require('../../helpers/attendance/context');
const { getSchoolTerminalSns } = require('../../services/attendance-v2/ingest');
const { getActiveSession } = require('../../helpers/academic-session/session-resolver');
const {
    WEEK_OFF, shiftIndex, getStaffShiftIdsForDate, getStudentShiftIds, loadClassShiftResolver,
} = require('../../services/attendance-v2/shift-lookup');
const liveStats = require('../../services/attendance-v2/live-stats');
const { DAY_TYPE, resolveDays, loadRosterCells } = require('../../services/calendar/working-day');
const { logActivity } = require('../../services/activity-log.service');
const { withTransaction } = require('../../helpers/with-transaction');
const { loadPermissions, allows, resolveStaffId } = require('../../middleware/require-permission');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Attendance Overview (attendance-overview.md). The month grid is one bounded read per
// collection — people, their roster/class shifts, their records for the month, today's
// unreconciled punches — never a query per day or per person. Individual records are never
// cached (optimization.md).
//
// Every cell the grid sends (attendance-fix1.md §3c):
//   { s, t, src }   a real status — P / L / HD / A / LV / H / WO; `t` "8:23 AM"; src 'manual'|'device'
//   { s, f: 1 }     a future day — what the roster expects: shift code, WO, H (LV stays LV)
//   { s: '—', n: 1 } no roster for that person/day
// A past or today working day with a rostered shift and no record reads A (rule 4: Absent
// is the default when nothing is marked and no device punch exists).

const MAX_PEOPLE = 1000;
// The driver's first batch is 101 documents; anything bigger pays a getMore round-trip. Every
// grid read asks for its whole answer in the first batch (attendance-fix2.md Part B).
const ONE_BATCH = 100000;
const { ObjectId } = mongoose.Types;
const CHIP = { Present: 'P', Late: 'L', HalfDay: 'HD', Absent: 'A', Leave: 'LV', Holiday: 'H', WeeklyOff: 'WO' };
// A non-working day as the shared resolver decides it → its chip.
const OFF_CHIP = { [DAY_TYPE.HOLIDAY]: 'H', [DAY_TYPE.LEAVE]: 'LV', [DAY_TYPE.WEEKLY_OFF]: 'WO' };
const COUNTS_AS_PRESENT = ['Present', 'Late', 'HalfDay'];
const NO_ROSTER = '—';

/** "8th Science-A" — a student's Class-Section line. */
const classSectionLabel = (placement) => {
    const classPart = [placement.className, placement.streamName].filter(Boolean).join(' ');
    return placement.sectionName ? `${classPart}-${placement.sectionName}` : classPart;
};

/**
 * The filtered people for the grid: [{ _id, name, idLine, sub, code }]. `idLine` is the identity
 * line (attendance-fix1.md §3a): staff → "EMP ID 014"; student → "Roll 12". `sub` is the line under
 * it: student → "8th-A"; staff → today's shift, filled in by GetGrid. Search matches
 * name, employee ID, or (students) roll number.
 */
const loadPeople = async (adminId, query, resolvedSessionId = null) => {
    const { personType, departmentId, designationId, classId, streamId, groupId, sectionId, search, session } = query;
    const pattern = search ? new RegExp(escapeRegExp(search), 'i') : null;

    if (personType === 'staff') {
        const filter = { adminId, status: 'active' };
        if (departmentId) filter.departmentId = departmentId;
        if (designationId) filter.designationId = designationId;
        if (pattern) filter.$or = [{ name: pattern }, { empCode: pattern }];
        const rows = await StaffV2Model.find(filter, { name: 1, empCode: 1, holidayTemplateId: 1 }).sort({ name: 1 }).limit(MAX_PEOPLE + 1).batchSize(MAX_PEOPLE + 1).lean();
        return rows.map((row) => ({
            _id: String(row._id), name: row.name, idLine: row.empCode ? `EMP ID ${row.empCode}` : 'No employee ID', sub: '', code: row.empCode || null,
            holidayTemplateId: row.holidayTemplateId ? String(row.holidayTemplateId) : null,
        }));
    }

    const sessionId = resolvedSessionId || await resolveSessionId(adminId, session);
    const match = { adminId, sessionId: new ObjectId(sessionId) };
    if (classId) match.classId = new ObjectId(classId);
    if (streamId) match.streamId = new ObjectId(streamId);
    if (groupId) match.groupId = new ObjectId(groupId);
    if (sectionId) match.sectionId = new ObjectId(sectionId);
    // ONE round-trip for enrollments + profiles ($lookup on _id), instead of two in a row.
    const profileMatch = { adminId };
    const pipeline = [
        { $match: match },
        { $project: { studentId: 1, classId: 1, streamId: 1, sectionId: 1, class: 1, rollNumber: 1, holidayTemplateId: 1 } },
        {
            $lookup: {
                from: StudentProfileModel.collection.name, localField: 'studentId', foreignField: '_id', as: 'profile',
                pipeline: [{ $match: profileMatch }, { $project: { name: 1, nameLower: 1 } }],
            },
        },
        { $unwind: '$profile' },
    ];
    if (pattern) {
        const or = [{ 'profile.name': pattern }];
        if (/^\d+$/.test(search)) or.push({ rollNumber: Number(search) });
        pipeline.push({ $match: { $or: or } });
    }
    pipeline.push({ $sort: { 'profile.nameLower': 1 } }, { $limit: MAX_PEOPLE + 1 });
    const [enrollments, classIndex] = await Promise.all([
        StudentEnrollmentModel.aggregate(pipeline).option({ batchSize: MAX_PEOPLE + 1 }),
        loadClassIndex(adminId),
    ]);
    return enrollments.map((enrollment) => {
        const label = classSectionLabel(describePlacement(classIndex, enrollment));
        const roll = enrollment.rollNumber != null ? String(enrollment.rollNumber) : null;
        return {
            _id: String(enrollment.studentId), name: enrollment.profile.name, idLine: roll ? `Roll ${roll}` : 'No roll no', sub: label || 'Student', code: roll,
            holidayTemplateId: enrollment.holidayTemplateId ? String(enrollment.holidayTemplateId) : null,
            placement: { classId: enrollment.classId, streamId: enrollment.streamId, sectionId: enrollment.sectionId },
        };
    });
};

/** Can this caller mark attendance by hand? (Roles & Permissions 'attendance-mark' edit.) */
const canMarkOf = async (req) => {
    try {
        const staffId = await resolveStaffId(req);
        return allows(await loadPermissions(req.adminId, staffId), 'attendance-mark', 'edit');
    } catch (error) {
        return false;
    }
};

/** [start − Early Punch, end] of a shift on `dateKey`, as wall-clock instants. */
const markWindowOf = (shift, dateKey) => {
    const day = toUtcMidnight(dateKey);
    const start = atWallClock(day, shift.startTime);
    const end = atWallClock(day, shift.endTime);
    if (!start || !end) return null;
    return { open: new Date(start.getTime() - (shift.earlyInMinutes || 0) * 60000), close: end };
};

const windowLabel = (shift) => {
    const opens = hhmmLabel(shift.startTime);
    const [h, m] = shift.startTime.split(':').map(Number);
    const minutes = (((h * 60 + m - (shift.earlyInMinutes || 0)) % 1440) + 1440) % 1440;
    const from = hhmmLabel(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    return { from: from || opens, to: hhmmLabel(shift.endTime) };
};

let GetGrid = async (req, res) => {
    const { adminId, personType, month } = req.query;
    const keys = monthDays(month);
    const fromKey = keys[0];
    const toKey = keys[keys.length - 1];
    const today = todayKey();
    const includesToday = keys.includes(today);

    // Class-first (attendance-fix2.md Part D): students are shown and marked one class at a
    // time — no class, no rows (and no school-wide student scan).
    if (personType === 'student' && !req.query.classId) {
        return res.status(200).json({ month, personType, today, days: monthColumns(month), rows: [], truncated: false, canMark: false, needsClass: true });
    }

    // Speed (global rule 5, attendance-fix2.md Part B): every query costs a network round-trip,
    // so the grid is TWO parallel stages whatever the headcount, and nothing is read twice —
    // the people read also carries each person's holiday template and (students) placement,
    // which the class-shift and holiday lookups reuse instead of re-reading staff/enrollments.
    const isStaff = personType === 'staff';
    const sessionLookup = isStaff ? Promise.resolve(null) : resolveSessionId(adminId, req.query.session);
    const [shifts, canMark, sessionId, people, resolveClassShift] = await Promise.all([
        shiftIndex(adminId),
        canMarkOf(req),
        sessionLookup,
        sessionLookup.then((id) => loadPeople(adminId, req.query, id)),
        isStaff ? null : sessionLookup.then((id) => loadClassShiftResolver(adminId, id)),
    ]);
    const truncated = people.length > MAX_PEOPLE;
    const rows = people.slice(0, MAX_PEOPLE);
    const ids = rows.map((row) => row._id);
    const persons = ids.map((personId) => ({ personType, personId }));
    const assignedTemplates = new Map(rows.map((row) => [`${personType}|${row._id}`, row.holidayTemplateId]));

    // Expected shift per person per day: the staff Roster (one scan for the month, shared
    // with the day-type resolver) or the student's class shift (resolved in memory).
    const rosterRead = isStaff ? loadRosterCells(adminId, ids, fromKey, toKey) : Promise.resolve(new Map());
    const [rosterCells, records, pending, dayTypes] = await Promise.all([
        rosterRead,
        AttendanceRecordV2Model.find(
            { adminId, personType, personId: { $in: ids }, date: { $gte: toUtcMidnight(fromKey), $lte: toUtcMidnight(toKey) }, deletedAt: null },
            { personId: 1, dateKey: 1, status: 1, inTime: 1, outTime: 1, isOverridden: 1, updatedBy: 1, source: 1, markedAt: 1, punches: 1 }
        ).batchSize(ONE_BATCH).lean(),
        includesToday
            ? PunchLogV2Model.aggregate([
                { $match: { adminId, dateKey: today, personId: { $in: ids } } },
                { $group: { _id: '$personId', first: { $min: '$punchTime' }, pending: { $max: { $cond: ['$reconciled', 0, 1] } } } },
            ])
            : [],
        // Holiday > Leave > WeeklyOff from the shared resolver — the same answer Leave and the
        // reconcile worker get.
        resolveDays(adminId, { sessionId, people: persons, fromKey, toKey, rosterCells: rosterRead, assignedTemplates }),
    ]);
    const studentShifts = new Map();
    if (!isStaff) {
        rows.forEach((row) => {
            const shiftId = row.placement ? resolveClassShift(row.placement) : null;
            if (shiftId) studentShifts.set(row._id, shiftId);
        });
    }
    const expectedOf = (personId, dateKey) => {
        if (personType === 'staff') return (rosterCells.get(personId) || {})[dateKey] || null;
        return studentShifts.get(personId) || null;
    };

    const recordsByPerson = new Map(ids.map((id) => [id, new Map()]));
    records.forEach((record) => {
        const byDay = recordsByPerson.get(record.personId);
        if (byDay) byDay.set(record.dateKey, record);
    });
    const punchedToday = new Map(pending.map((row) => [String(row._id), row]));

    const result = rows.map((row) => {
        const cells = {};
        const byDay = recordsByPerson.get(row._id);
        const types = dayTypes.get(`${personType}|${row._id}`) || new Map();
        keys.forEach((dateKey) => {
            const record = byDay.get(dateKey);
            const type = types.get(dateKey) || DAY_TYPE.WORKING;
            const expected = expectedOf(row._id, dateKey);
            // A leave's own marks outrank the calendar; anything else defers to it.
            const leaveMark = record && record.isOverridden && record.updatedBy === 'leave';
            if (dateKey > today) {
                if (OFF_CHIP[type]) cells[dateKey] = { s: OFF_CHIP[type], f: 1 };
                else if (expected === WEEK_OFF) cells[dateKey] = { s: 'WO', f: 1 };
                else if (expected && shifts.get(expected)) cells[dateKey] = { s: shifts.get(expected).code, f: 1 };
                else cells[dateKey] = { s: NO_ROSTER, n: 1 };
                return;
            }
            if (OFF_CHIP[type] && !leaveMark) {
                cells[dateKey] = { s: OFF_CHIP[type], t: null };
                return;
            }
            if (record) {
                const timed = COUNTS_AS_PRESENT.includes(record.status);
                const manual = record.source === 'manual';
                const time = manual ? record.markedAt : record.inTime;
                cells[dateKey] = { s: CHIP[record.status] || 'A', t: timed && time ? chipTime(time) : null, src: manual ? 'manual' : (record.source === 'device' || (record.punches || []).length ? 'device' : undefined) };
                return;
            }
            if (expected && expected !== WEEK_OFF) {
                // Nothing marked, no reconciled punch: Absent by default (rule 4).
                cells[dateKey] = { s: 'A', t: null };
                return;
            }
            cells[dateKey] = { s: NO_ROSTER, n: 1 };
        });

        const { holidayTemplateId, placement, ...person } = row;
        const out = { ...person, type: personType, cells, live: false, presentCount: 0 };
        out.presentCount = Object.values(cells).filter((cell) => !cell.f && ['P', 'L', 'HD'].includes(cell.s)).length;
        const todayShiftId = expectedOf(row._id, today);
        const todayShift = todayShiftId && todayShiftId !== WEEK_OFF ? shifts.get(todayShiftId) : null;
        out.shift = todayShift ? todayShift.name : null;
        // Staff second line is today's shift (the reference's "Morning Shift"); students keep Class-Section.
        if (personType === 'staff') out.sub = out.shift || 'No shift today';

        if (includesToday) {
            const punch = punchedToday.get(row._id);
            const record = byDay.get(today);
            if (punch) {
                // A device punch for today: the cell is read-only, never overwritten by a mark.
                cells[today] = { ...cells[today], src: 'device', p: chipTime(punch.first) };
                // Staff punched in with no punch-out yet (or not yet reconciled) → the live ring.
                out.live = personType === 'staff' && (Boolean(punch.pending) || Boolean(record && record.inTime && !record.outTime));
            }
            if (todayShift && types.get(today) !== DAY_TYPE.HOLIDAY && types.get(today) !== DAY_TYPE.LEAVE && types.get(today) !== DAY_TYPE.WEEKLY_OFF) {
                const window = markWindowOf(todayShift, today);
                const now = nowWallClock();
                out.mark = { ...windowLabel(todayShift), open: Boolean(window) && now >= window.open && now <= window.close };
            }
        }
        return out;
    });

    return res.status(200).json({ month, personType, today, days: monthColumns(month), rows: result, truncated, canMark });
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
        AttendanceRecordV2Model.findOne({ adminId, personType, personId, date: toUtcMidnight(date), deletedAt: null }, { status: 1, inTime: 1, outTime: 1, source: 1, markedAt: 1, remark: 1 }).lean(),
    ]);
    return res.status(200).json({
        date,
        punches: punches.map((row) => ({ time: chipTime(row.punchTime), terminalSn: row.terminalSn })),
        record: record ? {
            status: record.status,
            inTime: chipTime(record.inTime),
            outTime: chipTime(record.outTime),
            source: record.source || 'system',
            markedAt: chipTime(record.markedAt),
            remark: record.remark,
        } : null,
    });
};

/** Sync Now — confirm-gated; deduped by the job key; one run per school-day at a time. */
let SyncNow = async (req, res) => {
    const { adminId } = req.body;
    const dateKey = req.body.date || todayKey();
    if (dateKey > todayKey()) {
        throw new ValidationError(messages.dateRangeInvalid(), { module: MODULE, code: 'DATE_RANGE_INVALID', fields: [{ field: 'date', message: 'Pick today or an earlier day.' }] });
    }
    let q;
    try {
        q = queue();
    } catch (error) {
        throw new ExternalServiceError(messages.queueUnavailable(), { module: MODULE, code: 'QUEUE_UNAVAILABLE', context: { reason: error.message } });
    }
    // Speed (Part B): the three independent checks are one parallel stage; they are still
    // reported in a fixed order (no devices → worker down → already running).
    const [terminals, workerAlive, running] = await Promise.all([
        getSchoolTerminalSns(adminId),
        q.workerAlive(),
        q.isRunning(q.syncJobId(adminId, dateKey)),
    ]);
    if (!terminals.length) throw new ValidationError(messages.syncNoDevices(), { module: MODULE, code: 'SYNC_NO_DEVICES' });
    // No worker → a queued job never runs and every later Sync reads "already running".
    if (!workerAlive) throw new ExternalServiceError(messages.syncWorkerDown(), { module: MODULE, code: 'SYNC_WORKER_DOWN' });
    if (running) {
        throw new ConflictError(messages.syncAlreadyRunning(), { module: MODULE, code: 'SYNC_ALREADY_RUNNING', context: { dateKey } });
    }
    const [jobId] = await Promise.all([
        q.addSyncJob({ adminId, dateKey }),
        logActivity(req, { module: MODULE, action: 'attendance.sync', meta: { dateKey, terminals: terminals.length } }),
    ]);
    return res.status(202).json({ message: messages.syncQueued(), jobId, dateKey });
};

/**
 * "Last sync: 9:05 AM / 42 punches" — when the last device sync finished, and how many
 * device punches today holds, so a person can see punches arriving without reading logs.
 */
let GetSyncStatus = async (req, res) => {
    const { adminId } = req.query;
    const today = todayKey();
    const [last, punches] = await Promise.all([
        cacheService.get(cacheKeys.attendance.lastSync(adminId)),
        PunchLogV2Model.countDocuments({ adminId, dateKey: today }),
    ]);
    return res.status(200).json({
        dateKey: today,
        lastSyncAt: last && last.at ? chipTime(last.at) : null,
        lastSyncDate: last && last.at ? String(last.dateKey || '') : null,
        lastFetched: last ? last.fetched || 0 : 0,
        lastInserted: last ? last.inserted || 0 : 0,
        // Punches from codes that belong to nobody in this school (not enrolled under a v2 id).
        lastUnmatched: last ? last.unmatched || 0 : 0,
        punchesToday: punches,
    });
};

const markError = (Ctor, code, message, context) => new Ctor(message, { module: MODULE, code, context });

/**
 * Manual marking (attendance-fix1.md §3d) — STATUS marking, never a punch. Every rule is
 * enforced here; the UI only mirrors them:
 *   1. today only — the date is the server's, never sent by the client;
 *   2. only inside [shift start − Early Punch, shift end];
 *   3. only with 'attendance-mark' (route guard);
 *   4. a device punch for the day is never overwritten (409, read-only);
 *   5. the time is the server's (`markedAt`); Absent clears the mark.
 * Every mark is an activity-log entry carrying the previous value.
 */
let MarkAttendance = async (req, res) => {
    const { adminId, personType, personId, status, date: requestedDate } = req.body;
    const today = todayKey();
    const now = nowWallClock();
    if (requestedDate && requestedDate !== today) throw markError(PermissionError, 'MARK_NOT_TODAY', messages.markNotToday());
    // Class-first (attendance-fix2.md Part D): a student is marked from the class the grid
    // shows, in the grid's session — never the server's "active" one, which can differ from
    // the session picked in the header.
    const { classId, streamId, groupId, sectionId } = req.body;
    if (personType === 'student' && !classId) {
        throw new ValidationError(messages.markClassRequired(), {
            module: MODULE, code: 'MARK_CLASS_REQUIRED', fields: [{ field: 'classId', message: messages.markClassRequired() }],
        });
    }

    // Speed (Part B): every read the checks need runs in ONE parallel stage; the checks then
    // run in their fixed order, so the refusal a caller sees never depends on timing.
    const date = toUtcMidnight(today);
    const studentLookup = async () => {
        const sessionId = await resolveSessionId(adminId, req.body.session);
        const match = { adminId, sessionId: new ObjectId(sessionId), studentId: new ObjectId(personId), classId: new ObjectId(classId) };
        if (streamId) match.streamId = new ObjectId(streamId);
        if (groupId) match.groupId = new ObjectId(groupId);
        if (sectionId) match.sectionId = new ObjectId(sectionId);
        const [enrollment, resolveClassShift, dayTypes] = await Promise.all([
            StudentEnrollmentModel.findOne(match, { classId: 1, streamId: 1, sectionId: 1 }).lean(),
            loadClassShiftResolver(adminId, sessionId),
            resolveDays(adminId, { sessionId, people: [{ personType, personId }], fromKey: today, toKey: today }),
        ]);
        return { enrollment, shiftId: enrollment ? resolveClassShift(enrollment) || null : null, dayTypes };
    };
    const staffLookup = async () => {
        const [shiftIds, dayTypes] = await Promise.all([
            getStaffShiftIdsForDate(adminId, today, [personId]),
            resolveDays(adminId, { sessionId: null, people: [{ personType, personId }], fromKey: today, toKey: today }),
        ]);
        return { enrollment: null, shiftId: shiftIds.get(personId) || null, dayTypes };
    };
    const [person, lookup, shifts, punch, previous] = await Promise.all([
        assertPerson(adminId, personType, personId),
        personType === 'staff' ? staffLookup() : studentLookup(),
        shiftIndex(adminId),
        PunchLogV2Model.findOne({ adminId, personId, dateKey: today }, { punchTime: 1 }).sort({ punchTime: 1 }).lean(),
        AttendanceRecordV2Model.findOne({ adminId, personType, personId, date }, { status: 1, source: 1, markedAt: 1, deletedAt: 1, isOverridden: 1, updatedBy: 1 }).lean(),
    ]);
    if (personType === 'student' && !lookup.enrollment) throw markError(PermissionError, 'MARK_NOT_ENROLLED', messages.markNotEnrolled());
    const { shiftId, dayTypes } = lookup;
    const dayType = (dayTypes.get(`${personType}|${personId}`) || new Map()).get(today) || DAY_TYPE.WORKING;
    const shift = shiftId && shiftId !== WEEK_OFF ? shifts.get(shiftId) : null;
    if (dayType !== DAY_TYPE.WORKING || shiftId === WEEK_OFF) {
        throw markError(PermissionError, 'MARK_DAY_OFF', messages.markDayOff());
    }
    if (!shift) throw markError(PermissionError, 'MARK_NO_SHIFT', messages.markNoShift());

    const window = markWindowOf(shift, today);
    if (!window || now < window.open || now > window.close) {
        const { from, to } = windowLabel(shift);
        throw markError(PermissionError, 'MARK_OUTSIDE_WINDOW', messages.markOutsideWindow(from, to), { from, to });
    }

    if (punch || (previous && !previous.deletedAt && previous.source === 'device')) {
        const at = chipTime(punch ? punch.punchTime : null);
        throw markError(ConflictError, 'MARK_DEVICE_RECORDED', messages.markDeviceRecorded(at), { at });
    }
    if (previous && !previous.deletedAt && previous.isOverridden && previous.updatedBy === 'leave') {
        throw markError(PermissionError, 'MARK_DAY_OFF', messages.markDayOff());
    }

    const actor = String(req.staffId || (req.user && req.user.id) || 'admin');
    // The record and its activity-log entry are ONE transaction: a failure in either leaves
    // neither behind (attendance-fix2.md Part C, failure/rollback).
    await withTransaction(async (dbSession) => {
        if (status === 'Absent') {
            // Absent is the default — clearing the mark is enough (soft, so history stays).
            if (previous && !previous.deletedAt) {
                await AttendanceRecordV2Model.updateOne(
                    { _id: previous._id },
                    { $set: { status: 'Absent', source: 'system', markedAt: null, markedBy: actor, deletedAt: now, updatedBy: actor, updatedAt: new Date() } },
                    { session: dbSession }
                );
            }
        } else {
            await AttendanceRecordV2Model.updateOne(
                { adminId, personType, personId, date },
                {
                    $set: {
                        dateKey: today, status, source: 'manual', markedAt: now, markedBy: actor, shiftId,
                        inTime: null, outTime: null, punches: [], isOverridden: false, deletedAt: null, updatedBy: actor, updatedAt: new Date(),
                    },
                    $setOnInsert: { createdAt: new Date() },
                },
                { upsert: true, session: dbSession }
            );
        }
        await logActivity(req, {
            module: MODULE,
            action: 'attendance.mark',
            targetId: personId,
            meta: {
                personType,
                name: person.name,
                status,
                markedAt: chipTime(now),
                previous: previous && !previous.deletedAt ? { status: previous.status, source: previous.source || 'system', markedAt: chipTime(previous.markedAt) } : { status: 'Absent' },
            },
        }, dbSession);
    });
    // Write-through: today's counts change in the same request (optimization.md).
    await liveStats.recompute(adminId, today);

    const marked = status !== 'Absent';
    return res.status(200).json({
        message: messages.marked(person.name, status),
        cell: { s: CHIP[status], t: marked ? chipTime(now) : null, src: marked ? 'manual' : undefined },
        markedAt: marked ? chipTime(now) : null,
    });
};

module.exports = {
    GetGrid,
    GetLiveStatus,
    GetRecentArrivals,
    GetDayPunches,
    SyncNow,
    GetSyncStatus,
    MarkAttendance,
    loadPeople,
    markWindowOf,
    windowLabel,
};
