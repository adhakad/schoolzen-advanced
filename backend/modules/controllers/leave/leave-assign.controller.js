'use strict';
const LeaveLimitV2Model = require('../../models/leave/leave-limit');
const ClassLeaveDefaultV2Model = require('../../models/leave/class-leave-default');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { ValidationError, ConflictError, NotFoundError } = require('../../errors');
const messages = require('../../helpers/messages/leave.messages');
const { withTransaction } = require('../../helpers/with-transaction');
const { loadClassIndex } = require('../../helpers/student/student.utils');
const { allows } = require('../../middleware/require-permission');
const {
    MODULE, actorOf, resolveSessionId, loadLeaveTypes, loadTypesById, findPeople, describePeople, resolveEffectiveLimits, toObjectId,
} = require('../../helpers/leave/context');
const { classKey, isApplicable } = require('../../helpers/leave/leave-rules');
const { buildHierarchy } = require('../attendance/roster.controller');
const { logActivity } = require('../../services/activity-log.service');

// Leave Assign (leave-assign.md) — each person's yearly allowance per leave type.
//
// Staff: one row per person × ONE COLUMN PER ACTIVE LEAVE TYPE (dynamic, from the type list).
// Students: one row per class/stream/section; saving fans out one LeaveLimit per enrolled
// student. A class row expands to its students, where one student's limit can be overridden
// (source:'override'). A class re-assign never touches an override unless the admin
// confirms (`overwriteOverrides` + `confirmed`); a student admitted later inherits the
// class default (helpers/leave/context.js resolveEffectiveLimits).
//
// Every route here is gated on the 'leave-limit' permission (routes file), and every write
// is in the activity log with who, what, and old → new.

const forbiddenFor = (personType) => (personType === 'staff' ? 'students' : 'staff');

/** Active types a person type may take — the grid's dynamic columns. */
const columnTypes = async (adminId, personType) => (await loadLeaveTypes(adminId))
    .filter((row) => row.status === 'active' && row.whoCanTake !== forbiddenFor(personType));

const canAssignOf = (req) => Boolean(req.permissions && allows(req.permissions, 'leave-limit', 'edit'));

const selectionEmpty = () => new ValidationError(messages.selectionEmpty(), { module: MODULE, code: 'VALIDATION_FAILED' });

/** Every item's type must be this school's, active, and allowed for the person type. */
const assertItemTypes = async (adminId, items, personType) => {
    const types = await loadTypesById(adminId, items.map((item) => item.leaveTypeId));
    items.forEach((item) => {
        const type = types.get(item.leaveTypeId);
        if (type.status !== 'active') throw new ValidationError(messages.typeInactive(), { module: MODULE, code: 'LEAVE_TYPE_INACTIVE' });
        if (!isApplicable(type.whoCanTake, personType)) {
            throw new ValidationError(messages.typeNotApplicable(personType === 'staff' ? 'staff member' : 'student'), { module: MODULE, code: 'LEAVE_TYPE_NOT_APPLICABLE' });
        }
    });
    return types;
};

// ---- staff ----------------------------------------------------------------------------------

let GetStaffGrid = async (req, res) => {
    const { adminId, session, page, limit } = req.query;
    const sessionId = await resolveSessionId(adminId, session);
    const [people, types] = await Promise.all([
        findPeople(adminId, sessionId, { ...req.query, personType: 'staff' }),
        columnTypes(adminId, 'staff'),
    ]);
    const typeIds = types.map((row) => row._id);
    const allLimits = await LeaveLimitV2Model.find({ adminId, sessionId, personType: 'staff', leaveTypeId: { $in: typeIds }, personId: { $in: people.rows.map((row) => row._id) } }).lean();
    const byPerson = new Map();
    allLimits.forEach((row) => {
        if (!byPerson.has(row.personId)) byPerson.set(row.personId, {});
        byPerson.get(row.personId)[row.leaveTypeId] = { allocated: row.allocatedDays, used: row.usedDays };
    });
    const fullySet = people.rows.filter((row) => typeIds.every((id) => (byPerson.get(row._id) || {})[id])).length;
    const rows = people.rows.slice((page - 1) * limit, page * limit).map((row) => {
        const own = byPerson.get(row._id) || {};
        const limits = {};
        typeIds.forEach((id) => { limits[id] = own[id] || null; });
        return { _id: row._id, name: row.name, code: row.code, department: row.department, sub: row.sub, limits };
    });
    return res.status(200).json({
        leaveTypes: types,
        rows,
        total: people.rows.length,
        page,
        limit,
        truncated: people.truncated,
        summary: { people: people.rows.length, fullySet, types: types.length },
        canAssign: canAssignOf(req),
    });
};

