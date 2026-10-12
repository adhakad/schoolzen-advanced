'use strict';
const mongoose = require('mongoose');
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const SubjectModel = require('../../models/academic-setup/subject');
const AcademicSessionV2Model = require('../../models/settings/academic-session');
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const TcStructureModel = require('../../models/certificates/tc-structure');
const { NotFoundError } = require('../../errors');
const messages = require('../messages/certificates.messages');
const { findSessionId } = require('../academic-session/session-resolver');
const { loadClassIndex, describePlacement } = require('../student/student.utils');
const { getClassDisplayName } = require('../format-class-name');
const { loadLedgerData, ledgerFor } = require('../fees/fee-context');
const { buildLedger, money } = require('../fees/fee-ledger');
const { resolveDays, personKey, DAY_TYPE } = require('../../services/calendar/working-day');
const { toDateKey } = require('../date-only');
const { allows } = require('../../middleware/require-permission');
const { defaultSerial, MAX_WORKING_DAYS } = require('./tc-rules');

// Everything Generate TC reads about one student — all from v2 collections: Student +
// StudentEnrollment, Academic Setup (class/stream/section, subject group → subjects), the
// Fees ledger (pending dues) and v2 AttendanceRecord + the working-day resolver.

const MODULE = 'certificates';
const { ObjectId } = mongoose.Types;

// The explicit Roles & Permissions grants (models/settings/role.js).
const PERMISSIONS = Object.freeze({
    VIEW: 'certificates',
    STRUCTURE: 'tc-structure',
    GENERATE: 'tc-generate',
    FEES_WAIVER: 'fees-waiver',
});

const actorOf = (req) => String((req.user && (req.user.staffId || req.user.id)) || req.staffId || 'admin');
const canEditOf = (req, module) => Boolean(req.permissions && allows(req.permissions, module, 'edit'));
const isObjectId = (value) => ObjectId.isValid(String(value || '')) && String(new ObjectId(String(value))) === String(value);
const toObjectId = (value) => (value ? new ObjectId(String(value)) : null);

const notFound = (context) => new NotFoundError(messages.notFound(), { module: MODULE, code: 'NOT_FOUND', context });

const requireSessionId = async (adminId, label) => {
    const id = await findSessionId(adminId, label);
    if (!id) throw new NotFoundError(messages.sessionNotFound(), { module: MODULE, code: 'SESSION_NOT_FOUND', context: { label } });
    return id;
};

