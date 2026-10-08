'use strict';
const mongoose = require('mongoose');
const LeaveTypeV2Model = require('../../models/leave/leave-type');
const LeaveLimitV2Model = require('../../models/leave/leave-limit');
const ClassLeaveDefaultV2Model = require('../../models/leave/class-leave-default');
const StaffV2Model = require('../../models/staff/staff');
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { ValidationError, NotFoundError } = require('../../errors');
const messages = require('../messages/leave.messages');
const { findSessionId, getActiveSession } = require('../academic-session/session-resolver');
const { loadClassIndex, describePlacement } = require('../student/student.utils');
const { escapeRegExp } = require('../staff/lookups');
const { toDateKey } = require('../date-only');
const { nowWallClock } = require('../attendance-time');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { classKey, effectiveLimit, isApplicable } = require('./leave-rules');

// Shared pieces of the three Leave controllers: the school's "today", session resolution,
// the cached Leave Type list, the Person Type → Dept/Class people filter, and the batched
// effective-limit lookup (own LeaveLimit, else the inherited class default).
const MODULE = 'leave';
const MAX_PEOPLE = 2000;
const { ObjectId } = mongoose.Types;

const todayKey = () => toDateKey(nowWallClock());
const actorOf = (req) => String((req.user && (req.user.staffId || req.user.id)) || req.staffId || 'admin');

/** The header's session label → its id, falling back to the active session. */
const resolveSessionId = async (adminId, label) => {
    if (label) {
        const id = await findSessionId(adminId, label);
        if (id) return String(id);
    }
    const active = await getActiveSession(adminId);
    if (!active) throw new ValidationError(messages.sessionMissing(), { module: MODULE, code: 'SESSION_MISSING' });
    return String(active._id);
};

// ---- Leave Types (the module's one near-static cached list) -------------------------------

const toTypeRow = (row) => ({
    _id: String(row._id),
    name: row.name,
    whoCanTake: row.whoCanTake,
    defaultDays: row.defaultDays,
    isPaid: row.isPaid,
    status: row.status,
});

/** Every leave type, sorted by name — `{adminId}:leave:types`. */
const loadLeaveTypes = (adminId) => cacheService.wrap(
    cacheKeys.leave.types(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const rows = await LeaveTypeV2Model.find({ adminId }).sort({ name: 1 }).collation({ locale: 'en', strength: 2 }).lean();
        return rows.map(toTypeRow);
    }
);

/** Active types a person type may take — the Apply Leave dropdown. */
const loadApplicableTypes = (adminId, personType) => cacheService.wrap(
    cacheKeys.leave.typesApplicable(adminId, personType),
    cacheService.TTL.NEAR_STATIC_45,
    async () => (await loadLeaveTypes(adminId)).filter((row) => row.status === 'active' && isApplicable(row.whoCanTake, personType))
);

const typeNotFound = () => new NotFoundError(messages.typeNotFound(), {
    module: MODULE,
    code: 'LEAVE_TYPE_NOT_FOUND',
    fields: [{ field: 'leaveTypeId', message: messages.typeNotFound(), code: 'LEAVE_TYPE_NOT_FOUND' }],
});

/** Same-tenant leave types by id; LEAVE_TYPE_NOT_FOUND when any is missing. */
const loadTypesById = async (adminId, ids) => {
    const unique = [...new Set(ids.map(String))];
    const rows = await LeaveTypeV2Model.find({ adminId, _id: { $in: unique } }).lean();
    if (rows.length !== unique.length) throw typeNotFound();
    return new Map(rows.map((row) => [String(row._id), toTypeRow(row)]));
};

// ---- People -------------------------------------------------------------------------------

const toObjectId = (value) => (value ? new ObjectId(String(value)) : null);

/**
 * People matching the shared Person Type → Dept/Designation | Class/Stream/Group/Section
 * filter. Returns rows `{ _id, name, code, sub, departmentName, placement }`, capped.
 */
const findPeople = async (adminId, sessionId, filters) => {
    const { personType, departmentId, designationId, classId, streamId, groupId, sectionId, search } = filters;
    const pattern = search ? new RegExp(escapeRegExp(search), 'i') : null;

    if (personType === 'staff') {
        const filter = { adminId, status: 'active' };
        if (departmentId) filter.departmentId = departmentId;
        if (designationId) filter.designationId = designationId;
        if (pattern) filter.$or = [{ name: pattern }, { empCode: pattern }];
        const rows = await StaffV2Model.find(filter, { name: 1, empCode: 1, department: 1, designation: 1 })
            .sort({ name: 1 }).limit(MAX_PEOPLE + 1).lean();
        return {
            truncated: rows.length > MAX_PEOPLE,
            rows: rows.slice(0, MAX_PEOPLE).map((row) => ({
                _id: String(row._id),
                name: row.name,
                code: row.empCode || null,
                department: row.department || null,
                sub: row.designation || 'Staff',
            })),
        };
    }

    const match = { adminId, sessionId: toObjectId(sessionId) };
    if (classId) match.classId = toObjectId(classId);
    if (streamId) match.streamId = toObjectId(streamId);
    if (groupId) match.groupId = toObjectId(groupId);
    if (sectionId) match.sectionId = toObjectId(sectionId);
    const [enrollments, classIndex] = await Promise.all([
        StudentEnrollmentModel.find(match, { studentId: 1, classId: 1, streamId: 1, sectionId: 1, class: 1 }).lean(),
        loadClassIndex(adminId),
    ]);
    const byStudent = new Map(enrollments.map((row) => [String(row.studentId), row]));
    const profileFilter = { adminId, _id: { $in: enrollments.map((row) => row.studentId) } };
    if (pattern) profileFilter.name = pattern;
    const students = await StudentProfileModel.find(profileFilter, { name: 1, admissionNo: 1 })
        .sort({ nameLower: 1 }).limit(MAX_PEOPLE + 1).lean();
    return {
        truncated: students.length > MAX_PEOPLE,
        rows: students.slice(0, MAX_PEOPLE).map((row) => {
            const enrollment = byStudent.get(String(row._id));
            return {
                _id: String(row._id),
                name: row.name,
                code: row.admissionNo != null ? String(row.admissionNo) : null,
                department: null,
                sub: describePlacement(classIndex, enrollment).tag || 'Student',
                placement: enrollment ? placementOf(enrollment) : null,
            };
        }),
    };
};

