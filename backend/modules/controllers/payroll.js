'use strict';
const PayrollModel = require('../models/payroll');
const SalaryStructureModel = require('../models/salary-structure');
const SalaryGroupModel = require('../models/salary-group');
const SalaryPaymentModel = require('../models/salary-payment');
const StaffModel = require('../models/staff');
const {
    getPayrollAttendanceForStaff,
    getPayrollAttendanceForOne,
} = require('../services/payroll-attendance');
const logger = require('../helpers/logger');

// PAYROLL GENERATION.
//
// Day counts come from services/payroll-attendance.js, which reads them through the same
// services/attendance-calendar.js the admin calendar page renders — payroll never queries
// DailyAttendance itself. See that file header for why.
//
// Money is computed here and SNAPSHOTTED onto the record: basic, hra, allowances, deductions
// and calculationMode are all copies, so editing a SalaryGroup next April cannot retroactively
// change a payslip already produced (models/payroll.js).
//
// DRAFT -> LOCKED is one way. Regenerating a LOCKED record is refused; unlocking is a separate
// confirmed action that is itself refused once a payment exists against the record.

// ---------------------------------------------------------------------------
// SHARED CALCULATION HELPERS
// Used by both GeneratePayroll and BulkGeneratePayroll, so a single generate and a bulk one
// can never produce different numbers for the same staff-month.
// ---------------------------------------------------------------------------

// Money is rounded ONCE, at the end, and only here. Rounding intermediate values instead
// would let a gross of 26000 and its own components disagree by a rupee on screen.
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const sumComponents = (components) => (components || [])
    .reduce((total, component) => total + (Number(component.amount) || 0), 0);

// Components are stored back onto the Payroll as plain { name, amount } — the group document
// carries Mongoose subdocument machinery that has no business being snapshotted.
const cleanComponents = (components) => (components || []).map((component) => ({
    name: component.name,
    amount: money(component.amount),
}));

/**
 * The group values with any per-person override applied on top.
 *
 * `=== null || === undefined` IS THE TEST, NEVER TRUTHINESS. An overrideHra of 0 is a real
 * instruction (this person gets no HRA) and a falsy check would silently pay them the group
 * value against the school explicit decision. See models/salary-structure.js.
 */
const resolveEffectiveSalary = (group, structure) => {
    const hasValue = (value) => value !== null && value !== undefined;
    return {
        basic: hasValue(structure.overrideBasic) ? structure.overrideBasic : group.basic,
        hra: hasValue(structure.overrideHra) ? structure.overrideHra : group.hra,
        // Arrays REPLACE rather than merge — an empty override array means "this person gets
        // none", which is a different instruction from null ("use the group list").
        allowances: Array.isArray(structure.overrideAllowances)
            ? structure.overrideAllowances
            : (group.allowances || []),
        deductions: Array.isArray(structure.overrideDeductions)
            ? structure.overrideDeductions
            : (group.deductions || []),
    };
};

/**
 * The two pay formulas, exactly as specified.
 *
 * @param {Object} effective from resolveEffectiveSalary
 * @param {String} calculationMode 'perMonth' | 'perDay'
 * @param {Object} counts from services/payroll-attendance.js
 * @returns {Object|{ error: String }} the money fields, or a specific refusal
 */
const calculatePay = (effective, calculationMode, counts) => {
    const allowanceTotal = sumComponents(effective.allowances);
    const deductionTotal = sumComponents(effective.deductions);
    const baseRate = (Number(effective.basic) || 0) + (Number(effective.hra) || 0) + allowanceTotal;

    if (calculationMode === 'perDay') {
        // The amounts on the group are PER-DAY rates, so attendance is already inside gross.
        // Paid leave is payable; unpaid leave and absences simply are not counted.
        const payableDays = counts.presentDays + counts.leaveDays;
        const grossSalary = baseRate * payableDays;
        // Deductions stay FLAT here — scaling them by attendance too would charge for the
        // same absence twice, once through the smaller gross and again through the deduction.
        return {
            grossSalary: money(grossSalary),
            attendanceDeduction: 0,
            totalDeductions: money(deductionTotal),
            netSalary: money(grossSalary - deductionTotal),
        };
    }

    // perMonth: the amounts are a full month, and attendance bites through a deduction.
    if (!counts.totalWorkingDays || counts.totalWorkingDays <= 0) {
        // Dividing by this would produce Infinity and a netSalary of -Infinity, which would
        // save happily and be discovered on a payslip. Refuse with the actual cause instead:
        // an empty roster, or a month that has not started.
        return { error: 'No working days found for this month. Check the roster and attendance first!' };
    }
    const grossSalary = baseRate;
    const unpaidDays = counts.absentDays + counts.unpaidLeaveDays;
    const attendanceDeduction = (grossSalary / counts.totalWorkingDays) * unpaidDays;
    const totalDeductions = deductionTotal + attendanceDeduction;
    return {
        grossSalary: money(grossSalary),
        attendanceDeduction: money(attendanceDeduction),
        totalDeductions: money(totalDeductions),
        netSalary: money(grossSalary - totalDeductions),
    };
};

