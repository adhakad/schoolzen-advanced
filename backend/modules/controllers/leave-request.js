'use strict';
const mongoose = require('mongoose');
const LeaveRequestModel = require('../models/leave-request');
const LeaveTypeModel = require('../models/leave-type');
const DailyAttendanceModel = require('../models/daily-attendance');
const TeacherModel = require('../models/teacher');
const TeacherUserModel = require('../models/users/teacher-user');
const { getModel, getPerson, personCode } = require('../services/person-lookup');
const { getHolidayMapForMonth } = require('../services/holiday-lookup');
const { toUtcMidnight, toDateKey, parseDateKey, eachDateInRange } = require('../helpers/date-only');
const logger = require('../helpers/logger');

// Apply -> Pending -> Approved / Rejected.
//
// APPROVAL IS THE ONLY THING THAT TOUCHES ATTENDANCE. It writes one DailyAttendance row per
// granted day with isOverridden: true, which makes those rows literally unmatchable by the
// reconcile worker (services/attendance-reconcile.js reads overridden people up front and
// skips them, and its stale-row cleanup carries `isOverridden: { $ne: true }`). So an
// approved leave day survives every later sync and re-sync, exactly like a manual override.
//
// Rejection writes nothing, per spec. Deleting an APPROVED request is the undo path and is
// the only place rows are removed again.
//
// Queue modules are required LAZILY at the one place they are used, for the reason spelled
// out in controllers/roster.js: queues/connection.js throws at require-time without Redis,
// and routes.js requires this controller at boot — an eager require would 500 every
// endpoint here, the read-only ones included.

// Sunday. The same weekly off the rest of this codebase already assumes — see
// STUDENT_WEEKLY_OFF in services/attendance-calendar.js and the roster page's weekend
// column, both of which treat exactly `dow === 0` as non-working.
const WEEKLY_OFF_DAYS = [0];

// Mongo caps a single bulkWrite at 100k ops. A leave range is at most a few hundred days,
// so this chunk size is really a guard against a pathological fromDate/toDate rather than a
// throughput knob — same reasoning as attendance-reconcile.js's WRITE_CHUNK_SIZE.
const WRITE_CHUNK_SIZE = 1000;

const chunk = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
};

// ---------------------------------------------------------------------------
// INTERNAL — turn a requested range into the days actually GRANTED.
//
// Three things come out of the range:
//   1. weekly offs (Sunday) — nobody should burn balance on a day they were not expected.
//   2. declared holidays — via services/holiday-lookup.js, still a Phase 9 stub returning
//      an empty map. Calling it now costs one no-op await and means holiday-skipping starts
//      working the day Phase 9 lands, with no edit to this file.
//   3. days already recorded as 'Holiday' in DailyAttendance — until Phase 9 a manual
//      override is the only way such a row exists, and it is the school telling us the day
//      was shut. attendance-status.js:186 puts Holiday above Leave for the same reason.
//
// One holiday-map read per month the range spans, and one DailyAttendance scan for the
// whole range — never a query per day.
//
// @returns {Promise<String[]>} "YYYY-MM-DD" keys, ascending. Possibly empty.
// ---------------------------------------------------------------------------
const expandLeaveDates = async (adminId, personType, personId, fromKey, toKey) => {
    const dates = eachDateInRange(fromKey, toKey, null);
    if (dates.length === 0) return [];

    // Drop the weekly offs first — it is free, and it shrinks everything below.
    const workingDates = dates.filter((date) => !WEEKLY_OFF_DAYS.includes(date.getUTCDay()));
    if (workingDates.length === 0) return [];

    const dateKeys = workingDates.map((date) => toDateKey(date));

    // One holiday map per distinct (year, month) the range touches. A leave range is
    // normally days, occasionally weeks — so this is one or two reads, not one per day.
    const months = new Map();
    for (const dateKey of dateKeys) {
        const parsed = parseDateKey(dateKey);
        if (parsed) months.set(`${parsed.year}-${parsed.month}`, parsed);
    }

    const [holidayMaps, holidayRows] = await Promise.all([
        Promise.all([...months.values()].map(
            (parsed) => getHolidayMapForMonth(adminId, parsed.year, parsed.month),
        )),
        // Scoped to THIS person: a Holiday row is per-person in DailyAttendance, and a
        // school-wide read would be a much wider scan for no extra signal.
        DailyAttendanceModel
            .find(
                {
                    adminId,
                    personType,
                    personId,
                    date: { $in: workingDates },
                    status: 'Holiday',
                },
                { date: 1, _id: 0 },
            )
            .lean(),
    ]);

    const holidayKeys = new Set();
    for (const holidayMap of holidayMaps) {
        for (const dateKey of holidayMap.keys()) holidayKeys.add(dateKey);
    }
    for (const row of holidayRows) holidayKeys.add(toDateKey(row.date));

    return dateKeys.filter((dateKey) => !holidayKeys.has(dateKey));
};

