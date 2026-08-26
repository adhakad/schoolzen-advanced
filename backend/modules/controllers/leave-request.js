'use strict';
const mongoose = require('mongoose');
const LeaveRequestModel = require('../models/leave-request');
const LeaveTypeModel = require('../models/leave-type');
const DailyAttendanceModel = require('../models/daily-attendance');
const PersonLeaveAssignmentModel = require('../models/person-leave-assignment');
const TeacherModel = require('../models/teacher');
const DesignationModel = require('../models/designation');
const TeacherUserModel = require('../models/users/teacher-user');
const { getModel, getPerson, personCode } = require('../services/person-lookup');
const { getHolidayMapForMonth, getHolidayKeysForPersons } = require('../services/holiday-lookup');
const { balanceKeyOf, getApprovedDaysByPerson, getAssignmentMap } = require('../services/leave-balance');
const { nowWallClock } = require('../helpers/attendance-time');
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
//   2. declared holidays — via services/holiday-lookup.js, scoped to THIS person: a holiday
//      reaches somebody only through the HolidayTemplate they are assigned, so the office
//      staff may owe a working day on a date the classrooms are shut.
//   3. days already recorded as 'Holiday' in DailyAttendance — either a manual override or a
//      day the reconciler already resolved as a holiday, and both are the school telling us
//      the day was shut. attendance-status.js:186 puts Holiday above Leave for the same
//      reason.
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
            (parsed) => getHolidayMapForMonth(adminId, personType, personId, parsed.year, parsed.month),
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
// INTERNAL — how many days each PENDING or REJECTED request on a page would actually grant.
//
// The same three exclusions expandLeaveDates applies, but BATCHED ACROSS THE WHOLE PAGE:
// Sundays are dropped in memory, one holiday map per distinct month the page spans, and one
// DailyAttendance scan covering every date on the page at once. A 50-row page costs the same
// handful of round-trips a 1-row page does — calling expandLeaveDates per row would make the
// list endpoint, the one admins sit on all day, an N+1.
//
// Approved and Cancelled rows are skipped: their stored dayCount is already the expanded
// truth, frozen at approval, and re-expanding it against today's calendar could disagree
// with the attendance rows that were actually written.
//
// @returns {Promise<Map<String, Number>>} request _id -> grantable day count
// ---------------------------------------------------------------------------
const expandLeaveDatesForPage = async (adminId, requests) => {
    const dayCountByRequestId = new Map();

    const unexpanded = requests.filter(
        (request) => request.status === 'Pending' || request.status === 'Rejected',
    );
    if (unexpanded.length === 0) return dayCountByRequestId;

    const workingKeysByRequestId = new Map();
    const months = new Map();
    const allDateKeys = new Set();

    for (const request of unexpanded) {
        const dateKeys = eachDateInRange(toDateKey(request.fromDate), toDateKey(request.toDate), null)
            .filter((date) => !WEEKLY_OFF_DAYS.includes(date.getUTCDay()))
            .map((date) => toDateKey(date));
        workingKeysByRequestId.set(String(request._id), dateKeys);

        for (const dateKey of dateKeys) {
            allDateKeys.add(dateKey);
            const parsed = parseDateKey(dateKey);
            if (parsed) months.set(`${parsed.year}-${parsed.month}`, parsed);
        }
    }

    const dateList = [...allDateKeys].map((dateKey) => toUtcMidnight(dateKey));

    const [holidayKeysByPersonKey, holidayRows] = await Promise.all([
        // One call for every person and every month on the page — see the header of
        // services/holiday-lookup.js. Calling the per-person getHolidayMapForMonth per row
        // would make this list endpoint, the one admins sit on all day, an N+1.
        getHolidayKeysForPersons(
            adminId,
            unexpanded.map((request) => ({
                personType: request.personType,
                personId: String(request.personId),
            })),
            [...months.values()],
        ),
        // School-wide, unlike expandLeaveDates's per-person read: one scan for every person
        // on the page is cheaper than one per row, and the rows carry who they belong to.
        dateList.length > 0
            ? DailyAttendanceModel
                .find(
                    { adminId, status: 'Holiday', date: { $in: dateList } },
                    { personType: 1, personId: 1, date: 1, _id: 0 },
                )
                .lean()
            : [],
    ]);

    // Two sources, both per-person, kept apart because they mean different things: the first
    // is what this person's HolidayTemplate DECLARES, the second is what their attendance
    // register already RECORDS. A day can be either without being both — a template can
    // declare a holiday the reconciler has not reached yet, and a manual override can record
    // one no template contains.
    const personHolidayKeys = new Set();
    for (const row of holidayRows) {
        personHolidayKeys.add(`${row.personType}|${row.personId}|${toDateKey(row.date)}`);
    }

    for (const request of unexpanded) {
        const requestId = String(request._id);
        const dateKeys = workingKeysByRequestId.get(requestId) || [];
        const declared = holidayKeysByPersonKey.get(`${request.personType}|${request.personId}`);
        dayCountByRequestId.set(requestId, dateKeys.filter((dateKey) => (
            !(declared && declared.has(dateKey))
            && !personHolidayKeys.has(`${request.personType}|${request.personId}|${dateKey}`)
        )).length);
    }

    return dayCountByRequestId;
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
// INTERNAL — decorate a page of requests with everything the approval card renders:
// person and leave-type names, the grantable day count, and the balance preview.
//
// ONE query per person type and one each for the types, the used-days aggregation, the
// entitlement rows and the page expansion — never one per row. A 50-row page of mixed
// staff/teacher/student costs the same handful of round-trips a 1-row page does.
//
// THE BALANCE PREVIEW IS WHAT THE APPROVAL DECISION NEEDS. Pressing Approve spends days a
// person may not have, and until now the admin could only find that out by opening the apply
// form for somebody else. `balanceAfterApproval` answers it on the card itself.
// ---------------------------------------------------------------------------
const decorateRequests = async (requests) => {
    if (requests.length === 0) return [];

    // Every row on a page is scoped to one school by the query that produced it.
    const adminId = requests[0].adminId;

    // COMPLETED IS A LABEL, NOT A STATUS. The stored status of a finished leave stays
    // 'Approved' — nothing downstream (services/leave-lookup.js, payroll) may stop seeing it
    // as approved. What changes is that its last day has passed, so there is nothing left to
    // take back and CancelLeaveRequest refuses it; the row says so and offers no action.
    //
    // School wall clock, not the server's, for the reason enqueueReconcileForDates spells
    // out: a container running UTC would otherwise start calling today's leave completed at
    // 18:30 the evening before.
    const todayKey = toDateKey(toUtcMidnight(nowWallClock()));

    const idsByType = new Map();
    for (const request of requests) {
        if (!idsByType.has(request.personType)) idsByType.set(request.personType, new Set());
        idsByType.get(request.personType).add(String(request.personId));
    }

    const typeIds = [...new Set(requests.map((request) => String(request.leaveTypeId)))];

    const personKeys = [...new Set(requests.map((request) => `${request.personType}|${request.personId}`))]
        .map((key) => {
            const [personType, personId] = key.split('|');
            return { personType, personId };
        });
    // A page can straddle two leave years (a December range sits in one, a January one in
    // the next), so the aggregation is asked for every year present rather than "this" one.
    const years = [...new Set(requests.map((request) => request.year).filter(Number.isInteger))];

    const [peopleResults, leaveTypes, usedByKey, assignmentByKey, workingDaysById] = await Promise.all([
        Promise.all([...idsByType.entries()].map(async ([personType, ids]) => {
            const model = getModel(personType);
            if (!model) return [personType, []];
            const people = await model
                .find({ _id: { $in: [...ids] } })
                .select('name empCode teacherUserId admissionNo class rollNumber designationId')
                .lean();
            return [personType, people];
        })),
        LeaveTypeModel.find({ _id: { $in: typeIds } }, { name: 1, isPaid: 1, maxDaysPerYear: 1 }).lean(),
        getApprovedDaysByPerson(adminId, personKeys, years.length > 0 ? years : [new Date().getFullYear()]),
        getAssignmentMap(adminId, personKeys),
        expandLeaveDatesForPage(adminId, requests),
    ]);

    const personByKey = new Map();
    for (const [personType, people] of peopleResults) {
        for (const person of people) {
            personByKey.set(`${personType}|${person._id.toString()}`, person);
        }
    }
    const leaveTypeById = new Map(leaveTypes.map((type) => [type._id.toString(), type]));

    // Only STAFF carry a designationId — teachers and students have no equivalent field, so
    // their card falls back to the person type. Run after the people fetch because the ids
    // are not known until then, and skipped entirely on a page with no staff rows, so this
    // stays one query per page rather than one per row.
    const designationIds = [...new Set(
        (peopleResults.find(([personType]) => personType === 'staff') || [null, []])[1]
            .map((person) => person.designationId)
            .filter(Boolean)
            .map(String),
    )];
    const designationById = new Map();
    if (designationIds.length > 0) {
        const designations = await DesignationModel
            .find({ _id: { $in: designationIds } }, { title: 1 })
            .lean();
        for (const designation of designations) {
            designationById.set(designation._id.toString(), designation.title);
        }
    }

    return requests.map((request) => {
        const person = personByKey.get(`${request.personType}|${request.personId}`) || null;
        const leaveType = leaveTypeById.get(String(request.leaveTypeId)) || null;

        const key = balanceKeyOf(request.personType, request.personId, String(request.leaveTypeId));
        const assignment = assignmentByKey.get(key) || null;
        // Allocation is the PER-PERSON entitlement when one was assigned, the school-wide cap
        // otherwise — a school that gives 12 sick days to teaching staff and 6 to the office
        // records that on the assignment, and the cap must follow the person, not the type.
        const allocated = assignment
            ? assignment.allocatedDays
            : (leaveType ? leaveType.maxDaysPerYear : 0);

        // Days spent by every OTHER approved request. An Approved row must not count itself
        // or its own strip would show the days it already granted as still to be deducted.
        const usedTotal = usedByKey.get(key) || 0;
        const usedByOthers = Math.max(
            0,
            usedTotal - (request.status === 'Approved' ? (request.dayCount || 0) : 0),
        );
        const remaining = Math.max(0, allocated - usedByOthers);

        // Approved and Cancelled rows carry the count that was actually granted; the rest are
        // expanded, since a Pending request's dayCount is still 0 and the raw range length
        // would promise days the Sundays and holidays inside it are about to remove.
        const workingDays = (request.status === 'Approved' || request.status === 'Cancelled')
            ? (request.dayCount || 0)
            : (workingDaysById.get(String(request._id)) || 0);

        return {
            ...request,
            personName: person ? person.name : '',
            personCode: person ? personCode(request.personType, person) : '',
            // The job, not the bucket: "Accountant" tells the admin more about whose leave
            // they are approving than "Staff" does. Empty for anyone without one, and the
            // card shows the person type in its place.
            personDesignation: (person && person.designationId)
                ? (designationById.get(String(person.designationId)) || '')
                : '',
            leaveTypeName: leaveType ? leaveType.name : '',
            isPaid: leaveType ? !!leaveType.isPaid : false,
            workingDays,
            balanceAllocated: allocated,
            balanceUsed: usedByOthers,
            balanceRemaining: remaining,
            // Deliberately NOT clamped at 0. A request that would overdraw renders a negative
            // number in red, which is the one signal worth having before pressing Approve.
            balanceAfterApproval: remaining - workingDays,
            balanceAssigned: !!assignment,
            // Lexicographic compare, exact on "YYYY-MM-DD" and free of Date arithmetic.
            isCompleted: request.status === 'Approved' && toDateKey(request.toDate) < todayKey,
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
    allowPastDates,
}) => {
    const fromParsed = parseDateKey(fromKey);
    const toParsed = parseDateKey(toKey);
    if (!fromParsed || !toParsed) return { status: 400, error: 'A valid from and to date are required!' };

    const fromDate = toUtcMidnight(fromParsed.dateKey);
    const toDate = toUtcMidnight(toParsed.dateKey);
    if (toDate < fromDate) return { status: 400, error: 'To date cannot be before from date!' };

    // Leave is applied for, not recorded after the fact — a range that has already passed is
    // almost always a mis-set datepicker, and approving it would rewrite attendance days the
    // biometric sync has already settled. `allowPastDates` is the deliberate escape hatch for
    // an admin backfilling a genuine correction; the teacher route hard-codes it false, so a
    // teacher can never reach it by editing the payload.
    //
    // "Today" comes from the SCHOOL wall clock, not the server's — the same reason
    // enqueueReconcileForDates spells out below. A container running UTC would otherwise
    // reject the current Indian school day as being in the past until 05:30.
    if (!allowPastDates) {
        const todayKey = toDateKey(toUtcMidnight(nowWallClock()));
        // Lexicographic compare is exact on "YYYY-MM-DD" and needs no Date arithmetic.
        if (fromParsed.dateKey < todayKey) {
            return { status: 400, error: 'Cannot apply leave for past dates!' };
        }
    }

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

    // BALANCE IS ENFORCED HERE, NOT ONLY AT APPROVAL. Letting somebody file for more days
    // than they have and only finding out weeks later, when an admin presses Approve, wastes
    // both their time and the admin's. There is deliberately NO override on this path: the
    // admin's forceApprove exists at approval time, where a named person takes responsibility
    // for granting the extra days, and handing the same power to whoever fills the form in
    // would make the cap advisory.
    //
    // Allocation and usage are read exactly the way GetLeaveBalance reads them, so the
    // sentence the form shows and the rule the server applies can never disagree: the
    // per-person entitlement when one was assigned, the school-wide cap otherwise, and days
    // used from the aggregation over approved requests rather than the drift-prone counter.
    const [usedByTypeId, assignment] = await Promise.all([
        getUsedDaysByType(adminId, personType, personId, fromParsed.year, null),
        PersonLeaveAssignmentModel.findOne({
            adminId,
            personType,
            personId,
            leaveTypeId: String(leaveTypeId),
        }).lean(),
    ]);
    const used = usedByTypeId.get(String(leaveTypeId)) || 0;
    const allocated = assignment ? assignment.allocatedDays : leaveType.maxDaysPerYear;
    const remaining = Math.max(0, allocated - used);
    if (dateKeys.length > remaining) {
        return {
            status: 400,
            error: `Not enough ${leaveType.name} balance: ${remaining} day(s) left, ${dateKeys.length} requested!`,
        };
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

        const [leaveTypes, usedByTypeId, assignmentByKey] = await Promise.all([
            LeaveTypeModel.find({
                adminId,
                status: 'active',
                applicableTo: { $in: ['all', personType] },
            }).sort({ name: 1 }).lean(),
            getUsedDaysByType(adminId, personType, personId, year, null),
            getAssignmentMap(adminId, [{ personType, personId }]),
        ]);

        return res.status(200).json(leaveTypes.map((leaveType) => {
            const typeId = leaveType._id.toString();
            const used = usedByTypeId.get(typeId) || 0;
            // The entitlement this person was actually granted, when somebody granted them
            // one; the school-wide cap otherwise. `maxDaysPerYear` is still reported alongside
            // it so the form can show both if the two ever diverge.
            const assignment = assignmentByKey.get(balanceKeyOf(personType, personId, typeId)) || null;
            const allocated = assignment ? assignment.allocatedDays : leaveType.maxDaysPerYear;
            return {
                leaveTypeId: leaveType._id,
                name: leaveType.name,
                isPaid: leaveType.isPaid,
                maxDaysPerYear: leaveType.maxDaysPerYear,
                allocated,
                assigned: !!assignment,
                used,
                // Clamped at 0: a cap lowered after approvals were already granted would
                // otherwise render a negative balance, which reads as a bug rather than as
                // "this person is over the new limit".
                remaining: Math.max(0, allocated - used),
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
    const {
        adminId, personType, personId, leaveTypeId, fromDate, toDate, reason, appliedById, allowPastDates,
    } = req.body;
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
            // Admin only. The teacher entry point below never passes it.
            allowPastDates: !!allowPastDates,
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
            // Hard false, never read from the body: backfilling is an admin correction, and
            // the teacher schema does not declare the field anyway.
            allowPastDates: false,
        });
        if (result.error) return res.status(result.status).json(result.error);
        return res.status(200).json('Leave request submitted successfully.');
    } catch (error) {
        logger.error('leave-request.CreateTeacherLeaveRequest', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// PUT /:id/approve  { actionBy, forceApprove }
//
// The only handler that writes attendance. Rows go in with isOverridden: true, which is
// what makes them survive every later reconcile — see the file header.
//
// `forceApprove` is the admin override on the balance check below, and NOTHING ELSE — every
// other guard (already-actioned, missing type, empty range) still applies. It exists because
// the balance is a school's own policy, not a law: a person genuinely out of sick days
// sometimes still has to be granted the leave, and the alternative was an admin editing the
// leave type's cap for everybody just to let one request through.
// ---------------------------------------------------------------------------
let ApproveLeaveRequest = async (req, res, next) => {
    const { actionBy, forceApprove } = req.body;
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
        //
        // USAGE COMES FROM THE AGGREGATION, ALLOCATION FROM THE ASSIGNMENT. The assignment's
        // own usedDays counter is deliberately not consulted here: it is a convenience for
        // the entitlement grid and could drift, and a drifted counter must never be able to
        // block a leave. What the assignment does own is the per-person cap.
        const [usedByTypeId, assignment] = await Promise.all([
            getUsedDaysByType(request.adminId, request.personType, request.personId, request.year, id),
            PersonLeaveAssignmentModel.findOne({
                adminId: request.adminId,
                personType: request.personType,
                personId: request.personId,
                leaveTypeId: String(request.leaveTypeId),
            }).lean(),
        ]);
        // NO ENTITLEMENT, NO APPROVAL — and forceApprove deliberately does not reach this.
        // The override below is about how MANY days a person may have; this is about whether
        // they were ever given this kind of leave at all, which is a decision made once on
        // the Leave Limits page rather than something to wave through from an approval
        // dialog. Falling back to the leave type's school-wide cap here is what previously
        // let anybody be approved for anything.
        if (!assignment) {
            return res.status(400).json(
                'This person has not been assigned this leave type — assign it first before approving!',
            );
        }

        const used = usedByTypeId.get(String(request.leaveTypeId)) || 0;
        const allocated = assignment.allocatedDays;

        if (!forceApprove && used + dateKeys.length > allocated) {
            return res.status(400).json(
                `Not enough ${leaveType.name} balance: ${allocated - used} day(s) left, ${dateKeys.length} requested!`,
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
            // Keep the entitlement grid's running counter in step. NOT an upsert and NOT a
            // guard: a person who was never bulk-assigned this type simply has no row, and
            // matching nothing is the correct outcome — the approval above has already been
            // authorised by the aggregation, which needs no assignment row to work. This
            // must never be able to block a leave from being granted.
            await PersonLeaveAssignmentModel.updateOne(
                {
                    adminId: request.adminId,
                    personType: request.personType,
                    personId: request.personId,
                    leaveTypeId: String(request.leaveTypeId),
                },
                { $inc: { usedDays: dateKeys.length } },
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
// PATCH /:id/cancel  { cancellationReason, actionBy }
//
// TAKING BACK AN APPROVED LEAVE WITHOUT LOSING THE RECORD. Delete below is the other undo and
// erases the request entirely; cancel keeps it, with a reason, and only removes what the
// approval wrote. Which one an admin wants is a real distinction — a leave that was granted
// and then withdrawn is part of a person's history, a leave approved by mis-click is not.
//
// Only an Approved request can be cancelled: Pending has written nothing to take back, and
// Rejected never granted anything in the first place.
//
// The deleteMany is narrowed to isOverridden + MANUAL rows, unlike delete's broader match, so
// a day that somehow carries this leaveRequestId without being one of the rows the approval
// wrote is left alone rather than silently removed.
// ---------------------------------------------------------------------------
let CancelLeaveRequest = async (req, res, next) => {
    const { cancellationReason, actionBy } = req.body;
    try {
        const id = req.params.id;
        const request = await LeaveRequestModel.findOne({ _id: id }).lean();
        if (!request) return res.status(404).json('Leave request not found!');
        if (request.status !== 'Approved') {
            return res.status(400).json('Only an approved leave can be cancelled!');
        }
        // A LEAVE THAT HAS ALREADY BEEN TAKEN CANNOT BE UN-TAKEN. Once the last day has
        // passed, cancelling would delete attendance rows for days that are now history and
        // hand back balance for leave the person actually spent. The list hides the button on
        // such a row, but this is the check that counts — the route is reachable without it.
        //
        // toDate, not fromDate: a leave still running is cancellable for the days remaining.
        // School wall clock for the same reason as everywhere else in this file.
        const todayKey = toDateKey(toUtcMidnight(nowWallClock()));
        if (toDateKey(request.toDate) < todayKey) {
            return res.status(400).json('This leave has already been completed and cannot be cancelled!');
        }

        const now = new Date();
        let removedCount = 0;

        // Same reasoning as the approve and delete transactions: the attendance rows and the
        // request's own status must land together, or the calendar and the request disagree
        // about whether the leave still stands.
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            const removed = await DailyAttendanceModel.deleteMany(
                {
                    adminId: request.adminId,
                    leaveRequestId: String(request._id),
                    isOverridden: true,
                    source: 'MANUAL',
                },
                { session },
            );
            removedCount = removed.deletedCount || 0;

            // The mirror of the increment in ApproveLeaveRequest, clamped through a pipeline
            // update because $inc has no floor — exactly as DeleteLeaveRequest does it. A
            // person never bulk-assigned this type simply has no row, and matching nothing is
            // the correct outcome.
            await PersonLeaveAssignmentModel.updateOne(
                {
                    adminId: request.adminId,
                    personType: request.personType,
                    personId: request.personId,
                    leaveTypeId: String(request.leaveTypeId),
                },
                [{ $set: { usedDays: { $max: [0, { $subtract: ['$usedDays', request.dayCount || 0] }] } } }],
                { session },
            );

            // leaveDates and dayCount are KEPT. They are what the request granted, and the
            // cancelled card still reports it — this is a record, not a reset.
            await LeaveRequestModel.updateOne(
                { _id: id },
                {
                    $set: {
                        status: 'Cancelled',
                        cancellationReason: cancellationReason,
                        cancelledBy: actionBy || null,
                        cancelledAt: now,
                    },
                },
                { session },
            );
            await session.commitTransaction();
        } catch (writeError) {
            await session.abortTransaction();
            logger.error('leave-request.cancelWriteFailed', writeError);
            throw writeError;
        } finally {
            session.endSession();
        }

        logger.info('leave-request.cancelled', {
            adminId: request.adminId,
            leaveRequestId: String(request._id),
            personType: request.personType,
            removedCount,
        });

        // Those days now have no row at all, so the calendar reads them as Absent. Queue a
        // recompute so any real punches on them are turned back into a proper status.
        if (Array.isArray(request.leaveDates) && request.leaveDates.length > 0) {
            await enqueueReconcileForDates(request.adminId, request.leaveDates);
        }

        return res.status(200).json(`Leave cancelled. ${removedCount} attendance day(s) removed.`);
    } catch (error) {
        logger.error('leave-request.CancelLeaveRequest', error);
        return res.status(500).json('Internal Server Error!');
    }
}

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
                // The mirror of the increment in ApproveLeaveRequest. Without it, undoing an
                // approval would leave the entitlement grid permanently showing days the
                // person never actually spent — the aggregation would say one thing and the
                // grid another. Clamped through a pipeline update because $inc has no floor,
                // and a counter seeded before this feature existed could otherwise go
                // negative and render as a balance larger than the allocation.
                await PersonLeaveAssignmentModel.updateOne(
                    {
                        adminId: request.adminId,
                        personType: request.personType,
                        personId: request.personId,
                        leaveTypeId: String(request.leaveTypeId),
                    },
                    [{ $set: { usedDays: { $max: [0, { $subtract: ['$usedDays', request.dayCount || 0] }] } } }],
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
    CancelLeaveRequest,
    DeleteLeaveRequest,
}
