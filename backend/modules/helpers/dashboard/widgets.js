'use strict';
const mongoose = require('mongoose');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const StaffV2Model = require('../../models/staff/staff');
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const FeePaymentModel = require('../../models/fees/fee-payment');
const HolidayV2Model = require('../../models/holiday/holiday');
const { toUtcMidnight } = require('../date-only');
const { SOURCES } = require('../approvals/sources');
const { unionAggregate, describeRows } = require('../approvals/inbox-query');
const {
    buildWeekBars, weekStartKey, feeDonut, monthBounds, holidayDaysInMonth, QUICK_ACTIONS, canActOn,
} = require('./dashboard-rules');

// THE Dashboard widget registry (dashboard.md / errors.md / optimization.md). Every card on
// the page is one entry here; adding a future chart means adding one entry — the controller,
// cache, permission filter and live-hint wiring all read this list and nothing else.
//
// Entry contract:
//   key         stable id — response slice name, cache-key segment, GET /widgets/:key
//   permission  the Roles & Permissions module whose VIEW the viewer needs, or null (no data)
//   tier        'long'  — cached, busted by the writes that change it (cache-invalidation.js)
//               'short' — cached briefly, NOT busted per write; a throttled live hint
//                         refreshes it instead (services/dashboard/hint-publisher.js)
//               'none'  — computed per viewer, never cached (it holds no school data)
//   qualifier   ctx → the day/month the slice belongs to (part of the cache key)
//   load        ctx → the slice's school-wide data. EVERY query's first $match field is
//               ctx.adminId, which comes from the verified token only (assertAdminScope).
//   personalize (slice, ctx) → slice; optional per-viewer step run AFTER the cache read, so
//               a cached school-wide slice never carries one viewer's grants to another.
//   hint        true → writes publish a throttled `dashboard:widget-changed` for it.

const TTL = Object.freeze({ long: 600, short: 45 });

const oid = (id) => new mongoose.Types.ObjectId(String(id));

const ATTENDANCE_PERSON_TYPES = ['staff', 'student'];

// --- loaders --------------------------------------------------------------------------

// Same count Manage Students' "Total Students" shows — this session's enrollments.
const loadStudents = async ({ adminId, sessionId }) => ({
    total: sessionId ? await StudentEnrollmentModel.countDocuments({ adminId, sessionId: oid(sessionId) }) : 0,
});

const loadStaff = async ({ adminId }) => ({
    total: await StaffV2Model.countDocuments({ adminId, status: 'active' }),
});

// One pipeline for the hero's today % AND the week's 7 bars, whole school (staff + students).
const loadAttendance = async ({ adminId, todayKey }) => {
    const rows = await AttendanceRecordV2Model.aggregate([
        {
            $match: {
                adminId,
                personType: { $in: ATTENDANCE_PERSON_TYPES },
                date: { $gte: toUtcMidnight(weekStartKey(todayKey)), $lte: toUtcMidnight(todayKey) },
                deletedAt: null,
            },
        },
        { $group: { _id: { dateKey: '$dateKey', status: '$status' }, count: { $sum: 1 } } },
    ]);
    const bars = buildWeekBars(todayKey, rows);
    const today = bars[bars.length - 1];
    return { todayPct: today.pct, todayReason: today.reason, bars };
};

/**
 * Fee donut, one pipeline over the session's fee records (one per enrolled student):
 *   Collected = paid against this session's records + arrears cleared by payments taken in
 *               this session
 *   Due       = this session's due + every carried-forward arrear still owing
 * Per-record figures follow fee-ledger.js exactly (charge = totalFee + admissionFee −
 * concession; a payment counts where its allocations say, or in full against its own record
 * when it has none). The student's payments are joined on the indexed (adminId, studentId);
 * the sums happen in Mongo — never fetch-every-student-then-sum-in-Node (dashboard.md).
 */