// ---------------------------------------------------------------------------
// INTERNAL — days already approved against one type this year, for the balance.
// One indexed aggregation over { adminId, personType, personId, year, status }.
// `excludeId` lets the approval path ask "everything EXCEPT the request I am about to
// approve", so re-approving cannot count itself twice.
// ---------------------------------------------------------------------------
const getUsedDaysByType = async (adminId, personType, personId, year, excludeId) => {
    const match = { adminId, personType, personId, year, status: 'Approved' };
    if (excludeId) match._id = { $ne: new mongoose.Types.ObjectId(excludeId) };

    const grouped = await LeaveRequestModel.aggregate([
        { $match: match },
        { $group: { _id: '$leaveTypeId', used: { $sum: '$dayCount' } } },
    ]);

    const usedByTypeId = new Map();
    for (const row of grouped) usedByTypeId.set(String(row._id), row.used);
    return usedByTypeId;
};

// ---------------------------------------------------------------------------
// INTERNAL — decorate a page of requests with person and leave-type names.
//
// ONE query per person type and ONE for the types, never one per row: a 50-row page of
// mixed staff/teacher/student costs at most four round-trips regardless of page size.
// ---------------------------------------------------------------------------
const decorateRequests = async (requests) => {
    if (requests.length === 0) return [];

    const idsByType = new Map();
    for (const request of requests) {
        if (!idsByType.has(request.personType)) idsByType.set(request.personType, new Set());
        idsByType.get(request.personType).add(String(request.personId));
    }

    const typeIds = [...new Set(requests.map((request) => String(request.leaveTypeId)))];

    const [peopleResults, leaveTypes] = await Promise.all([
        Promise.all([...idsByType.entries()].map(async ([personType, ids]) => {
            const model = getModel(personType);
            if (!model) return [personType, []];
            const people = await model
                .find({ _id: { $in: [...ids] } })
                .select('name empCode teacherUserId admissionNo class rollNumber')
                .lean();
            return [personType, people];
        })),
        LeaveTypeModel.find({ _id: { $in: typeIds } }, { name: 1, isPaid: 1 }).lean(),
    ]);

    const personByKey = new Map();
    for (const [personType, people] of peopleResults) {
        for (const person of people) {
            personByKey.set(`${personType}|${person._id.toString()}`, person);
        }
    }
    const leaveTypeById = new Map(leaveTypes.map((type) => [type._id.toString(), type]));

    return requests.map((request) => {
        const person = personByKey.get(`${request.personType}|${request.personId}`) || null;
        const leaveType = leaveTypeById.get(String(request.leaveTypeId)) || null;
        return {
            ...request,
            personName: person ? person.name : '',
            personCode: person ? personCode(request.personType, person) : '',
            leaveTypeName: leaveType ? leaveType.name : '',
            isPaid: leaveType ? !!leaveType.isPaid : false,
        };
    });
};

