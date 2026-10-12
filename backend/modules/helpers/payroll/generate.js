'use strict';
const StaffSalaryAssignmentV2Model = require('../../models/payroll/staff-salary-assignment');
const PayrollRunV2Model = require('../../models/payroll/payroll-run');
const { summarizeStaffMonth } = require('../../services/payroll/payroll-attendance');
const messages = require('../messages/payroll.messages');
const { describeStaff, loadGroupsById } = require('./context');
const {
    resolveEffectiveSalary, calculatePay, countsFor, cleanComponents, money, monthRange, NO_WORKING_DAYS,
} = require('./payroll-rules');

// THE generation path — single Generate/Regenerate, inline "Generate for Selected" and the
// background worker all call generatePayroll(), so they can never disagree.
//
// Batched (generate-payroll.md): every selected person's assignment, group, existing run and
// month of attendance are read in a constant number of queries, and every result is written
// in ONE bulkWrite — never a per-staff .save().
//
// Race-proof against a concurrent Lock (errors.md shape 9): each upsert's filter carries
// `status: {$ne: 'locked'}`. If a Lock lands between our read and our write, the filter no
// longer matches the locked row, the upsert tries to INSERT onto the unique
// {adminId, staffId, year, month} key and fails with 11000 — reported as PAYROLL_RUN_LOCKED,
// never a silent revert of a just-locked run back to draft.

const skip = (staffId, person, code, reason) => ({
    staffId, name: person ? person.name : null, code: person ? person.code : null, errorCode: code, reason,
});

/**
 * @returns {Promise<{ runs: Object[], skipped: Object[], warning: { remainingDays, remainingCoveredByLeave }|null }>}
 */
const generatePayroll = async ({ adminId, staffIds, year, month, actor, todayKey }) => {
    const ids = [...new Set(staffIds.map(String))];
    const { toKey } = monthRange(year, month);
    const [people, assignments, existing] = await Promise.all([
        describeStaff(adminId, ids, true),
        StaffSalaryAssignmentV2Model.find({ adminId, staffId: { $in: ids } }).lean(),
        PayrollRunV2Model.find({ adminId, staffId: { $in: ids }, year, month }, { staffId: 1, status: 1 }).lean(),
    ]);
    const assignmentOf = new Map(assignments.map((row) => [row.staffId, row]));
    const lockedIds = new Set(existing.filter((row) => row.status === 'locked').map((row) => row.staffId));
    const groups = await loadGroupsById(adminId, assignments.map((row) => row.salaryGroupId));

    const skipped = [];
    const eligible = [];
    ids.forEach((staffId) => {
        const person = people.get(staffId);
        const assignment = assignmentOf.get(staffId);
        if (!person) return skipped.push(skip(staffId, null, 'PERSON_NOT_FOUND', messages.personNotFound()));
        if (lockedIds.has(staffId)) return skipped.push(skip(staffId, person, 'PAYROLL_RUN_LOCKED', messages.runLocked()));
        if (!assignment) return skipped.push(skip(staffId, person, 'SALARY_GROUP_NOT_ASSIGNED', messages.groupNotAssigned()));
        if (assignment.effectiveFrom > toKey) return skipped.push(skip(staffId, person, 'SALARY_GROUP_NOT_ASSIGNED', messages.notEffectiveYet()));
        const group = groups.get(assignment.salaryGroupId);
        if (!group) return skipped.push(skip(staffId, person, 'SALARY_GROUP_NOT_FOUND', messages.groupNotFound()));
        return eligible.push({ staffId, person, assignment, group });
    });

    const summaries = await summarizeStaffMonth(adminId, eligible.map((row) => row.staffId), year, month, todayKey);
    const now = new Date();
    const ops = [];
    const opStaff = [];
    let warning = null;

    eligible.forEach(({ staffId, person, assignment, group }) => {
        const summary = summaries.get(staffId);
        const effective = resolveEffectiveSalary(group, assignment.overrides);
        const pay = calculatePay(effective, group.mode, countsFor(summary));
        if (pay.error === NO_WORKING_DAYS) {
            skipped.push(skip(staffId, person, 'NO_WORKING_DAYS', messages.noWorkingDays()));
            return;
        }
        if (summary.remainingDays > 0 && !warning) {
            warning = { remainingDays: summary.remainingDays, remainingCoveredByLeave: summary.remainingCoveredByLeave };
        }
        ops.push({
            updateOne: {
                filter: { adminId, staffId, year, month, status: { $ne: 'locked' } },
                update: {
                    $set: {
                        status: 'draft',
                        salaryGroupId: group._id,
                        salaryGroupName: group.name,
                        mode: group.mode,
                        basic: money(effective.basic),
                        hra: money(effective.hra),
                        allowances: cleanComponents(effective.allowances),
                        deductions: cleanComponents(effective.deductions),
                        attendanceSummary: summary,
                        gross: pay.gross,
                        attendanceDeduction: pay.attendanceDeduction,
                        deductionTotal: pay.deductionTotal,
                        net: pay.net,
                        generatedAt: now,
                        generatedBy: actor,
                        deletedAt: null,
                        updatedAt: now,
                    },
                    $setOnInsert: { createdAt: now },
                },
                upsert: true,
            },
        });
        opStaff.push({ staffId, person });
    });

    if (ops.length) {
        try {
            await PayrollRunV2Model.bulkWrite(ops, { ordered: false });
        } catch (error) {
            const writeErrors = (error && (error.writeErrors || (error.result && error.result.getWriteErrors && error.result.getWriteErrors()))) || null;
            if (!writeErrors) throw error;
            writeErrors.forEach((writeError) => {
                const index = writeError.index != null ? writeError.index : writeError.err && writeError.err.index;
                const target = opStaff[index];
                if (!target) return;
                const code = writeError.code || (writeError.err && writeError.err.code);
                if (code !== 11000) throw error;
                // Locked between our read and our write — the run stays locked, untouched.
                skipped.push(skip(target.staffId, target.person, 'PAYROLL_RUN_LOCKED', messages.runLocked()));
            });
        }
    }

    const skippedIds = new Set(skipped.map((row) => row.staffId));
    const writtenIds = opStaff.map((row) => row.staffId).filter((id) => !skippedIds.has(id));
    const runs = writtenIds.length
        ? await PayrollRunV2Model.find({ adminId, staffId: { $in: writtenIds }, year, month }).lean()
        : [];
    return { runs, skipped, warning };
};

module.exports = { generatePayroll };