const feePipeline = (adminId, sessionId) => {
    const charge = (r) => ({
        $max: [0, { $subtract: [{ $add: [{ $ifNull: [`${r}.totalFee`, 0] }, { $ifNull: [`${r}.admissionFee`, 0] }] }, { $ifNull: [`${r}.concession`, 0] }] }],
    });
    // What the student's payments put on record `rid` — `onlyThisSession` limits it to
    // payments collected in this session (an arrear's "collected now" share).
    const paidInto = (rid, onlyThisSession) => ({
        $sum: {
            $map: {
                input: onlyThisSession
                    ? { $filter: { input: '$pays', as: 'p', cond: { $eq: ['$$p.sessionId', sessionId] } } }
                    : '$pays',
                as: 'p',
                in: {
                    $cond: [
                        { $gt: [{ $size: { $ifNull: ['$$p.allocations', []] } }, 0] },
                        {
                            $sum: {
                                $map: {
                                    input: { $filter: { input: '$$p.allocations', as: 'a', cond: { $eq: ['$$a.recordId', rid] } } },
                                    as: 'a',
                                    in: '$$a.amount',
                                },
                            },
                        },
                        { $cond: [{ $eq: ['$$p.studentFeeRecordId', rid] }, '$$p.amount', 0] },
                    ],
                },
            },
        },
    });
    return [
        { $match: { adminId, sessionId, deletedAt: null } },
        { $project: { studentId: 1, totalFee: 1, admissionFee: 1, concession: 1, arrearIds: { $ifNull: ['$arrears.recordId', []] } } },
        {
            $lookup: {
                from: StudentFeeRecordModel.collection.name,
                localField: 'arrearIds',
                foreignField: '_id',
                as: 'arrearRecords',
            },
        },
        {
            $lookup: {
                from: FeePaymentModel.collection.name,
                let: { sid: '$studentId' },
                pipeline: [
                    { $match: { adminId, deletedAt: null } },
                    { $match: { $expr: { $eq: ['$studentId', '$$sid'] } } },
                    { $project: { amount: 1, studentFeeRecordId: 1, sessionId: 1, allocations: 1 } },
                ],
                as: 'pays',
            },
        },
        {
            $project: {
                charge: charge('$$ROOT'),
                currentPaid: paidInto('$_id', false),
                arrears: {
                    $map: {
                        input: { $filter: { input: '$arrearRecords', as: 'r', cond: { $and: [{ $eq: ['$$r.adminId', adminId] }, { $eq: [{ $ifNull: ['$$r.deletedAt', null] }, null] }] } } },
                        as: 'r',
                        in: { charge: charge('$$r'), paid: paidInto('$$r._id', false), paidNow: paidInto('$$r._id', true) },
                    },
                },
            },
        },
        {
            $project: {
                collected: { $add: [{ $min: ['$currentPaid', '$charge'] }, { $sum: '$arrears.paidNow' }] },
                due: {
                    $add: [
                        { $max: [0, { $subtract: ['$charge', '$currentPaid'] }] },
                        { $sum: { $map: { input: '$arrears', as: 'a', in: { $max: [0, { $subtract: ['$$a.charge', '$$a.paid'] }] } } } },
                    ],
                },
            },
        },
        { $group: { _id: null, collected: { $sum: '$collected' }, due: { $sum: '$due' } } },
    ];
};

const loadFees = async ({ adminId, sessionId }) => {
    if (!sessionId) return feeDonut(null);
    const [totals] = await StudentFeeRecordModel.aggregate(feePipeline(adminId, oid(sessionId)));
    return feeDonut(totals);
};

const loadCalendar = async ({ adminId, month }) => {
    const bounds = monthBounds(month);
    const holidays = await HolidayV2Model.find(
        { adminId, startDateKey: { $lte: bounds.endKey }, endDateKey: { $gte: bounds.startKey } },
        'startDateKey endDateKey'
    ).lean();
    return { month: bounds.monthKey, holidayDays: holidayDaysInMonth(bounds.monthKey, holidays) };
};