/** Set Leave Limit for selected staff: inserts only — anyone already set keeps theirs. */
let BulkAssignStaff = async (req, res) => {
    const { adminId, session, personIds, items } = req.body;
    if (!personIds.length || !items.length) throw selectionEmpty();
    const sessionId = await resolveSessionId(adminId, session);
    await assertItemTypes(adminId, items, 'staff');
    const people = await describePeople(adminId, sessionId, personIds.map((personId) => ({ personType: 'staff', personId })));
    const valid = personIds.filter((id) => (people.get(`staff|${id}`) || {}).status === 'active');
    if (!valid.length) throw new NotFoundError(messages.personNotFound(), { module: MODULE, code: 'PERSON_NOT_FOUND' });

    const now = new Date();
    const actor = actorOf(req);
    const ops = [];
    valid.forEach((personId) => items.forEach((item) => ops.push({
        updateOne: {
            filter: { adminId, sessionId, personType: 'staff', personId, leaveTypeId: item.leaveTypeId },
            update: { $setOnInsert: { allocatedDays: item.days, usedDays: 0, source: 'staff', updatedBy: actor, createdAt: now, updatedAt: now } },
            upsert: true,
        },
    })));
    // One bulkWrite, never N single updates (leave-assign.md).
    const result = await LeaveLimitV2Model.bulkWrite(ops, { ordered: false });
    const assigned = result.upsertedCount || 0;
    const skipped = ops.length - assigned;
    await logActivity(req, {
        module: MODULE, action: 'leave.limit.staff.bulk',
        meta: { personIds: valid, items, assigned, skipped },
        changes: { before: null, after: { items } },
    });
    return res.status(200).json({ message: messages.staffAssigned(assigned, skipped), assignedCount: assigned, skippedCount: skipped, failed: personIds.length - valid.length });
};

// ---- students (class rows) ------------------------------------------------------------------

/** Class → Stream → Section rows (Roster's hierarchy), narrowed by the toolbar's filters. */
const leafRows = async (adminId, filters) => {
    const classIndex = await loadClassIndex(adminId);
    return buildHierarchy(classIndex).filter((row) => {
        if (filters.classId && row.classId !== filters.classId) return false;
        if (filters.streamId && row.streamId && row.streamId !== filters.streamId) return false;
        if (filters.sectionId && row.selectable && row.sectionId !== filters.sectionId) return false;
        return true;
    });
};

const enrollmentMatch = (adminId, sessionId, target) => ({
    adminId,
    sessionId: toObjectId(sessionId),
    classId: toObjectId(target.classId),
    streamId: target.streamId ? toObjectId(target.streamId) : null,
    sectionId: target.sectionId ? toObjectId(target.sectionId) : null,
});