// ---------------------------------------------------------------------------
// INTERNAL — the whole creation path, shared by the admin and teacher entry points.
// Returns { error, status } on a business-rule failure, or { request } on success, so the
// caller decides the HTTP shape.
// ---------------------------------------------------------------------------
const createRequest = async ({
    adminId, personType, personId, leaveTypeId, fromKey, toKey, reason, appliedByRole, appliedById,
}) => {
    const fromParsed = parseDateKey(fromKey);
    const toParsed = parseDateKey(toKey);
    if (!fromParsed || !toParsed) return { status: 400, error: 'A valid from and to date are required!' };

    const fromDate = toUtcMidnight(fromParsed.dateKey);
    const toDate = toUtcMidnight(toParsed.dateKey);
    if (toDate < fromDate) return { status: 400, error: 'To date cannot be before from date!' };

    const [person, leaveType] = await Promise.all([
        getPerson(personType, personId),
        LeaveTypeModel.findOne({ _id: leaveTypeId, adminId: adminId }).lean(),
    ]);

    if (!person) return { status: 404, error: 'Person not found!' };
    // A person from another school reached through a hand-crafted id would otherwise get a
    // leave row filed against this school's calendar.
    if (String(person.adminId) !== String(adminId)) {
        return { status: 400, error: 'Person does not belong to this school!' };
    }
    if (!leaveType) return { status: 404, error: 'Leave type not found!' };
    if (leaveType.status !== 'active') return { status: 400, error: 'This leave type is inactive!' };
    if (leaveType.applicableTo !== 'all' && leaveType.applicableTo !== personType) {
        return { status: 400, error: `This leave type does not apply to a ${personType}!` };
    }

    // Reject a range that grants nothing rather than storing a zero-day request that would
    // sit in the Pending list forever with nothing to approve.
    const dateKeys = await expandLeaveDates(adminId, personType, personId, fromParsed.dateKey, toParsed.dateKey);
    if (dateKeys.length === 0) {
        return { status: 400, error: 'This date range has no working days to grant!' };
    }

    // Overlap guard, fail-fast with a specific message like the rest of the codebase.
    // Rejected requests are excluded — a rejected range must not block a corrected re-apply.
    const overlapping = await LeaveRequestModel.findOne({
        adminId,
        personType,
        personId,
        status: { $in: ['Pending', 'Approved'] },
        fromDate: { $lte: toDate },
        toDate: { $gte: fromDate },
    }).lean();
    if (overlapping) {
        return { status: 400, error: 'This person already has a leave request covering these dates!' };
    }

    const request = await LeaveRequestModel.create({
        adminId,
        personType,
        personId,
        leaveTypeId,
        fromDate,
        toDate,
        // Deliberately NOT written here. Expanding at application time would freeze today's
        // holiday calendar into a request that might not be approved for weeks; the
        // expansion above is only used to reject an empty range.
        leaveDates: [],
        dayCount: 0,
        year: fromParsed.year,
        reason: reason || '',
        status: 'Pending',
        appliedByRole,
        appliedById: appliedById || null,
    });

    return { request };
};