const UPCOMING_LIMIT = 2;
const loadHolidays = async ({ adminId, todayKey }) => {
    const rows = await HolidayV2Model.find({ adminId, endDateKey: { $gte: todayKey } }, 'name startDateKey endDateKey')
        .sort({ startDateKey: 1 })
        .limit(UPCOMING_LIMIT)
        .lean();
    return {
        rows: rows.map((row) => ({ _id: String(row._id), name: row.name, startDate: row.startDateKey, endDate: row.endDateKey })),
    };
};

// The same union the Approvals inbox runs (one pipeline per source, never per row), Pending
// only: a count and the newest few rows, described in one batch.
const PENDING_LIMIT = 2;
const loadApprovals = async ({ adminId, sessionId }) => {
    if (!sessionId) return { total: 0, rows: [] };
    const matchFor = (source) => source.match({ adminId, sessionId: String(sessionId), status: 'pending', personType: null, personIds: null });
    const [rows, totals] = await Promise.all([
        unionAggregate(SOURCES, matchFor, [{ $sort: { createdAt: -1, _id: -1 } }, { $limit: PENDING_LIMIT }]),
        unionAggregate(SOURCES, matchFor, [{ $count: 'total' }]),
    ]);
    const described = await describeRows(adminId, String(sessionId), rows);
    return {
        total: totals.length ? totals[0].total : 0,
        rows: described.map((row) => ({
            _id: row._id,
            type: row.type,
            typeLabel: row.typeLabel,
            name: row.name,
            days: row.info && row.info.days != null ? row.info.days : null,
            details: row.details,
        })),
    };
};

// Per viewer: the grant to act is the viewer's own, so it's added after the cache read.
const personalizeApprovals = (slice, { permissions, allows }) => ({
    ...slice,
    rows: slice.rows.map((row) => {
        const source = SOURCES.find((item) => item.type === row.type);
        return { ...row, canAct: canActOn(allows, permissions, source && source.permission) };
    }),
});

const loadQuickActions = async ({ permissions, allows }) => ({
    tiles: QUICK_ACTIONS.map((tile) => ({ key: tile.key, allowed: allows(permissions, tile.module, tile.action) })),
});

// --- the registry ---------------------------------------------------------------------

const today = (ctx) => ctx.todayKey;

const WIDGETS = Object.freeze([
    { key: 'students', permission: 'student', tier: 'long', load: loadStudents },
    { key: 'staff', permission: 'staff', tier: 'long', load: loadStaff },
    { key: 'attendance', permission: 'attendance', tier: 'short', qualifier: today, load: loadAttendance, hint: true },
    { key: 'fees', permission: 'fees', tier: 'long', load: loadFees },
    { key: 'calendar', permission: 'holiday', tier: 'long', qualifier: (ctx) => ctx.month, load: loadCalendar },
    { key: 'approvals', permission: 'approvals', tier: 'short', load: loadApprovals, personalize: personalizeApprovals, hint: true },
    { key: 'holidays', permission: 'holiday', tier: 'long', qualifier: today, load: loadHolidays },
    { key: 'quickActions', permission: null, tier: 'none', load: loadQuickActions },
].map(Object.freeze));

const WIDGET_KEYS = Object.freeze(WIDGETS.map((widget) => widget.key));
const HINT_WIDGETS = Object.freeze(WIDGETS.filter((widget) => widget.hint).map((widget) => widget.key));

const widgetFor = (key) => WIDGETS.find((widget) => widget.key === key) || null;

/** Whether this viewer may see a widget — the server-side gate every slice goes through. */
const canSee = (widget, permissions, allows) => !widget.permission || allows(permissions, widget.permission, 'view');

module.exports = {
    TTL, WIDGETS, WIDGET_KEYS, HINT_WIDGETS, widgetFor, canSee, feePipeline, PENDING_LIMIT, UPCOMING_LIMIT,
};