/** The school's structure, created on first use (unique adminId makes the race safe). */
const ensureStructure = async (adminId) => {
    try {
        await TcStructureModel.updateOne(
            { adminId },
            { $setOnInsert: { adminId, nextSerialNumber: defaultSerial(new Date().getFullYear()), issuedCounts: {} } },
            { upsert: true }
        );
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
    return TcStructureModel.findOne({ adminId }).lean();
};

const issuedCountOf = (structure, sessionId) => {
    const counts = (structure && structure.issuedCounts) || {};
    const value = counts instanceof Map ? counts.get(String(sessionId)) : counts[String(sessionId)];
    return Math.max(0, Number(value) || 0);
};

/** The configured class right after this one ("9th" after "8th"), or null for the last. */
const nextClassName = (classIndex, classNumber) => {
    const later = [...classIndex.values()]
        .map((entry) => entry.doc.class)
        .filter((value) => value > classNumber && value < 200)
        .sort((a, b) => a - b);
    return later.length ? getClassDisplayName(later[0]) : null;
};

/** The enrollment's subject names, in the group's order (the class's General group if none). */
const loadSubjects = async (adminId, enrollment) => {
    const group = enrollment.groupId
        ? await SubjectGroupModel.findOne({ adminId, _id: enrollment.groupId }, 'subjectIds').lean()
        : await SubjectGroupModel.findOne({ adminId, classId: enrollment.classId, isSystemGroup: true }, 'subjectIds').lean();
    const ids = (group && group.subjectIds) || [];
    if (!ids.length) return [];
    const subjects = await SubjectModel.find({ adminId, _id: { $in: ids } }, 'name').lean();
    const names = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
    return ids.map((id) => names.get(String(id))).filter(Boolean);
};

/**
 * Working days (resolver: holidays/weekly-offs excluded, the student's own leave NOT
 * excluded — a leave day is still a school working day) and days present (Present/Late = 1,
 * HalfDay = ½) from session start to the leaving date.
 */
const loadAttendance = async (adminId, sessionId, studentId, leavingKey) => {
    const session = await AcademicSessionV2Model.findOne({ adminId, _id: sessionId }, 'startDate endDate').lean();
    if (!session) return { workingDays: 0, presentDays: 0 };
    const fromKey = toDateKey(session.startDate);
    const endKey = toDateKey(session.endDate);
    const toKey = leavingKey < endKey ? leavingKey : endKey;
    if (toKey < fromKey) return { workingDays: 0, presentDays: 0 };

    const person = { personType: 'student', personId: String(studentId) };
    const [dayTypes, records] = await Promise.all([
        resolveDays(adminId, { sessionId, people: [person], fromKey, toKey, includeLeave: false }),
        AttendanceRecordV2Model.find(
            { adminId, personType: 'student', personId: String(studentId), dateKey: { $gte: fromKey, $lte: toKey }, deletedAt: null },
            { dateKey: 1, status: 1 }
        ).lean(),
    ]);
    const types = dayTypes.get(personKey('student', studentId)) || new Map();
    const workingKeys = new Set([...types].filter(([, type]) => type === DAY_TYPE.WORKING).map(([key]) => key));
    const present = records.reduce((sum, row) => {
        if (!workingKeys.has(row.dateKey)) return sum;
        if (row.status === 'Present' || row.status === 'Late') return sum + 1;
        if (row.status === 'HalfDay') return sum + 0.5;
        return sum;
    }, 0);
    const workingDays = Math.min(workingKeys.size, MAX_WORKING_DAYS);
    return { workingDays, presentDays: Math.min(money(present), workingDays) };
};

/** Everything still owed across sessions, from the shared Fees ledger. */
const loadTotalDue = async (adminId, studentId, sessionId) => {
    const data = (await loadLedgerData(adminId, [studentId])).get(String(studentId));
    if (!data || !data.records.length) return 0;
    const { ledger } = ledgerFor(data, sessionId);
    return (ledger || buildLedger(data.records, data.payments)).totals.totalDue;
};

/**
 * One student's TC context for a session. 404 (never 403) for a missing or other-school
 * student, or one with no placement in this session (errors.md shape 4).
 */
const loadStudentContext = async (adminId, studentId, sessionId, leavingKey) => {
    if (!isObjectId(studentId)) throw notFound({ studentId });
    const [profile, enrollment] = await Promise.all([
        StudentProfileModel.findOne({ adminId, _id: studentId }).lean(),
        StudentEnrollmentModel.findOne({ adminId, studentId, sessionId }).lean(),
    ]);
    if (!profile) throw notFound({ studentId });
    if (!enrollment) {
        throw new NotFoundError(messages.notEnrolled(), { module: MODULE, code: 'NOT_FOUND', context: { studentId, sessionId } });
    }
    const [classIndex, subjects, attendance, totalDue] = await Promise.all([
        loadClassIndex(adminId),
        loadSubjects(adminId, enrollment),
        loadAttendance(adminId, sessionId, studentId, leavingKey),
        loadTotalDue(adminId, studentId, sessionId),
    ]);
    const labels = describePlacement(classIndex, enrollment);
    return {
        profile,
        enrollment,
        placement: {
            className: labels.className,
            streamName: labels.streamName,
            sectionName: labels.sectionName,
            nextClassName: nextClassName(classIndex, enrollment.class),
            subjects,
        },
        attendance,
        totalDue,
    };
};

module.exports = {
    MODULE,
    PERMISSIONS,
    actorOf,
    canEditOf,
    isObjectId,
    toObjectId,
    notFound,
    requireSessionId,
    ensureStructure,
    issuedCountOf,
    nextClassName,
    loadStudentContext,
};