// ---------------------------------------------------------------------------
// POST /leave-request-pagination
// Body: { adminId, filters: { status, personType, personId }, page, limit }
// ---------------------------------------------------------------------------
let GetLeaveRequestPagination = async (req, res, next) => {
    const adminId = req.body.adminId;
    const filters = req.body.filters || {};
    try {
        if (!adminId) return res.status(400).json('School is required!');

        const searchObj = { adminId: adminId };
        // 'all' is the UI's "no filter" value, not a status — never send it to Mongo.
        if (filters.status && filters.status !== 'all') searchObj.status = filters.status;
        if (filters.personType && filters.personType !== 'all') searchObj.personType = filters.personType;
        if (filters.personId) searchObj.personId = filters.personId;

        let limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        let page = req.body.page || 1;

        const [rows, countLeaveRequest] = await Promise.all([
            LeaveRequestModel.find(searchObj).sort({ fromDate: -1, _id: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean(),
            LeaveRequestModel.count(searchObj),
        ]);

        const leaveRequestList = await decorateRequests(rows);
        return res.json({ leaveRequestList, countLeaveRequest });
    } catch (error) {
        logger.error('leave-request.GetLeaveRequestPagination', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// GET /balance?adminId=&personType=&personId=&year=
// What the apply form shows above the date pickers: every type this person may take, with
// the days already approved against it this year.
// ---------------------------------------------------------------------------
let GetLeaveBalance = async (req, res, next) => {
    const { adminId, personType, personId } = req.query;
    const year = Number(req.query.year);
    try {
        if (!adminId || !['student', 'teacher', 'staff'].includes(personType) || !personId) {
            return res.status(400).json('School, a valid person type and person are required!');
        }
        if (!Number.isInteger(year)) return res.status(400).json('A valid year is required!');

        const [leaveTypes, usedByTypeId] = await Promise.all([
            LeaveTypeModel.find({
                adminId,
                status: 'active',
                applicableTo: { $in: ['all', personType] },
            }).sort({ name: 1 }).lean(),
            getUsedDaysByType(adminId, personType, personId, year, null),
        ]);

        return res.status(200).json(leaveTypes.map((leaveType) => {
            const used = usedByTypeId.get(leaveType._id.toString()) || 0;
            return {
                leaveTypeId: leaveType._id,
                name: leaveType.name,
                isPaid: leaveType.isPaid,
                maxDaysPerYear: leaveType.maxDaysPerYear,
                used,
                // Clamped at 0: a cap lowered after approvals were already granted would
                // otherwise render a negative balance, which reads as a bug rather than as
                // "this person is over the new limit".
                remaining: Math.max(0, leaveType.maxDaysPerYear - used),
            };
        }));
    } catch (error) {
        logger.error('leave-request.GetLeaveBalance', error);
        return res.status(500).json('Internal Server Error!');
    }
}

let GetSingleLeaveRequest = async (req, res, next) => {
    try {
        const request = await LeaveRequestModel.findOne({ _id: req.params.id }).lean();
        if (!request) return res.status(404).json('Leave request not found!');
        const [decorated] = await decorateRequests([request]);
        return res.status(200).json(decorated);
    } catch (error) {
        logger.error('leave-request.GetSingleLeaveRequest', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /  — the admin entry point. May file for any person in the school.
// ---------------------------------------------------------------------------
let CreateLeaveRequest = async (req, res, next) => {
    const { adminId, personType, personId, leaveTypeId, fromDate, toDate, reason, appliedById } = req.body;
    try {
        const result = await createRequest({
            adminId,
            personType,
            personId,
            leaveTypeId,
            fromKey: fromDate,
            toKey: toDate,
            reason,
            appliedByRole: 'admin',
            appliedById,
        });
        if (result.error) return res.status(result.status).json(result.error);
        return res.status(200).json('Leave request submitted successfully.');
    } catch (error) {
        logger.error('leave-request.CreateLeaveRequest', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /teacher  — behind isTeacherAuth.
//
// EVERY identifying field comes from the verified token, never the body: adminId, and the
// teacher's own personId. A teacher may file for themselves, or for a student of a class
// their leavePermission actually covers — nothing else. Staff are never reachable here.
//
// The JWT payload is { id, adminId, email, name } where `id` is the TEACHER-USER _id, not
// the teacher record's — see controllers/users/teacher-user.js. So the real personId needs
// one lookup through teacher-user.teacherId.
// ---------------------------------------------------------------------------
let CreateTeacherLeaveRequest = async (req, res, next) => {
    const { personType, leaveTypeId, fromDate, toDate, reason } = req.body;
    try {
        const adminId = req.user && req.user.adminId;
        const teacherUserId = req.user && req.user.id;
        if (!adminId || !teacherUserId) return res.status(403).json('Invalid session!');

        const teacherUser = await TeacherUserModel.findOne({ _id: teacherUserId }, { teacherId: 1 }).lean();
        if (!teacherUser) return res.status(403).json('Invalid session!');
        const selfPersonId = String(teacherUser.teacherId);

        let personId;
        if (personType === 'teacher') {
            // Self-apply only. Whatever personId the body carried is discarded.
            personId = selfPersonId;
        } else {
            if (!req.body.personId) return res.status(400).json('Select a student!');

            const [teacher, student] = await Promise.all([
                TeacherModel.findOne({ _id: selfPersonId }, { leavePermission: 1 }).lean(),
                getPerson('student', req.body.personId),
            ]);
            if (!student || String(student.adminId) !== String(adminId)) {
                return res.status(404).json('Student not found!');
            }

            // Optional-chained the way every other consumer of a later-added permission is:
            // a teacher saved before this field existed simply has none.
            const permission = teacher && teacher.leavePermission;
            const allowedClasses = (permission && permission.classes) || [];
            if (!permission || !permission.status || !allowedClasses.map(Number).includes(Number(student.class))) {
                return res.status(403).json('You do not have leave permission for this class!');
            }
            personId = String(student._id);
        }

        const result = await createRequest({
            adminId,
            personType,
            personId,
            leaveTypeId,
            fromKey: fromDate,
            toKey: toDate,
            reason,
            appliedByRole: 'teacher',
            appliedById: selfPersonId,
        });
        if (result.error) return res.status(result.status).json(result.error);
        return res.status(200).json('Leave request submitted successfully.');
    } catch (error) {
        logger.error('leave-request.CreateTeacherLeaveRequest', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// PUT /:id/approve  { actionBy }
//
// The only handler that writes attendance. Rows go in with isOverridden: true, which is
// what makes them survive every later reconcile — see the file header.
// ---------------------------------------------------------------------------
let ApproveLeaveRequest = async (req, res, next) => {
    const { actionBy } = req.body;
    try {
        const id = req.params.id;
        const request = await LeaveRequestModel.findOne({ _id: id }).lean();
        if (!request) return res.status(404).json('Leave request not found!');
        // Guarded, not idempotent-by-accident: approving an already-Approved request would
        // re-expand the range against today's holiday calendar and could double-count the
        // balance. The admin should delete and re-file instead.
        if (request.status !== 'Pending') {
            return res.status(400).json(`This request is already ${request.status.toLowerCase()}!`);
        }

        const leaveType = await LeaveTypeModel.findOne({ _id: request.leaveTypeId }).lean();
        if (!leaveType) return res.status(404).json('Leave type not found!');

        const dateKeys = await expandLeaveDates(
            request.adminId,
            request.personType,
            request.personId,
            toDateKey(request.fromDate),
            toDateKey(request.toDate),
        );
        if (dateKeys.length === 0) {
            return res.status(400).json('This date range has no working days left to grant!');
        }

        // Excludes this request, which is still Pending and so contributes 0 anyway — but
        // passing it keeps the helper honest if the guard above ever loosens.
        const usedByTypeId = await getUsedDaysByType(
            request.adminId, request.personType, request.personId, request.year, id,
        );
        const used = usedByTypeId.get(String(request.leaveTypeId)) || 0;
        if (used + dateKeys.length > leaveType.maxDaysPerYear) {
            return res.status(400).json(
                `Not enough ${leaveType.name} balance: ${leaveType.maxDaysPerYear - used} day(s) left, ${dateKeys.length} requested!`,
            );
        }

        const now = new Date();
        const writeOps = dateKeys.map((dateKey) => ({
            updateOne: {
                // Matches DailyAttendance's unique { adminId, personType, personId, date }
                // index exactly, so each upsert is a direct index hit.
                filter: {
                    adminId: request.adminId,
                    personType: request.personType,
                    personId: request.personId,
                    date: toUtcMidnight(dateKey),
                },
                update: {
                    $set: {
                        status: 'Leave',
                        leaveRequestId: String(request._id),
                        source: 'MANUAL',
                        isOverridden: true,
                        overriddenBy: actionBy || null,
                        updatedAt: now,
                    },
                    // $setOnInsert, NOT $set. attendance-status.js:191 is explicit that
                    // punch facts survive on a Leave row — somebody who punched on a day
                    // later approved as leave keeps that evidence. $set-ing these null
                    // would erase it on every existing row.
                    $setOnInsert: {
                        firstIn: null,
                        lastOut: null,
                        punchCount: 0,
                        lateByMinutes: null,
                        shiftId: null,
                        holidayId: null,
                        createdAt: now,
                    },
                },
                upsert: true,
            },
        }));

        // Attendance rows and the request's own status must land together: rows written
        // against a request still marked Pending would be unattributable, and a request
        // marked Approved with no rows would show as leave nowhere.
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            for (const batch of chunk(writeOps, WRITE_CHUNK_SIZE)) {
                await DailyAttendanceModel.bulkWrite(batch, { ordered: false, session });
            }
            await LeaveRequestModel.updateOne(
                { _id: id },
                {
                    $set: {
                        status: 'Approved',
                        leaveDates: dateKeys,
                        dayCount: dateKeys.length,
                        actionBy: actionBy || null,
                        actionAt: now,
                    },
                },
                { session },
            );
            await session.commitTransaction();
        } catch (writeError) {
            await session.abortTransaction();
            logger.error('leave-request.approveWriteFailed', writeError);
            throw writeError;
        } finally {
            session.endSession();
        }

        logger.info('leave-request.approved', {
            adminId: request.adminId,
            leaveRequestId: String(request._id),
            personType: request.personType,
            dayCount: dateKeys.length,
        });
        // No reconcile enqueue: these rows are isOverridden, so the worker skips them
        // outright. Enqueuing would burn a job to recompute days it is forbidden to touch.
        return res.status(200).json(`Leave approved for ${dateKeys.length} day(s).`);
    } catch (error) {
        logger.error('leave-request.ApproveLeaveRequest', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// PUT /:id/reject  { actionBy }
// Touches no attendance at all — a rejected request never granted anything to undo.
// ---------------------------------------------------------------------------
let RejectLeaveRequest = async (req, res, next) => {
    const { actionBy } = req.body;
    try {
        const id = req.params.id;
        const request = await LeaveRequestModel.findOne({ _id: id }, { status: 1 }).lean();
        if (!request) return res.status(404).json('Leave request not found!');
        if (request.status !== 'Pending') {
            return res.status(400).json(`This request is already ${request.status.toLowerCase()}!`);
        }

        await LeaveRequestModel.updateOne(
            { _id: id },
            { $set: { status: 'Rejected', actionBy: actionBy || null, actionAt: new Date() } },
        );
        return res.status(200).json('Leave request rejected.');
    } catch (error) {
        logger.error('leave-request.RejectLeaveRequest', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// INTERNAL — queue the attendance recompute for days a deleted approval freed up.
// Lifted from controllers/roster.js, and cheap for the same reasons: addReconcileJob
// dedupes on jobId so a 26-day range queues at most 26 jobs, FUTURE dates are skipped
// because they have no punches to recompute, and it NEVER throws — the delete is already
// committed and turning that into a 500 because Redis blinked would be strictly worse than
// a late recompute.
// ---------------------------------------------------------------------------
const enqueueReconcileForDates = async (adminId, dateKeys) => {
    if (!adminId || !Array.isArray(dateKeys) || dateKeys.length === 0) return 0;

    const { nowWallClock } = require('../helpers/attendance-time');
    // "Today" in the SCHOOL wall clock, not the server one — a container running UTC would
    // treat the current Indian school day as a future date until 05:30 and skip it.
    const todayKey = toDateKey(toUtcMidnight(nowWallClock()));
    // Lexicographic compare is exact on "YYYY-MM-DD" and needs no Date arithmetic.
    const dueDateKeys = [...new Set(dateKeys)].filter((dateKey) => dateKey <= todayKey);
    if (dueDateKeys.length === 0) return 0;

    try {
        const { addReconcileJob } = require('../queues/attendance-reconcile-queue');
        for (const dateKey of dueDateKeys) {
            await addReconcileJob(adminId, dateKey, { delay: 0 });
        }
        logger.info('leave-request.reconcileEnqueued', { adminId, dateCount: dueDateKeys.length });
        return dueDateKeys.length;
    } catch (error) {
        logger.error('leave-request.reconcileEnqueueFailed', error);
        return 0;
    }
};

// ---------------------------------------------------------------------------
// DELETE /:id
//
// The undo path for a leave approved by mistake. Removing the request without removing its
// rows would leave DailyAttendance permanently showing Leave with a leaveRequestId pointing
// at nothing — and because those rows are isOverridden, no reconcile would ever clear them.
// So both go in one transaction, and the freed dates are queued for recompute afterwards.
// ---------------------------------------------------------------------------
let DeleteLeaveRequest = async (req, res, next) => {
    try {
        const id = req.params.id;
        const request = await LeaveRequestModel.findOne({ _id: id }).lean();
        if (!request) return res.status(404).json('Leave request not found!');

        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            if (request.status === 'Approved') {
                await DailyAttendanceModel.deleteMany(
                    { adminId: request.adminId, leaveRequestId: String(request._id) },
                    { session },
                );
            }
            await LeaveRequestModel.deleteOne({ _id: id }, { session });
            await session.commitTransaction();
        } catch (writeError) {
            await session.abortTransaction();
            logger.error('leave-request.deleteWriteFailed', writeError);
            throw writeError;
        } finally {
            session.endSession();
        }

        // Those days now have no row at all, so the calendar reads them as Absent. Queue a
        // recompute so any real punches on them are turned back into a proper status.
        if (request.status === 'Approved' && request.leaveDates.length > 0) {
            await enqueueReconcileForDates(request.adminId, request.leaveDates);
        }

        return res.status(200).json('Leave request deleted successfully.');
    } catch (error) {
        logger.error('leave-request.DeleteLeaveRequest', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GetLeaveRequestPagination,
    GetLeaveBalance,
    GetSingleLeaveRequest,
    CreateLeaveRequest,
    CreateTeacherLeaveRequest,
    ApproveLeaveRequest,
    RejectLeaveRequest,
    DeleteLeaveRequest,
}