// The complete $set for one payroll record. Kept in one place so the single and bulk paths
// write identical shapes.
const buildPayrollFields = ({ adminId, staffId, month, year, group, effective, counts, pay }) => ({
    adminId: adminId,
    staffId: staffId,
    month: month,
    year: year,
    salaryGroupId: group._id.toString(),
    calculationMode: group.calculationMode,
    presentDays: counts.presentDays,
    absentDays: counts.absentDays,
    halfDays: counts.halfDays,
    leaveDays: counts.leaveDays,
    unpaidLeaveDays: counts.unpaidLeaveDays,
    holidayDays: counts.holidayDays,
    totalWorkingDays: counts.totalWorkingDays,
    basic: money(effective.basic),
    hra: money(effective.hra),
    allowances: cleanComponents(effective.allowances),
    deductions: cleanComponents(effective.deductions),
    grossSalary: pay.grossSalary,
    attendanceDeduction: pay.attendanceDeduction,
    totalDeductions: pay.totalDeductions,
    netSalary: pay.netSalary,
    // A regenerated record returns to DRAFT explicitly. It could only have been DRAFT to get
    // here (LOCKED is refused above), but stating it means a future caller cannot regenerate
    // into a half-locked state.
    status: 'DRAFT',
    generatedAt: new Date(),
    lockedAt: null,
    lockedBy: null,
});

/**
 * paymentStatus for a page of payroll rows, derived from the payments recorded against them.
 * ONE aggregation for the whole page, never one per row.
 *
 * Nothing stores this — see models/payroll.js. The sum is the truth.
 */
const getPaidByPayrollId = async (adminId, payrollIds) => {
    const paidById = new Map();
    if (payrollIds.length === 0) return paidById;
    const grouped = await SalaryPaymentModel.aggregate([
        { $match: { adminId: adminId, payrollId: { $in: payrollIds } } },
        { $group: { _id: '$payrollId', paid: { $sum: '$amountPaid' } } },
    ]);
    for (const entry of grouped) paidById.set(String(entry._id), entry.paid);
    return paidById;
};

const paymentStatusOf = (netSalary, paid) => {
    if (!paid || paid <= 0) return 'Unpaid';
    // >= rather than ===: a rounding remainder of a paisa must not leave a fully settled
    // payroll reading as Partially Paid forever.
    if (paid >= netSalary) return 'Fully Paid';
    return 'Partially Paid';
};