const placementOf = (enrollment) => ({
    classId: String(enrollment.classId),
    streamId: enrollment.streamId ? String(enrollment.streamId) : null,
    sectionId: enrollment.sectionId ? String(enrollment.sectionId) : null,
});

/**
 * Display info for specific people: Map<"type|id", { name, code, sub, placement }>.
 * Students are placed by their enrollment in `sessionId`.
 */
const describePeople = async (adminId, sessionId, people) => {
    const staffIds = people.filter((p) => p.personType === 'staff').map((p) => p.personId);
    const studentIds = people.filter((p) => p.personType === 'student').map((p) => p.personId);
    const valid = (ids) => ids.filter((id) => ObjectId.isValid(id));
    const [staff, students, enrollments, classIndex] = await Promise.all([
        staffIds.length ? StaffV2Model.find({ adminId, _id: { $in: valid(staffIds) } }, { name: 1, empCode: 1, designation: 1, department: 1, status: 1 }).lean() : [],
        studentIds.length ? StudentProfileModel.find({ adminId, _id: { $in: valid(studentIds) } }, { name: 1, admissionNo: 1 }).lean() : [],
        studentIds.length ? StudentEnrollmentModel.find({ adminId, sessionId: toObjectId(sessionId), studentId: { $in: valid(studentIds).map(toObjectId) } }, { studentId: 1, classId: 1, streamId: 1, sectionId: 1, class: 1 }).lean() : [],
        studentIds.length ? loadClassIndex(adminId) : null,
    ]);
    const map = new Map();
    staff.forEach((row) => map.set(`staff|${row._id}`, {
        name: row.name, code: row.empCode || null, sub: row.designation || 'Staff', department: row.department || null, status: row.status, placement: null,
    }));
    const byStudent = new Map(enrollments.map((row) => [String(row.studentId), row]));
    students.forEach((row) => {
        const enrollment = byStudent.get(String(row._id));
        map.set(`student|${row._id}`, {
            name: row.name,
            code: row.admissionNo != null ? String(row.admissionNo) : null,
            sub: enrollment ? describePlacement(classIndex, enrollment).tag : 'Student',
            department: null,
            status: 'active',
            placement: enrollment ? placementOf(enrollment) : null,
        });
    });
    return map;
};

/**
 * Effective limits for many (person, type) pairs in two-three queries regardless of count:
 * Map<"type|id|leaveTypeId", effective | null>. Never cached — balances are live.
 * `people` items carry `placement` for students (from describePeople/findPeople).
 */
const resolveEffectiveLimits = async (adminId, sessionId, people, leaveTypeIds, dbSession) => {
    const result = new Map();
    if (!people.length || !leaveTypeIds.length) return result;
    const limits = await LeaveLimitV2Model.find({
        adminId,
        sessionId,
        personId: { $in: people.map((p) => p.personId) },
        leaveTypeId: { $in: leaveTypeIds },
    }).session(dbSession || null).lean();
    const own = new Map(limits.map((row) => [`${row.personType}|${row.personId}|${row.leaveTypeId}`, row]));

    const placed = people.filter((p) => p.personType === 'student' && p.placement);
    let defaults = new Map();
    if (placed.length) {
        const classIds = [...new Set(placed.map((p) => p.placement.classId))];
        const rows = await ClassLeaveDefaultV2Model.find({ adminId, sessionId, classId: { $in: classIds }, leaveTypeId: { $in: leaveTypeIds } })
            .session(dbSession || null).lean();
        defaults = new Map(rows.map((row) => [`${classKey(row)}|${row.leaveTypeId}`, row]));
    }

    people.forEach((person) => leaveTypeIds.forEach((typeId) => {
        const key = `${person.personType}|${person.personId}|${typeId}`;
        const classDefault = person.placement ? defaults.get(`${classKey(person.placement)}|${typeId}`) : null;
        result.set(key, effectiveLimit(own.get(key), classDefault));
    }));
    return result;
};

module.exports = {
    MODULE,
    MAX_PEOPLE,
    todayKey,
    actorOf,
    resolveSessionId,
    toTypeRow,
    loadLeaveTypes,
    loadApplicableTypes,
    loadTypesById,
    typeNotFound,
    findPeople,
    describePeople,
    placementOf,
    resolveEffectiveLimits,
    toObjectId,
};