let GetClassGrid = async (req, res) => {
    const { adminId, session } = req.query;
    const sessionId = await resolveSessionId(adminId, session);
    const [rows, types] = await Promise.all([leafRows(adminId, req.query), columnTypes(adminId, 'student')]);
    const typeIds = types.map((row) => row._id);
    const [defaults, studentCounts, overrides] = await Promise.all([
        ClassLeaveDefaultV2Model.find({ adminId, sessionId, leaveTypeId: { $in: typeIds } }).lean(),
        StudentEnrollmentModel.aggregate([
            { $match: { adminId, sessionId: toObjectId(sessionId) } },
            { $group: { _id: { classId: '$classId', streamId: '$streamId', sectionId: '$sectionId' }, count: { $sum: 1 } } },
        ]),
        LeaveLimitV2Model.find({ adminId, sessionId, personType: 'student', source: 'override', leaveTypeId: { $in: typeIds } }, 'personId leaveTypeId').lean(),
    ]);
    const defaultsByKey = new Map(defaults.map((row) => [`${classKey(row)}|${row.leaveTypeId}`, row.allocatedDays]));
    const counts = new Map(studentCounts.map((row) => [classKey({
        classId: String(row._id.classId), streamId: row._id.streamId ? String(row._id.streamId) : null, sectionId: row._id.sectionId ? String(row._id.sectionId) : null,
    }), row.count]));

    // Overrides per class row: the overridden students' placements in this session.
    const overrideCounts = new Map();
    if (overrides.length) {
        const enrollments = await StudentEnrollmentModel.find(
            { adminId, sessionId: toObjectId(sessionId), studentId: { $in: [...new Set(overrides.map((row) => row.personId))].map(toObjectId) } },
            'studentId classId streamId sectionId'
        ).lean();
        const placeOf = new Map(enrollments.map((row) => [String(row.studentId), classKey({
            classId: String(row.classId), streamId: row.streamId ? String(row.streamId) : null, sectionId: row.sectionId ? String(row.sectionId) : null,
        })]));
        overrides.forEach((row) => {
            const key = `${placeOf.get(row.personId)}|${row.leaveTypeId}`;
            overrideCounts.set(key, (overrideCounts.get(key) || 0) + 1);
        });
    }

    const result = rows.map((row) => {
        const key = classKey(row);
        const limits = {};
        if (row.selectable) {
            typeIds.forEach((id) => {
                const allocated = defaultsByKey.get(`${key}|${id}`);
                limits[id] = { allocated: allocated == null ? null : allocated, overrides: overrideCounts.get(`${key}|${id}`) || 0 };
            });
        }
        return { ...row, key, students: row.selectable ? counts.get(key) || 0 : null, limits };
    });
    const leaves = result.filter((row) => row.selectable);
    return res.status(200).json({
        leaveTypes: types,
        rows: result,
        summary: { classes: leaves.length, fullySet: leaves.filter((row) => typeIds.every((id) => row.limits[id].allocated != null)).length, types: types.length },
        canAssign: canAssignOf(req),
    });
};

/** One class row expanded: its students with effective limits (own, override or inherited). */
let GetClassStudents = async (req, res) => {
    const { adminId, session, classId, streamId, sectionId, groupId } = req.query;
    const sessionId = await resolveSessionId(adminId, session);
    const match = enrollmentMatch(adminId, sessionId, { classId, streamId, sectionId });
    if (groupId) match.groupId = toObjectId(groupId);
    const [enrollments, types] = await Promise.all([
        StudentEnrollmentModel.find(match, 'studentId').lean(),
        columnTypes(adminId, 'student'),
    ]);
    const studentIds = enrollments.map((row) => String(row.studentId));
    const people = await describePeople(adminId, sessionId, studentIds.map((personId) => ({ personType: 'student', personId })));
    const subjects = studentIds.filter((id) => people.has(`student|${id}`)).map((personId) => ({ personType: 'student', personId, placement: people.get(`student|${personId}`).placement }));
    const typeIds = types.map((row) => row._id);
    const limits = await resolveEffectiveLimits(adminId, sessionId, subjects, typeIds);
    const rows = subjects.map((subject) => {
        const person = people.get(`student|${subject.personId}`);
        const cells = {};
        typeIds.forEach((id) => {
            const effective = limits.get(`student|${subject.personId}|${id}`);
            cells[id] = effective ? { allocated: effective.allocatedDays, used: effective.usedDays, source: effective.source, inherited: Boolean(effective.inherited) } : null;
        });
        return { _id: subject.personId, name: person.name, code: person.code, limits: cells };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ leaveTypes: types, rows });
};

/**
 * Set a class's default for each ticked type, then fan it out to every enrolled student.
 * Overrides stay unless the admin confirmed overwriting them (409 LEAVE_OVERRIDES_EXIST
 * first, with the count). A limit is never set below what a student has already used.
 */
