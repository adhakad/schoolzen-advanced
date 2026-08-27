'use strict';
const SalarySlipModel = require('../models/salary-slip');
const PayrollModel = require('../models/payroll');
const SalaryPaymentModel = require('../models/salary-payment');
const SchoolModel = require('../models/school');
const DepartmentModel = require('../models/department');
const DesignationModel = require('../models/designation');
const { getModel, personCode } = require('../services/person-lookup');
const logger = require('../helpers/logger');

// THE SALARY SLIP.
//
// DIVISION OF RESPONSIBILITY MIRRORS THE FEE RECEIPT: this returns structured JSON and the
// frontend renders the printable HTML and drives the browser's print flow (printStudentData()
// in pages/admin/admin-student-fees-statement). No PDF is produced or stored here — there is
// no PDF library on the backend and adding one to duplicate what the browser already does
// would be a second rendering path to keep in sync.
//
// A slip is only issuable for a LOCKED payroll with at least one payment against it. A slip
// documents money that MOVED; a draft calculation is not that, and a locked-but-unpaid payroll
// is a promise rather than a payment.

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Bounded because the loop below is a retry against a unique index, not a search. Ten
// collisions in a row means something is wrong that another attempt will not fix.
const MAX_SEQUENCE_ATTEMPTS = 10;

/**
 * "SLIP-<school>-<YYYYMM>-<seq>".
 *
 * WHY NOT MIRROR receiptNo. The fee receipt numbers itself with
 * `Math.floor(Math.random() * 899999 + 100000)` (controllers/fees-collection.js) — a random
 * six-digit number with no uniqueness guarantee behind it. The slip spec asks for a number
 * that is unique AND sequential, and models/salary-slip.js declares slipNumber unique, so
 * copying that generator would produce collisions the index would then reject.
 *
 * The sequential convention this codebase actually has is the invoice counter in
 * controllers/payment.js (`Counter.findOneAndUpdate` + `$inc`), and that is what this follows
 * in spirit. It does not reuse the Counter document itself: Counter is keyed by year alone and
 * its `count` is already the invoice sequence, so incrementing it here would interleave two
 * unrelated numbering schemes and make both look like they had gaps.
 *
 * Sequence = how many slips this school has already issued for this month, +1. The uniqueness
 * guarantee is the INDEX, not this count — two concurrent generations can compute the same
 * seq, and the caller retries on the duplicate-key error.
 */
