'use strict';
const AttendanceRecordV2Model = require('../../models/attendance/attendance-record');
const LeaveTypeV2Model = require('../../models/leave/leave-type');
const { resolveDays, loadLeaveDays, personKey } = require('../calendar/working-day');
const { eachKey } = require('../../helpers/calendar/working-day-rules');
const { monthRange, summarizeMonth } = require('../../helpers/payroll/payroll-rules');

// Payroll's attendance input — per staff member, the FULL month's day types from THE
// working-day resolver (holiday template, roster weekly-off, approved leave) plus that
// month's AttendanceRecord statuses. Batched: any headcount is a constant handful of
// queries (resolver + one AttendanceRecord scan + one leave-day scan + one LeaveType read),
// never a query per person or per day.

/**
 * @returns {Promise<Map<staffId, summary>>} summary per helpers/payroll/payroll-rules.js summarizeMonth
 */
const summarizeStaffMonth = async (adminId, staffIds, year, month, todayKey) => {
    const result = new Map();
    if (!staffIds.length) return result;
    const { fromKey, toKey } = monthRange(year, month);
    const people = staffIds.map((personId) => ({ personType: 'staff', personId: String(personId) }));

    const [dayTypes, leaveDays, records, leaveTypes] = await Promise.all([
        resolveDays(adminId, { people, fromKey, toKey }),
        loadLeaveDays(adminId, people, fromKey, toKey),
        AttendanceRecordV2Model.find(
            { adminId, personType: 'staff', personId: { $in: people.map((p) => p.personId) }, dateKey: { $gte: fromKey, $lte: toKey }, deletedAt: null },
            { personId: 1, dateKey: 1, status: 1 }
        ).lean(),
        LeaveTypeV2Model.find({ adminId }, { isPaid: 1 }).lean(),
    ]);

    const paid = new Map(leaveTypes.map((row) => [String(row._id), row.isPaid !== false]));
    const statusOf = new Map(records.map((row) => [`${row.personId}|${row.dateKey}`, row.status]));
    const keys = eachKey(fromKey, toKey);

    people.forEach(({ personId }) => {
        const key = personKey('staff', personId);
        const types = dayTypes.get(key) || new Map();
        const leaves = leaveDays.get(key) || new Map();
        const days = keys.map((dateKey) => {
            const leaveTypeId = leaves.get(dateKey);
            return {
                dateKey,
                dayType: types.get(dateKey) || 'Working',
                status: statusOf.get(`${personId}|${dateKey}`) || null,
                leavePaid: leaveTypeId ? paid.get(String(leaveTypeId)) !== false : true,
            };
        });
        result.set(personId, summarizeMonth(days, todayKey));
    });
    return result;
};

module.exports = { summarizeStaffMonth };
