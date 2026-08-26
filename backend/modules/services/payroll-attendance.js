'use strict';
const LeaveTypeModel = require('../models/leave-type');
const { getSchoolMonthGrid } = require('./attendance-calendar');
const { getLeaveMapForSchoolMonth } = require('./leave-lookup');

// THE ONE PLACE PAYROLL LEARNS HOW MANY DAYS SOMEBODY WORKED.
//
// Express-unaware and called in-process, the same as roster-lookup.js, leave-lookup.js and
// holiday-lookup.js.
//
// IT DOES NOT QUERY DailyAttendance. That is the whole point of the file.
//
// 'Absent' is not stored anywhere — see the header of models/daily-attendance.js. Rows exist
// only for people who actually punched, and an absence is DERIVED at read time from the
// missing row on a day the person was expected, where "expected" itself depends on their
// Roster. services/attendance-calendar.js owns that derivation, along with the precedence
// between a real row, a Holiday, an approved Leave and a future date.
//
// Re-implementing any of that here would give payroll a second opinion about the same month.
// It would be right most of the time, wrong occasionally, and the admin checking a payslip
// against the attendance calendar would have no way to tell which screen was lying. So this
// file calls the calendar and COUNTS what it returns — nothing more.
//
// The one thing the calendar does not answer is whether a Leave day was PAID, because paid
// vs unpaid is a payroll question rather than an attendance one. That comes from
// leave-lookup.js (which leave request covered the day) joined to LeaveType.isPaid.
//
// BATCHED BY (school, month), never per person: a fixed number of round-trips whether the
// caller asks about one staff member or eighty. That is what makes BulkGeneratePayroll cheap
// enough to run for a whole school in one click.

// A person is only ever half present or half absent — no other fraction arises. Kept as a
// named constant so the two places it is applied cannot drift apart.
const HALF_DAY_WEIGHT = 0.5;

// Floating point turns 0.5 + 0.5 + 0.5 into 1.5000000000000002 often enough to show up in a
// day count. Every count here is a multiple of 0.5, so one rounding at the end is exact.
const roundDays = (value) => Math.round(value * 2) / 2;

const emptyCounts = () => ({
    presentDays: 0,
    absentDays: 0,
    halfDays: 0,
    leaveDays: 0,
    unpaidLeaveDays: 0,
    holidayDays: 0,
    totalWorkingDays: 0,
});

/**
 * Counts one month for one person out of the calendar row the grid already produced.
 *
 * @param {Object} row       one entry of getSchoolMonthGrid().rows — carries days[] and summary
 * @param {Map}    leaveMap  "YYYY-MM-DD" -> LeaveRequest, for this person only
 * @param {Map}    isPaidByLeaveTypeId  leaveTypeId -> Boolean
 * @returns {Object} the counts payroll needs
 */
