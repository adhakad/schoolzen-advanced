'use strict';
const LeaveRequestV2Model = require('../../models/leave/leave-request');
const LeaveTypeV2Model = require('../../models/leave/leave-type');
const LeaveLimitV2Model = require('../../models/leave/leave-limit');
const ClassLeaveDefaultV2Model = require('../../models/leave/class-leave-default');
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const { ValidationError, NotFoundError, ConflictError } = require('../../errors');
const messages = require('../../helpers/messages/leave.messages');
const { withTransaction } = require('../../helpers/with-transaction');
const { toUtcMidnight } = require('../../helpers/date-only');
const { registerStudentDeleteStep } = require('../../helpers/student/student.utils');
const {
    MODULE, todayKey, actorOf, resolveSessionId, loadLeaveTypes, typeNotFound, findPeople, describePeople, resolveEffectiveLimits,
} = require('../../helpers/leave/context');
const {
    MAX_RANGE_DAYS, eachDayKey, expandWorkingDays, actionsForStatus, isApplicable, effectiveLimit, remainingOf, exceedsBalance,
} = require('../../helpers/leave/leave-rules');
const liveStats = require('../../services/attendance-v2/live-stats');
const { logActivity } = require('../../services/activity-log.service');
const logger = require('../../helpers/logger');

// Leave Requests (leave-requests.md) — every request across staff and students.
//
// Concurrency (errors.md shape 9): every status change is ONE conditional write on the
// current status inside the transaction — a second, concurrent approve finds nothing to
// update and gets LEAVE_ALREADY_ACTIONED instead of double-deducting usedDays. The usedDays
// increment itself is also conditional on the remaining balance, so two approvals of
// different requests can never together exceed an allocation.

const PEOPLE_OPTION_LIMIT = 50;

// ---- errors ---------------------------------------------------------------------------------

const fail = (Type, message, code, field) => new Type(message, {
    module: MODULE,
    code,
    fields: field ? [{ field, message, code }] : undefined,
});
const requestNotFound = (id) => new NotFoundError(messages.requestNotFound(), { module: MODULE, code: 'LEAVE_REQUEST_NOT_FOUND', context: { id } });
const balanceExceeded = (typeName, left, requested) => fail(ValidationError, messages.balanceExceeded(typeName, left, requested), 'LEAVE_BALANCE_EXCEEDED', 'leaveTypeId');

/** Why a conditional status write matched nothing: gone, raced, or simply not Pending. */
const explainNoMatch = async (adminId, id, raceStatus) => {
    const current = await LeaveRequestV2Model.findOne({ _id: id, adminId }, 'status').lean();
    if (!current) throw requestNotFound(id);
    if (current.status === raceStatus) {
        throw new ConflictError(messages.alreadyActioned(), { module: MODULE, code: 'LEAVE_ALREADY_ACTIONED' });
    }
    throw new ConflictError(messages.notPending(current.status), { module: MODULE, code: 'LEAVE_NOT_PENDING' });
};

// ---- list -----------------------------------------------------------------------------------

const monthBounds = (month) => {
    const [year, mon] = month.split('-').map(Number);
    const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
};

const hasPersonFilter = (q) => Boolean(q.search || q.departmentId || q.designationId || q.classId || q.streamId || q.groupId || q.sectionId);

/** Table rows: person, type name, live "days left", and the ONE action set its status allows. */
const decorate = async (adminId, sessionId, requests) => {
    const people = await describePeople(adminId, sessionId, requests.map((row) => ({ personType: row.personType, personId: row.personId })));
    const types = new Map((await loadLeaveTypes(adminId)).map((row) => [row._id, row]));
    const subjects = [];
    const seen = new Set();
    requests.forEach((row) => {
        const key = `${row.personType}|${row.personId}`;
        if (seen.has(key)) return;
        seen.add(key);
        subjects.push({ personType: row.personType, personId: row.personId, placement: (people.get(key) || {}).placement || null });
    });
    const limits = await resolveEffectiveLimits(adminId, sessionId, subjects, [...new Set(requests.map((row) => row.leaveTypeId))]);
    const today = todayKey();
    return requests.map((row) => {
        const person = people.get(`${row.personType}|${row.personId}`) || {};
        const type = types.get(row.leaveTypeId);
        const effective = limits.get(`${row.personType}|${row.personId}|${row.leaveTypeId}`) || null;
        return {
            _id: String(row._id),
            personType: row.personType,
            personId: row.personId,
            name: person.name || 'Unknown',
            code: person.code || null,
            sub: person.sub || null,
            leaveTypeId: row.leaveTypeId,
            // A type deleted underneath a request renders blank, flagged rather than silent.
            leaveTypeName: type ? type.name : '',
            leaveTypeMissing: !type,
            fromDate: row.fromDateKey,
            toDate: row.toDateKey,
            days: row.days,
            reason: row.reason || null,
            status: row.status,
            cancelReason: row.cancelReason || null,
            balance: effective ? { allocated: effective.allocatedDays, used: effective.usedDays, remaining: remainingOf(effective) } : null,
            actions: actionsForStatus(row.status, row.toDateKey, today),
        };
    });
};