let AssignClasses = async (req, res) => {
    const { adminId, session, targets, items, overwriteOverrides, confirmed } = req.body;
    if (!targets.length || !items.length) throw selectionEmpty();
    const sessionId = await resolveSessionId(adminId, session);
    await assertItemTypes(adminId, items, 'student');

    const leaves = new Set((await leafRows(adminId, {})).filter((row) => row.selectable).map((row) => classKey(row)));
    const valid = targets.filter((target) => leaves.has(classKey(target)));
    if (!valid.length) throw new NotFoundError(messages.notFound(), { module: MODULE, code: 'NOT_FOUND' });

    // Who sits in each target class this session.
    const enrollments = await Promise.all(valid.map((target) => StudentEnrollmentModel.find(enrollmentMatch(adminId, sessionId, target), 'studentId').lean()));
    const studentsByTarget = valid.map((target, i) => ({ target, studentIds: enrollments[i].map((row) => String(row.studentId)) }));
    const allStudentIds = [...new Set(studentsByTarget.flatMap((entry) => entry.studentIds))];
    const typeIds = items.map((item) => item.leaveTypeId);
    const daysOf = new Map(items.map((item) => [item.leaveTypeId, item.days]));

    const existing = await LeaveLimitV2Model.find({ adminId, sessionId, personType: 'student', personId: { $in: allStudentIds }, leaveTypeId: { $in: typeIds } }).lean();
    const overrides = existing.filter((row) => row.source === 'override');
    if (overrides.length && !(overwriteOverrides && confirmed)) {
        const message = messages.overridesExist(new Set(overrides.map((row) => row.personId)).size);
        throw new ConflictError(message, {
            module: MODULE,
            code: 'LEAVE_OVERRIDES_EXIST',
            // Field-bound so the page answers it with its own confirm step, not a toast.
            fields: [{ field: 'overwriteOverrides', message, code: 'LEAVE_OVERRIDES_EXIST' }],
            rows: [{ row: 0, code: 'LEAVE_OVERRIDES_EXIST', count: overrides.length, students: new Set(overrides.map((row) => row.personId)).size }],
        });
    }
    const belowUsed = existing.filter((row) => row.usedDays > daysOf.get(row.leaveTypeId));
    if (belowUsed.length) {
        throw new ValidationError(messages.limitBelowUsed(Math.max(...belowUsed.map((row) => row.usedDays))), { module: MODULE, code: 'LEAVE_LIMIT_BELOW_USED' });
    }

    const beforeDefaults = await ClassLeaveDefaultV2Model.find({ adminId, sessionId, leaveTypeId: { $in: typeIds }, classId: { $in: valid.map((t) => t.classId) } }).lean();
    const beforeByKey = new Map(beforeDefaults.map((row) => [`${classKey(row)}|${row.leaveTypeId}`, row.allocatedDays]));

    const now = new Date();
    const actor = actorOf(req);
    const defaultOps = [];
    valid.forEach((target) => items.forEach((item) => defaultOps.push({
        updateOne: {
            filter: { adminId, sessionId, classId: target.classId, streamId: target.streamId || null, sectionId: target.sectionId || null, leaveTypeId: item.leaveTypeId },
            update: { $set: { allocatedDays: item.days, updatedBy: actor, updatedAt: now }, $setOnInsert: { createdAt: now } },
            upsert: true,
        },
    })));
    const limitOps = [];
    allStudentIds.forEach((personId) => typeIds.forEach((leaveTypeId) => {
        limitOps.push({
            updateOne: {
                filter: { adminId, sessionId, personType: 'student', personId, leaveTypeId },
                update: {
                    $set: { allocatedDays: daysOf.get(leaveTypeId), source: 'class', updatedBy: actor, updatedAt: now },
                    $setOnInsert: { usedDays: 0, createdAt: now },
                },
                upsert: true,
            },
        });
    }));

    await withTransaction(async (dbSession) => {
        await ClassLeaveDefaultV2Model.bulkWrite(defaultOps, { session: dbSession, ordered: true });
        if (limitOps.length) await LeaveLimitV2Model.bulkWrite(limitOps, { session: dbSession, ordered: true });
    });

    // Audit: one entry per class × type (old → new default), with any overwritten overrides.
    for (const target of valid) {
        for (const item of items) {
            const key = `${classKey(target)}|${item.leaveTypeId}`;
            const studentIds = studentsByTarget.find((entry) => classKey(entry.target) === classKey(target)).studentIds;
            const overwritten = overrides
                .filter((row) => row.leaveTypeId === item.leaveTypeId && studentIds.includes(row.personId))
                .map((row) => ({ personId: row.personId, before: row.allocatedDays, after: item.days }));
            await logActivity(req, {
                module: MODULE,
                action: overwritten.length ? 'leave.limit.class.assign-overwrite' : 'leave.limit.class.assign',
                targetId: classKey(target),
                meta: { leaveTypeId: item.leaveTypeId, students: studentIds.length, overridesOverwritten: overwritten },
                changes: { before: { allocatedDays: beforeByKey.has(key) ? beforeByKey.get(key) : null }, after: { allocatedDays: item.days } },
            });
        }
    }

    return res.status(200).json({ message: messages.classAssigned(valid.length, allStudentIds.length), classes: valid.length, students: allStudentIds.length, failed: targets.length - valid.length });
};