const countRow = (row, leaveMap, isPaidByLeaveTypeId) => {
    const summary = row.summary || {};
    const present = summary.Present || 0;
    const late = summary.Late || 0;
    const halfDay = summary.HalfDay || 0;
    const absent = summary.Absent || 0;
    const leave = summary.Leave || 0;
    const holiday = summary.Holiday || 0;

    // Paid vs unpaid needs the leave TYPE behind each day, which the summary does not carry —
    // so the Leave days are walked individually. Everything else is a summary read.
    let leaveDays = 0;
    let unpaidLeaveDays = 0;
    for (const day of row.days || []) {
        if (day.status !== 'Leave') continue;
        const request = leaveMap.get(day.dateKey);
        // NO MATCHING APPROVED REQUEST MEANS PAID.
        //
        // Approval through the Leave module always writes a resolvable leaveRequestId, so an
        // unresolvable Leave day is a MANUAL row an admin entered by hand
        // (controllers/attendance.js CreateManualAttendance). Somebody deliberately marked
        // that day as leave; docking pay for it would turn an admin correction into a silent
        // pay cut nobody asked for. Defaulting the other way is the failure that costs a
        // person money, so this defaults to paid.
        const isPaid = request
            ? isPaidByLeaveTypeId.get(String(request.leaveTypeId)) !== false
            : true;
        if (isPaid) leaveDays += 1;
        else unpaidLeaveDays += 1;
    }

    return {
        // A Late arrival is still a day worked — graceMinutes on the shift already decided it
        // was late rather than absent, and docking it again here would charge twice for the
        // same lateness.
        presentDays: roundDays(present + late + (halfDay * HALF_DAY_WEIGHT)),
        absentDays: roundDays(absent + (halfDay * HALF_DAY_WEIGHT)),
        halfDays: halfDay,
        leaveDays,
        unpaidLeaveDays,
        holidayDays: holiday,
        // Days in the month MINUS the days this person was not expected at all. 'Off' is how
        // attendance-calendar.js expresses an unrostered day, which is where a weekly off
        // actually lives for staff — so a Mon-Sat staffer and a Mon-Fri one correctly get
        // different divisors, rather than a fixed "minus Sundays" that suits neither.
        //
        // A future day with nothing known carries status '' and lands in no bucket, so
        // generating mid-month naturally counts only the days that have happened.
        totalWorkingDays: roundDays(present + late + halfDay + absent + leave + holiday),
    };
};

/**
 * Day counts for several staff members over one month.
 *
 * Three queries in total regardless of how many staff are asked for: the calendar grid, the
 * approved leave for the school, and the leave types for the school.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {String[]} args.staffIds
 * @param {Number} args.year
 * @param {Number} args.month 1-12 (August = 8), matching helpers/date-only.js
 * @returns {Promise<Map<String, Object>>} staffId -> counts. A staff member with no calendar
 *   row at all is absent from the map; callers treat that as "nothing to pay for".
 */
const getPayrollAttendanceForStaff = async ({ adminId, staffIds, year, month }) => {
    const byStaffId = new Map();
    if (!adminId || !Array.isArray(staffIds) || staffIds.length === 0 || !year || !month) {
        return byStaffId;
    }

    const wanted = new Set(staffIds.map(String));

    const [grid, leaveByPersonId, leaveTypes] = await Promise.all([
        // The whole school-month in one batched read. Narrowing it to `wanted` server-side
        // would need a second read shape in attendance-calendar.js, and the grid is already a
        // fixed number of queries — so the selection is applied in memory below.
        getSchoolMonthGrid({ adminId, personType: 'staff', year, month }),
        getLeaveMapForSchoolMonth(adminId, 'staff', year, month),
        LeaveTypeModel.find({ adminId }, { isPaid: 1 }).lean(),
    ]);

    const isPaidByLeaveTypeId = new Map(
        leaveTypes.map((leaveType) => [leaveType._id.toString(), !!leaveType.isPaid]),
    );
    // Reused for everyone with no approved leave this month, so the common case allocates
    // nothing per person.
    const emptyLeaveMap = new Map();

    for (const row of grid.rows || []) {
        const staffId = String(row.person && row.person._id);
        if (!wanted.has(staffId)) continue;
        byStaffId.set(
            staffId,
            countRow(row, leaveByPersonId.get(staffId) || emptyLeaveMap, isPaidByLeaveTypeId),
        );
    }

    return byStaffId;
};

/**
 * One staff member and one month. Delegates to the batched form so there is exactly one
 * implementation of the counting rules.
 *
 * @returns {Promise<Object>} the counts, or a zeroed set when the person has no calendar row
 *   (inactive, or newly added with no attendance yet). Zeroed rather than null so the caller
 *   can report "0 working days" as the specific problem it is.
 */
const getPayrollAttendanceForOne = async ({ adminId, staffId, year, month }) => {
    const byStaffId = await getPayrollAttendanceForStaff({
        adminId, staffIds: [staffId], year, month,
    });
    return byStaffId.get(String(staffId)) || emptyCounts();
};

module.exports = { getPayrollAttendanceForStaff, getPayrollAttendanceForOne, emptyCounts };