let ListRequests = async (req, res) => {
    const q = req.query;
    const { adminId, page, limit } = q;
    const sessionId = await resolveSessionId(adminId, q.session);

    const base = { adminId, sessionId, personType: q.personType };
    if (q.month) {
        const { start, end } = monthBounds(q.month);
        base.fromDateKey = { $lte: end };
        base.toDateKey = { $gte: start };
    }
    let truncated = false;
    if (hasPersonFilter(q)) {
        const people = await findPeople(adminId, sessionId, q);
        truncated = people.truncated;
        base.personId = { $in: people.rows.map((row) => row._id) };
    }
    if (q.leaveTypeId) base.leaveTypeId = q.leaveTypeId;

    const filter = q.status ? { ...base, status: q.status } : base;
    const [total, rows, summary] = await Promise.all([
        LeaveRequestV2Model.countDocuments(filter),
        LeaveRequestV2Model.find(filter).sort({ fromDateKey: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        LeaveRequestV2Model.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const counts = { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };
    summary.forEach((row) => { counts[row._id] = row.count; });

    return res.status(200).json({ rows: await decorate(adminId, sessionId, rows), total, page, limit, summary: counts, truncated });
};

/** Apply Leave's person picker — a capped, searchable list for one person type. */
let GetPeopleOptions = async (req, res) => {
    const { adminId, session, personType, search } = req.query;
    const sessionId = await resolveSessionId(adminId, session);
    const { rows } = await findPeople(adminId, sessionId, { personType, search });
    return res.status(200).json({
        rows: rows.slice(0, PEOPLE_OPTION_LIMIT).map((row) => ({ _id: row._id, name: row.name, code: row.code, sub: row.sub })),
    });
};

/** Apply Leave's balance hint — the live effective limit, never cached. */
let GetBalance = async (req, res) => {
    const { adminId, session, personType, personId, leaveTypeId } = req.query;
    const sessionId = await resolveSessionId(adminId, session);
    const people = await describePeople(adminId, sessionId, [{ personType, personId }]);
    const person = people.get(`${personType}|${personId}`);
    if (!person) throw fail(NotFoundError, messages.personNotFound(), 'PERSON_NOT_FOUND', 'personId');
    const type = await LeaveTypeV2Model.findOne({ _id: leaveTypeId, adminId }).lean();
    if (!type) throw typeNotFound();
    const limits = await resolveEffectiveLimits(adminId, sessionId, [{ personType, personId, placement: person.placement }], [leaveTypeId]);
    const effective = limits.get(`${personType}|${personId}|${leaveTypeId}`);
    // Unassigned: the request is filed against the type's school-wide default (errors.md shape 3).
    const allocated = effective ? effective.allocatedDays : type.defaultDays;
    const used = effective ? effective.usedDays : 0;
    return res.status(200).json({ allocated, used, remaining: allocated - used, assigned: Boolean(effective) });
};

// ---- apply ----------------------------------------------------------------------------------

/** Field + business checks shared by Apply; returns the working days to charge. */
const validateRange = (fromDate, toDate, allowPastDates) => {
    const span = eachDayKey(fromDate, toDate);
    if (!span.length || span.length > MAX_RANGE_DAYS) throw fail(ValidationError, messages.dateRangeInvalid(), 'LEAVE_DATE_RANGE_INVALID', 'toDate');
    if (!allowPastDates && fromDate < todayKey()) throw fail(ValidationError, messages.pastDateBlocked(), 'LEAVE_PAST_DATE_BLOCKED', 'fromDate');
    const dateKeys = expandWorkingDays(fromDate, toDate);
    if (!dateKeys.length) throw fail(ValidationError, messages.rangeEmpty(), 'LEAVE_RANGE_EMPTY', 'toDate');
    return dateKeys;
};

const assertTypeUsable = (type, personType) => {
    if (!type) throw typeNotFound();
    if (type.status !== 'active') throw fail(ValidationError, messages.typeInactive(), 'LEAVE_TYPE_INACTIVE', 'leaveTypeId');
    if (!isApplicable(type.whoCanTake, personType)) {
        throw fail(ValidationError, messages.typeNotApplicable(personType === 'staff' ? 'staff member' : 'student'), 'LEAVE_TYPE_NOT_APPLICABLE', 'leaveTypeId');
    }
};

let CreateRequest = async (req, res) => {
    const { adminId, session, personType, personId, leaveTypeId, fromDate, toDate, reason, allowPastDates } = req.body;
    const sessionId = await resolveSessionId(adminId, session);
    const dateKeys = validateRange(fromDate, toDate, allowPastDates);

    const [people, type] = await Promise.all([
        describePeople(adminId, sessionId, [{ personType, personId }]),
        LeaveTypeV2Model.findOne({ _id: leaveTypeId, adminId }).lean(),
    ]);
    const person = people.get(`${personType}|${personId}`);
    if (!person || person.status !== 'active' || (personType === 'student' && !person.placement)) {
        throw fail(NotFoundError, messages.personNotFound(), 'PERSON_NOT_FOUND', 'personId');
    }
    assertTypeUsable(type, personType);

    // Overlap with anything still live — Rejected/Cancelled rows don't block (errors.md).
    const overlapping = await LeaveRequestV2Model.exists({
        adminId, personType, personId, status: { $in: ['Pending', 'Approved'] }, fromDateKey: { $lte: toDate }, toDateKey: { $gte: fromDate },
    });
    if (overlapping) throw fail(ConflictError, messages.overlap(), 'LEAVE_REQUEST_OVERLAP', 'fromDate');

    // A request that can never be honoured never sits in the Pending queue. Unassigned →
    // judged against the type's default (approval then requires a real assignment).
    const limits = await resolveEffectiveLimits(adminId, sessionId, [{ personType, personId, placement: person.placement }], [leaveTypeId]);
    const effective = limits.get(`${personType}|${personId}|${leaveTypeId}`)
        || effectiveLimit({ allocatedDays: type.defaultDays, usedDays: 0, source: 'default' }, null);
    if (exceedsBalance(effective, dateKeys.length)) throw balanceExceeded(type.name, remainingOf(effective), dateKeys.length);

    const created = await LeaveRequestV2Model.create({
        adminId, sessionId, personType, personId, leaveTypeId,
        fromDateKey: fromDate, toDateKey: toDate, days: dateKeys.length, reason: reason || null,
        createdBy: actorOf(req),
    });
    await logActivity(req, { module: MODULE, action: 'leave.request.create', targetId: String(created._id), meta: { personType, personId, leaveTypeId, fromDate, toDate, days: dateKeys.length } });
    const [row] = await decorate(adminId, sessionId, [created.toObject()]);
    return res.status(200).json({ message: messages.applied(), request: row });
};

// ---- approve / reject / cancel / delete -----------------------------------------------------

/** The LeaveLimit to charge — a student's inherited class default is materialized here. */
const limitForApproval = async ({ adminId, request, placement, dbSession }) => {
    const key = { adminId, sessionId: request.sessionId, personType: request.personType, personId: request.personId, leaveTypeId: request.leaveTypeId };
    const own = await LeaveLimitV2Model.findOne(key).session(dbSession).lean();
    if (own) return own;
    if (request.personType === 'student' && placement) {
        const classDefault = await ClassLeaveDefaultV2Model.findOne({
            adminId, sessionId: request.sessionId, leaveTypeId: request.leaveTypeId,
            classId: placement.classId, streamId: placement.streamId, sectionId: placement.sectionId,
        }).session(dbSession).lean();
        if (classDefault) {
            const [created] = await LeaveLimitV2Model.create([{ ...key, allocatedDays: classDefault.allocatedDays, usedDays: 0, source: 'class', updatedBy: 'leave-approval' }], { session: dbSession });
            return created.toObject();
        }
    }
    // forceApprove never bypasses this (errors.md shape 3).
    throw fail(ValidationError, messages.limitMissing(), 'LEAVE_LIMIT_MISSING', 'leaveTypeId');
};

/** Upsert 'Leave' rows for the leave's days, never over a manual correction. */
const markAttendance = async ({ adminId, request, dateKeys, dbSession }) => {
    const manual = await AttendanceRecordV2Model.find({
        adminId, personType: request.personType, personId: request.personId, dateKey: { $in: dateKeys }, isOverridden: true, updatedBy: { $ne: 'leave' },
    }, 'dateKey').session(dbSession).lean();
    const skip = new Set(manual.map((row) => row.dateKey));
    const marked = dateKeys.filter((key) => !skip.has(key));
    if (!marked.length) return marked;
    const now = new Date();
    await AttendanceRecordV2Model.bulkWrite(marked.map((dateKey) => ({
        updateOne: {
            filter: { adminId, personType: request.personType, personId: request.personId, date: toUtcMidnight(dateKey) },
            update: {
                $set: {
                    dateKey, status: 'Leave', punches: [], inTime: null, outTime: null, shiftId: null,
                    isOverridden: true, remark: `leave:${request._id}`, deletedAt: null, updatedBy: 'leave', updatedAt: now,
                },
                $setOnInsert: { createdAt: now },
            },
            upsert: true,
        },
    })), { session: dbSession, ordered: true });
    return marked;
};

/** Live Status counts include Leave — refresh today's if this leave touched it. Best effort. */
const refreshLiveStats = async (adminId, dateKeys) => {
    const today = todayKey();
    if (!dateKeys.includes(today)) return;
    try {
        await liveStats.recompute(adminId, today);
    } catch (error) {
        logger.warn('leave.liveStatsRefreshFailed', { adminId, reason: error.message });
    }
};

let ApproveRequest = async (req, res) => {
    const { adminId, forceApprove } = req.body;
    const id = req.params.id;
    const actor = actorOf(req);

    const result = await withTransaction(async (dbSession) => {
        const request = await LeaveRequestV2Model.findOneAndUpdate(
            { _id: id, adminId, status: 'Pending' },
            { $set: { status: 'Approved', actionedBy: actor, actionedAt: new Date(), updatedAt: new Date() } },
            { new: true, session: dbSession }
        ).lean();
        if (!request) await explainNoMatch(adminId, id, 'Approved');

        const type = await LeaveTypeV2Model.findOne({ _id: request.leaveTypeId, adminId }).session(dbSession).lean();
        if (!type) throw typeNotFound();
        // The calendar can change between filing and approval — recount (errors.md shape 3).
        const dateKeys = expandWorkingDays(request.fromDateKey, request.toDateKey);
        if (!dateKeys.length) throw fail(ValidationError, messages.rangeEmpty(), 'LEAVE_RANGE_EMPTY');

        const people = await describePeople(adminId, request.sessionId, [request]);
        const placement = (people.get(`${request.personType}|${request.personId}`) || {}).placement || null;
        const limit = await limitForApproval({ adminId, request, placement, dbSession });

        const effective = effectiveLimit(limit, null);
        if (!forceApprove && exceedsBalance(effective, dateKeys.length)) {
            throw balanceExceeded(type.name, remainingOf(effective), dateKeys.length);
        }
        // Guarded increment: the filter re-checks the balance at write time.
        const guard = forceApprove ? {} : { usedDays: { $lte: limit.allocatedDays - dateKeys.length } };
        const charged = await LeaveLimitV2Model.findOneAndUpdate(
            { _id: limit._id, adminId, ...guard },
            { $inc: { usedDays: dateKeys.length }, $set: { updatedAt: new Date() } },
            { new: true, session: dbSession }
        ).lean();
        if (!charged) throw balanceExceeded(type.name, remainingOf(effective), dateKeys.length);

        const marked = await markAttendance({ adminId, request, dateKeys, dbSession });
        await LeaveRequestV2Model.updateOne(
            { _id: request._id, adminId },
            { $set: { days: dateKeys.length, chargedDays: dateKeys.length, attendanceDateKeys: marked, forceApproved: Boolean(forceApprove) } },
            { session: dbSession }
        );
        return { request, dateKeys, charged };
    });

    await refreshLiveStats(adminId, result.dateKeys);
    await logActivity(req, {
        module: MODULE, action: 'leave.request.approve', targetId: id,
        meta: { days: result.dateKeys.length, forceApprove: Boolean(forceApprove) },
        changes: { before: { status: 'Pending', usedDays: result.charged.usedDays - result.dateKeys.length }, after: { status: 'Approved', usedDays: result.charged.usedDays } },
    });
    const fresh = await LeaveRequestV2Model.findOne({ _id: id, adminId }).lean();
    const [row] = await decorate(adminId, fresh.sessionId, [fresh]);
    return res.status(200).json({ message: messages.approved(result.dateKeys.length), request: row });
};

/** Reject: terminal, touches neither attendance nor balance. */
let RejectRequest = async (req, res) => {
    const { adminId } = req.body;
    const id = req.params.id;
    const request = await LeaveRequestV2Model.findOneAndUpdate(
        { _id: id, adminId, status: 'Pending' },
        { $set: { status: 'Rejected', actionedBy: actorOf(req), actionedAt: new Date(), updatedAt: new Date() } },
        { new: true }
    ).lean();
    if (!request) await explainNoMatch(adminId, id, 'Rejected');
    await logActivity(req, { module: MODULE, action: 'leave.request.reject', targetId: id, changes: { before: { status: 'Pending' }, after: { status: 'Rejected' } } });
    const [row] = await decorate(adminId, request.sessionId, [request]);
    return res.status(200).json({ message: messages.rejected(), request: row });
};

/** Take Back: reverses usedDays (clamped) and removes the attendance marks it wrote. */
let CancelRequest = async (req, res) => {
    const { adminId, reason } = req.body;
    const id = req.params.id;
    const current = await LeaveRequestV2Model.findOne({ _id: id, adminId }).lean();
    if (!current) throw requestNotFound(id);
    if (current.status !== 'Approved') throw fail(ValidationError, messages.notCancellable(), 'LEAVE_NOT_CANCELLABLE');
    // Server wall clock, never the client's.
    if (current.toDateKey < todayKey()) throw fail(ValidationError, messages.alreadyCompleted(), 'LEAVE_ALREADY_COMPLETED');

    const result = await withTransaction(async (dbSession) => {
        const request = await LeaveRequestV2Model.findOneAndUpdate(
            { _id: id, adminId, status: 'Approved' },
            { $set: { status: 'Cancelled', cancelReason: reason || null, actionedBy: actorOf(req), actionedAt: new Date(), updatedAt: new Date() } },
            { new: true, session: dbSession }
        ).lean();
        if (!request) throw new ConflictError(messages.alreadyActioned(), { module: MODULE, code: 'LEAVE_ALREADY_ACTIONED' });

        const limit = await LeaveLimitV2Model.findOneAndUpdate(
            { adminId, sessionId: request.sessionId, personType: request.personType, personId: request.personId, leaveTypeId: request.leaveTypeId },
            [{ $set: { usedDays: { $max: [0, { $subtract: ['$usedDays', request.chargedDays || 0] }] }, updatedAt: '$$NOW' } }],
            { new: true, session: dbSession }
        ).lean();
        // Only the marks this leave still owns — a later manual correction is kept.
        if (request.attendanceDateKeys.length) {
            await AttendanceRecordV2Model.deleteMany({
                adminId, personType: request.personType, personId: request.personId,
                dateKey: { $in: request.attendanceDateKeys }, updatedBy: 'leave', remark: `leave:${request._id}`,
            }, { session: dbSession });
        }
        return { request, limit };
    });

    await refreshLiveStats(adminId, result.request.attendanceDateKeys);
    await logActivity(req, {
        module: MODULE, action: 'leave.request.cancel', targetId: id, meta: { reason: reason || null, days: result.request.chargedDays },
        changes: { before: { status: 'Approved' }, after: { status: 'Cancelled', usedDays: result.limit ? result.limit.usedDays : null } },
    });
    const [row] = await decorate(adminId, result.request.sessionId, [result.request]);
    return res.status(200).json({ message: messages.cancelled(), request: row });
};

/** Only a Rejected request can be deleted — anything else is history. */
let DeleteRequest = async (req, res) => {
    const { adminId } = req.query;
    const id = req.params.id;
    const deleted = await LeaveRequestV2Model.findOneAndDelete({ _id: id, adminId, status: 'Rejected' }).lean();
    if (!deleted) {
        const current = await LeaveRequestV2Model.findOne({ _id: id, adminId }, 'status').lean();
        if (!current) throw requestNotFound(id);
        throw fail(ValidationError, messages.onlyRejectedDeletable(), 'LEAVE_NOT_DELETABLE');
    }
    await logActivity(req, { module: MODULE, action: 'leave.request.delete', targetId: id, meta: { personType: deleted.personType, personId: deleted.personId } });
    return res.status(200).json({ message: messages.deleted() });
};

// A deleted student's leave history and limits go with them, inside Student's own delete
// transaction (student.utils.js cascade hook).
registerStudentDeleteStep('leave', async ({ dbSession, adminId, studentIds }) => {
    const ids = studentIds.map(String);
    await LeaveRequestV2Model.deleteMany({ adminId, personType: 'student', personId: { $in: ids } }, { session: dbSession });
    await LeaveLimitV2Model.deleteMany({ adminId, personType: 'student', personId: { $in: ids } }, { session: dbSession });
});

module.exports = {
    ListRequests,
    GetPeopleOptions,
    GetBalance,
    CreateRequest,
    ApproveRequest,
    RejectRequest,
    CancelRequest,
    DeleteRequest,
};