// ---------------------------------------------------------------------------
// POST /generate
// ---------------------------------------------------------------------------
let GeneratePayroll = async (req, res, next) => {
    try {
        const { adminId, staffId, month, year } = req.body;

        const [staff, existing, structure] = await Promise.all([
            StaffModel.findOne({ _id: staffId, adminId: adminId }, { _id: 1, name: 1 }).lean(),
            PayrollModel.findOne({ adminId: adminId, staffId: staffId, year: year, month: month }).lean(),
            SalaryStructureModel.findOne({ adminId: adminId, staffId: staffId }).lean(),
        ]);

        if (!staff) {
            return res.status(404).json('Staff member not found!');
        }
        // THE LOCK GUARD. Never a silent overwrite — a locked payroll is a decision somebody
        // made, and quietly replacing it would also invalidate any payment recorded against it.
        if (existing && existing.status === 'LOCKED') {
            return res.status(400).json('This payroll is locked. Unlock it before regenerating!');
        }
        if (!structure) {
            return res.status(400).json('No salary group is assigned to this staff member!');
        }

        const group = await SalaryGroupModel.findOne({ _id: structure.salaryGroupId, adminId: adminId }).lean();
        if (!group) {
            return res.status(400).json('The assigned salary group no longer exists!');
        }

        const counts = await getPayrollAttendanceForOne({ adminId, staffId, year, month });
        const effective = resolveEffectiveSalary(group, structure);
        const pay = calculatePay(effective, group.calculationMode, counts);
        if (pay.error) {
            return res.status(400).json(pay.error);
        }

        const fields = buildPayrollFields({ adminId, staffId, month, year, group, effective, counts, pay });
        const payroll = await PayrollModel.findOneAndUpdate(
            { adminId: adminId, staffId: staffId, year: year, month: month },
            { $set: fields, $setOnInsert: { createdAt: new Date() } },
            { upsert: true, new: true },
        );

        logger.info('payroll.generated', {
            adminId: adminId, staffId: staffId, year: year, month: month,
            netSalary: payroll.netSalary, mode: group.calculationMode,
        });

        return res.status(200).json({ successMsg: 'Payroll generated successfully.', payroll: payroll });
    } catch (error) {
        logger.error('payroll.GeneratePayroll', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /bulk-generate
//
// ONE attendance read for the whole selection, not one per staff member — that is what makes
// generating a 60-person school affordable.
//
// A staff member who cannot be generated (locked, unassigned, no working days) is SKIPPED and
// reported, never allowed to abort the batch. An admin who selected twelve people and got a
// single error message would have no way to tell which one caused it.
// ---------------------------------------------------------------------------
let BulkGeneratePayroll = async (req, res, next) => {
    try {
        const { adminId, month, year, staffIds } = req.body;
        const uniqueStaffIds = [...new Set(staffIds.map(String))];

        const [staffList, existingList, structures, countsByStaffId] = await Promise.all([
            StaffModel.find({ _id: { $in: uniqueStaffIds }, adminId: adminId }, { _id: 1, name: 1 }).lean(),
            PayrollModel.find(
                { adminId: adminId, staffId: { $in: uniqueStaffIds }, year: year, month: month },
                { staffId: 1, status: 1 },
            ).lean(),
            SalaryStructureModel.find({ adminId: adminId, staffId: { $in: uniqueStaffIds } }).lean(),
            getPayrollAttendanceForStaff({ adminId, staffIds: uniqueStaffIds, year, month }),
        ]);

        const staffById = new Map(staffList.map((staff) => [staff._id.toString(), staff]));
        const lockedStaffIds = new Set(
            existingList.filter((row) => row.status === 'LOCKED').map((row) => String(row.staffId)),
        );
        const structureByStaffId = new Map(structures.map((s) => [String(s.staffId), s]));

        // Only the groups this selection references.
        const groupIds = [...new Set(structures.map((s) => String(s.salaryGroupId)))];
        const groups = groupIds.length > 0
            ? await SalaryGroupModel.find({ _id: { $in: groupIds }, adminId: adminId }).lean()
            : [];
        const groupById = new Map(groups.map((group) => [group._id.toString(), group]));

        const writeOps = [];
        const skipped = [];

        for (const staffId of uniqueStaffIds) {
            const staff = staffById.get(staffId);
            const name = staff ? staff.name : staffId;
            if (!staff) {
                skipped.push({ staffId, name, reason: 'Staff member not found' });
                continue;
            }
            if (lockedStaffIds.has(staffId)) {
                skipped.push({ staffId, name, reason: 'Payroll already locked' });
                continue;
            }
            const structure = structureByStaffId.get(staffId);
            if (!structure) {
                skipped.push({ staffId, name, reason: 'No salary group assigned' });
                continue;
            }
            const group = groupById.get(String(structure.salaryGroupId));
            if (!group) {
                skipped.push({ staffId, name, reason: 'Assigned salary group no longer exists' });
                continue;
            }

            // A staff member with no calendar row at all comes back absent from the map; the
            // zeroed counts then fail the working-days guard below with the right message.
            const counts = countsByStaffId.get(staffId) || {
                presentDays: 0, absentDays: 0, halfDays: 0, leaveDays: 0,
                unpaidLeaveDays: 0, holidayDays: 0, totalWorkingDays: 0,
            };
            const effective = resolveEffectiveSalary(group, structure);
            const pay = calculatePay(effective, group.calculationMode, counts);
            if (pay.error) {
                skipped.push({ staffId, name, reason: pay.error });
                continue;
            }

            writeOps.push({
                updateOne: {
                    filter: { adminId: adminId, staffId: staffId, year: year, month: month },
                    update: {
                        $set: buildPayrollFields({ adminId, staffId, month, year, group, effective, counts, pay }),
                        $setOnInsert: { createdAt: new Date() },
                    },
                    upsert: true,
                },
            });
        }

        if (writeOps.length > 0) {
            await PayrollModel.bulkWrite(writeOps, { ordered: false });
        }

        logger.info('payroll.bulkGenerated', {
            adminId: adminId, year: year, month: month,
            requested: uniqueStaffIds.length, generated: writeOps.length, skipped: skipped.length,
        });

        return res.status(200).json({ generated: writeOps.length, skipped: skipped });
    } catch (error) {
        logger.error('payroll.BulkGeneratePayroll', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// POST /payroll-pagination
//
// THE GENERATE TAB IS A STAFF LIST, NOT A PAYROLL LIST.
//
// Paging Payroll rows would render an empty table for any month nothing has been generated
// for — which is every month, before the admin does the one thing the tab exists for. Worse,
// there would be no row to press Generate on. So this pages ACTIVE STAFF and attaches each
// person payroll for the chosen month, exactly as the Fees page lists students and attaches
// what they have paid.
//
// Four queries per page regardless of page size: the staff page, their payroll rows, the
// payments against those, and the salary assignments. Never one lookup per row.
// ---------------------------------------------------------------------------
let GetPayrollPagination = async (req, res, next) => {
    try {
        const adminId = req.body.adminId;
        const filters = req.body.filters || {};
        const month = parseInt(filters.month);
        const year = parseInt(filters.year);
        if (!month || !year) {
            return res.status(400).json('A month and year are required!');
        }

        // Only active staff — an inactive one is not being paid this month.
        const staffFilter = { adminId: adminId, status: 'active' };
        if (filters.searchText) {
            staffFilter.name = new RegExp(`${filters.searchText.toString().trim()}`, 'i');
        }

        const limit = (req.body.limit) ? parseInt(req.body.limit) : 10;
        const page = req.body.page || 1;

        const [staffList, countStaff] = await Promise.all([
            StaffModel.find(staffFilter, { name: 1, empCode: 1 }).sort({ name: 1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean(),
            StaffModel.count(staffFilter),
        ]);

        const staffIds = staffList.map((staff) => staff._id.toString());
        const [payrollRows, structures] = await Promise.all([
            staffIds.length > 0
                ? PayrollModel.find({
                    adminId: adminId, staffId: { $in: staffIds }, year: year, month: month,
                }).lean()
                : [],
            staffIds.length > 0
                ? SalaryStructureModel.find(
                    { adminId: adminId, staffId: { $in: staffIds } }, { staffId: 1, salaryGroupId: 1 },
                ).lean()
                : [],
        ]);

        const payrollByStaffId = new Map(payrollRows.map((row) => [String(row.staffId), row]));
        const groupIdByStaffId = new Map(structures.map((s) => [String(s.staffId), String(s.salaryGroupId)]));

        const groupIds = [...new Set(groupIdByStaffId.values())];
        const [paidById, groups] = await Promise.all([
            getPaidByPayrollId(adminId, payrollRows.map((row) => row._id.toString())),
            groupIds.length > 0
                ? SalaryGroupModel.find({ _id: { $in: groupIds } }, { name: 1 }).lean()
                : [],
        ]);
        const groupNameById = new Map(groups.map((group) => [group._id.toString(), group.name]));

        let payrollList = staffList.map((staff) => {
            const staffId = staff._id.toString();
            const payroll = payrollByStaffId.get(staffId) || null;
            const paid = payroll ? (paidById.get(payroll._id.toString()) || 0) : 0;
            const groupId = groupIdByStaffId.get(staffId);
            return {
                staffId: staff._id,
                staffName: staff.name,
                empCode: staff.empCode || '',
                // '' rather than a placeholder — the frontend renders "Not assigned" so the
                // wording lives with the rest of the UI copy.
                salaryGroupName: groupId ? (groupNameById.get(groupId) || '') : '',
                isAssigned: !!groupId,
                month: month,
                year: year,
                payrollId: payroll ? payroll._id : null,
                // '' means "not generated yet", which is a third state the DRAFT/LOCKED enum
                // has no room for and the row has to be able to show.
                status: payroll ? payroll.status : '',
                grossSalary: payroll ? payroll.grossSalary : 0,
                totalDeductions: payroll ? payroll.totalDeductions : 0,
                netSalary: payroll ? payroll.netSalary : 0,
                amountPaid: money(paid),
                paymentStatus: payroll ? paymentStatusOf(payroll.netSalary, paid) : '',
            };
        });

        // Derived, so it cannot be part of the query — a status-filtered page can come back
        // shorter than the limit. That is the honest cost of a staff-first list, and it is
        // preferable to hiding the ungenerated rows the tab exists to act on.
        if (filters.status && filters.status !== 'all') {
            payrollList = filters.status === 'notGenerated'
                ? payrollList.filter((row) => row.status === '')
                : payrollList.filter((row) => row.status === filters.status);
        }

        return res.json({ payrollList: payrollList, countStaff: countStaff });
    } catch (error) {
        logger.error('payroll.GetPayrollPagination', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// The itemised breakdown behind the View action, with the staff name and payment state the
// modal shows alongside it.
let GetSinglePayroll = async (req, res, next) => {
    try {
        const payroll = await PayrollModel.findOne({ _id: req.params.id }).lean();
        if (!payroll) return res.status(404).json('Payroll not found!');

        const [staff, payments] = await Promise.all([
            StaffModel.findOne({ _id: payroll.staffId }, { name: 1, empCode: 1 }).lean(),
            SalaryPaymentModel.find({ payrollId: payroll._id.toString() }).sort({ paymentDate: -1 }).lean(),
        ]);
        const paid = payments.reduce((total, payment) => total + (payment.amountPaid || 0), 0);

        return res.status(200).json({
            ...payroll,
            staffName: staff ? staff.name : '',
            empCode: staff ? (staff.empCode || '') : '',
            amountPaid: money(paid),
            paymentStatus: paymentStatusOf(payroll.netSalary, paid),
            payments: payments,
        });
    } catch (error) {
        logger.error('payroll.GetSinglePayroll', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// PUT /:id/lock
// ---------------------------------------------------------------------------
let LockPayroll = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { adminId, lockedBy } = req.body;

        const payroll = await PayrollModel.findOne({ _id: id, adminId: adminId });
        if (!payroll) return res.status(404).json('Payroll not found!');
        if (payroll.status === 'LOCKED') {
            return res.status(400).json('This payroll is already locked!');
        }

        await PayrollModel.findByIdAndUpdate(id, {
            $set: { status: 'LOCKED', lockedAt: new Date(), lockedBy: lockedBy || adminId },
        });

        logger.info('payroll.locked', { adminId: adminId, payrollId: id, lockedBy: lockedBy || adminId });
        return res.status(200).json('Payroll locked successfully.');
    } catch (error) {
        logger.error('payroll.LockPayroll', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// PUT /:id/unlock
//
// validators/payroll.js already enforces `confirm: true` — a request without it never reaches
// this handler. The check that matters here is the payment one.
// ---------------------------------------------------------------------------
let UnlockPayroll = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { adminId, unlockedBy } = req.body;

        const payroll = await PayrollModel.findOne({ _id: id, adminId: adminId });
        if (!payroll) return res.status(404).json('Payroll not found!');
        if (payroll.status !== 'LOCKED') {
            return res.status(400).json('This payroll is not locked!');
        }

        // A payment recorded against this payroll was recorded against THIS netSalary.
        // Unlocking would let a regeneration move that number out from under money the school
        // has already paid, leaving a payment that reconciles against nothing.
        const payment = await SalaryPaymentModel.findOne({ payrollId: id });
        if (payment) {
            return res.status(400).json('A payment has already been recorded against this payroll and it cannot be unlocked!');
        }

        await PayrollModel.findByIdAndUpdate(id, {
            $set: {
                status: 'DRAFT',
                lockedAt: null,
                unlockedAt: new Date(),
                unlockedBy: unlockedBy || adminId,
            },
        });

        // Logged because this is the one action in the module that reverses a finalised
        // decision, and the log is the only place that fact survives a re-lock.
        logger.info('payroll.unlocked', {
            adminId: adminId, payrollId: id, unlockedBy: unlockedBy || adminId,
            staffId: payroll.staffId, year: payroll.year, month: payroll.month,
        });
        return res.status(200).json('Payroll unlocked successfully.');
    } catch (error) {
        logger.error('payroll.UnlockPayroll', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GeneratePayroll,
    BulkGeneratePayroll,
    GetPayrollPagination,
    GetSinglePayroll,
    LockPayroll,
    UnlockPayroll,
}