const buildSlipNumber = async (adminId, year, month, attempt) => {
    // Last six characters of the school id — enough to tell two schools' slips apart at a
    // glance, short enough to stay readable on a printed line.
    const schoolShort = String(adminId).slice(-6).toUpperCase();
    const period = `${year}${String(month).padStart(2, '0')}`;
    const issued = await SalarySlipModel.countDocuments({ adminId, year, month });
    const sequence = issued + 1 + attempt;
    return `SLIP-${schoolShort}-${period}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Everything the printable slip renders, assembled in one place so GenerateSalarySlip and
 * GetSalarySlip can never disagree about what a slip contains.
 *
 * Designation and Department are STAFF-ONLY. models/teacher.js carries neither, and CLAUDE.md
 * forbids adding them, so a teacher's slip shows their education line instead of inventing a
 * job title. The frontend renders whatever arrives and omits an empty row.
 */
const buildSlipPayload = async (slip, payroll) => {
    const model = getModel(payroll.personType);

    const [school, person, payments] = await Promise.all([
        SchoolModel.findOne({ adminId: payroll.adminId }).lean(),
        model ? model.findOne({ _id: payroll.personId }).lean() : null,
        SalaryPaymentModel.find({ payrollId: String(payroll._id) }).sort({ paymentDate: -1 }).lean(),
    ]);

    let departmentName = '';
    let designationName = '';
    if (payroll.personType === 'staff' && person) {
        const [department, designation] = await Promise.all([
            person.departmentId
                ? DepartmentModel.findOne({ _id: person.departmentId }, { name: 1 }).lean()
                : null,
            person.designationId
                ? DesignationModel.findOne({ _id: person.designationId }, { title: 1 }).lean()
                : null,
        ]);
        departmentName = department ? department.name : '';
        designationName = designation ? designation.title : '';
    }

    const amountPaid = payments.reduce((total, payment) => total + (payment.amountPaid || 0), 0);
    // The most recent payment supplies the Payment Date / Mode / Reference row on the slip.
    // The full list rides along so a slip covering instalments can show them all.
    const latestPayment = payments.length > 0 ? payments[0] : null;

    return {
        slip: {
            _id: slip._id,
            slipNumber: slip.slipNumber,
            generatedAt: slip.generatedAt,
            generatedBy: slip.generatedBy,
            salaryPaymentIds: slip.salaryPaymentIds,
        },
        // Read straight from the School profile the fee receipt already reads — the admin is
        // never asked to re-enter a school detail for a slip.
        school: school || null,
        person: {
            personType: payroll.personType,
            personId: payroll.personId,
            name: person ? person.name : '',
            code: person ? personCode(payroll.personType, person) : '',
            designation: designationName,
            department: departmentName,
            // Teachers have no designation/department to show; their qualification is the
            // nearest equivalent the model actually holds.
            education: person && person.education ? person.education : '',
        },
        payroll: {
            _id: payroll._id,
            month: payroll.month,
            year: payroll.year,
            calculationMode: payroll.calculationMode,
            presentDays: payroll.presentDays,
            absentDays: payroll.absentDays,
            halfDays: payroll.halfDays,
            leaveDays: payroll.leaveDays,
            unpaidLeaveDays: payroll.unpaidLeaveDays,
            holidayDays: payroll.holidayDays,
            totalWorkingDays: payroll.totalWorkingDays,
            basic: payroll.basic,
            hra: payroll.hra,
            allowances: payroll.allowances || [],
            grossSalary: payroll.grossSalary,
            deductions: payroll.deductions || [],
            attendanceDeduction: payroll.attendanceDeduction,
            totalDeductions: payroll.totalDeductions,
            netSalary: payroll.netSalary,
            status: payroll.status,
        },
        payment: {
            amountPaid: money(amountPaid),
            remainingAmount: money(payroll.netSalary - amountPaid),
            paymentDate: latestPayment ? latestPayment.paymentDate : null,
            paymentMode: latestPayment ? latestPayment.paymentMode : '',
            referenceNumber: latestPayment ? latestPayment.referenceNumber : '',
            paidBy: latestPayment ? latestPayment.paidBy : '',
            payments: payments,
        },
    };
};

// ---------------------------------------------------------------------------
// POST /generate
// Body: { adminId, payrollId, generatedBy }
//
// Issues a slip if there is not one, refreshes it if there is. Either way it returns the full
// render payload, so the frontend has one call to make and one shape to handle.
// ---------------------------------------------------------------------------
let GenerateSalarySlip = async (req, res, next) => {
    try {
        const { adminId, payrollId, generatedBy } = req.body;

        const payroll = await PayrollModel.findOne({ _id: payrollId, adminId: adminId }).lean();
        if (!payroll) {
            return res.status(404).json('Payroll not found!');
        }
        // Both guards say the same thing from two directions: a slip describes settled facts.
        if (payroll.status !== 'LOCKED') {
            return res.status(400).json('A salary slip can only be generated for a locked payroll!');
        }
        const payments = await SalaryPaymentModel
            .find({ payrollId: String(payroll._id) }, { _id: 1 })
            .lean();
        if (payments.length === 0) {
            return res.status(400).json('Record a payment before generating a salary slip!');
        }
        const salaryPaymentIds = payments.map((payment) => payment._id.toString());

        const existing = await SalarySlipModel.findOne({ adminId: adminId, payrollId: String(payrollId) });

        if (existing) {
            // REGENERATION KEEPS THE NUMBER. Only what the slip covers is refreshed — see the
            // header of models/salary-slip.js.
            existing.salaryPaymentIds = salaryPaymentIds;
            existing.generatedAt = new Date();
            existing.generatedBy = generatedBy || adminId;
            await existing.save();

            logger.info('salary-slip.regenerated', {
                adminId: adminId, payrollId: payrollId, slipNumber: existing.slipNumber,
                payments: salaryPaymentIds.length,
            });
            return res.status(200).json(await buildSlipPayload(existing, payroll));
        }

        // A fresh slip. The sequence is a count, so two concurrent generations can land on the
        // same number; the unique index rejects the loser and the retry recomputes.
        let created = null;
        let lastError = null;
        for (let attempt = 0; attempt < MAX_SEQUENCE_ATTEMPTS; attempt += 1) {
            const slipNumber = await buildSlipNumber(adminId, payroll.year, payroll.month, attempt);
            try {
                created = await SalarySlipModel.create({
                    adminId: adminId,
                    payrollId: String(payrollId),
                    personType: payroll.personType,
                    personId: String(payroll.personId),
                    year: payroll.year,
                    month: payroll.month,
                    slipNumber: slipNumber,
                    salaryPaymentIds: salaryPaymentIds,
                    generatedBy: generatedBy || adminId,
                    // payoutReferenceId / payoutMode are left to their model defaults — this
                    // phase issues manual slips only.
                });
                break;
            } catch (error) {
                // 11000 is the duplicate-key error. Anything else is a real failure and must
                // not be retried into a loop.
                if (error && error.code === 11000) { lastError = error; continue; }
                throw error;
            }
        }

        if (!created) {
            logger.error('salary-slip.sequenceExhausted', lastError);
            return res.status(500).json('Could not allocate a slip number. Please try again!');
        }

        logger.info('salary-slip.generated', {
            adminId: adminId, payrollId: payrollId, slipNumber: created.slipNumber,
            personType: payroll.personType, personId: payroll.personId,
            year: payroll.year, month: payroll.month,
        });
        return res.status(200).json(await buildSlipPayload(created, payroll));
    } catch (error) {
        logger.error('salary-slip.GenerateSalarySlip', error);
        return res.status(500).json('Internal Server Error!');
    }
}

// ---------------------------------------------------------------------------
// GET /payroll/:adminId/:payrollId
// The previously issued slip, re-rendered. Returns null (200) when none has been issued —
// "no slip yet" is the normal state and lets the row decide between Generate and Print
// without handling a 404.
// ---------------------------------------------------------------------------
let GetSalarySlip = async (req, res, next) => {
    try {
        const { adminId, payrollId } = req.params;
        const slip = await SalarySlipModel.findOne({ adminId: adminId, payrollId: payrollId }).lean();
        if (!slip) return res.status(200).json(null);

        const payroll = await PayrollModel.findOne({ _id: slip.payrollId, adminId: adminId }).lean();
        if (!payroll) return res.status(404).json('Payroll not found!');

        return res.status(200).json(await buildSlipPayload(slip, payroll));
    } catch (error) {
        logger.error('salary-slip.GetSalarySlip', error);
        return res.status(500).json('Internal Server Error!');
    }
}

module.exports = {
    GenerateSalarySlip,
    GetSalarySlip,
}