/** One person's limit for one type — a staff edit, or a student override. */
let SetPersonLimit = async (req, res) => {
    const { adminId, session, personType, personId, leaveTypeId, days } = req.body;
    const sessionId = await resolveSessionId(adminId, session);
    await assertItemTypes(adminId, [{ leaveTypeId, days }], personType);
    const people = await describePeople(adminId, sessionId, [{ personType, personId }]);
    const person = people.get(`${personType}|${personId}`);
    if (!person || person.status !== 'active' || (personType === 'student' && !person.placement)) {
        throw new NotFoundError(messages.personNotFound(), { module: MODULE, code: 'PERSON_NOT_FOUND' });
    }
    const key = { adminId, sessionId, personType, personId, leaveTypeId };
    const before = await LeaveLimitV2Model.findOne(key).lean();
    if (before && before.usedDays > days) {
        throw new ValidationError(messages.limitBelowUsed(before.usedDays), {
            module: MODULE, code: 'LEAVE_LIMIT_BELOW_USED', fields: [{ field: 'days', message: messages.limitBelowUsed(before.usedDays), code: 'LEAVE_LIMIT_BELOW_USED' }],
        });
    }
    const now = new Date();
    // Guarded on usedDays so a concurrent approval can't slip under the new limit.
    const saved = await LeaveLimitV2Model.findOneAndUpdate(
        { ...key, $or: [{ usedDays: { $lte: days } }, { usedDays: { $exists: false } }] },
        {
            $set: { allocatedDays: days, source: personType === 'staff' ? 'staff' : 'override', updatedBy: actorOf(req), updatedAt: now },
            $setOnInsert: { usedDays: 0, createdAt: now },
        },
        { upsert: true, new: true }
    ).lean().catch((error) => {
        if (error && error.code === 11000) throw new ValidationError(messages.limitBelowUsed(days), { module: MODULE, code: 'LEAVE_LIMIT_BELOW_USED' });
        throw error;
    });
    await logActivity(req, {
        module: MODULE,
        action: personType === 'staff' ? 'leave.limit.staff.set' : 'leave.limit.student.override',
        targetId: personId,
        meta: { personType, leaveTypeId, name: person.name },
        changes: { before: before ? { allocatedDays: before.allocatedDays, source: before.source } : null, after: { allocatedDays: saved.allocatedDays, source: saved.source } },
    });
    return res.status(200).json({ message: messages.limitSaved(), limit: { allocated: saved.allocatedDays, used: saved.usedDays, source: saved.source } });
};

module.exports = {
    GetStaffGrid,
    BulkAssignStaff,
    GetClassGrid,
    GetClassStudents,
    AssignClasses,
    SetPersonLimit,
};
