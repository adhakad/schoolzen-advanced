'use strict';
const PayrollRunV2Model = require('../../models/payroll/payroll-run');
const PayrollPaymentV2Model = require('../../models/payroll/payroll-payment');
const StaffSalaryAssignmentV2Model = require('../../models/payroll/staff-salary-assignment');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const messages = require('../../helpers/messages/payroll.messages');
const {
    MODULE, PERMISSIONS, todayKey, actorOf, canEditOf, runNotFound, isObjectId, findStaff, describeStaff, keysetPage,
} = require('../../helpers/payroll/context');
const { generatePayroll } = require('../../helpers/payroll/generate');
const { actionsForStatus, money } = require('../../helpers/payroll/payroll-rules');
const { summarizeStaffMonth } = require('../../services/payroll/payroll-attendance');
const { withTransaction } = require('../../helpers/with-transaction');
const { logActivity } = require('../../services/activity-log.service');
const logger = require('../../helpers/logger');

// Generate Payroll (generate-payroll.md). PayrollRun status is NEVER cached
// (payroll/optimization.md) — every read here goes straight to MongoDB, and every
// transition is a conditional write on the current status (errors.md shape 9).
// Generate / Lock / Unlock need the explicit 'payroll-generate' grant (routes).

// Above this, "Generate for Selected" is a BullMQ job, never computed inside the request.
const INLINE_LIMIT = 25;

// Required lazily: queues/connection.js throws at require-time without Redis.
let payrollQueue;
const queue = () => {
    if (payrollQueue === undefined) {
        try {
            payrollQueue = require('../../queues/payroll-queue');
        } catch (error) {
            logger.warn('payroll.queueUnavailable', { reason: error.message });
            payrollQueue = null;
        }
    }
    return payrollQueue;
};

const toRunRow = (person, run, liveSummary) => {
    const status = run ? run.status : 'pending';
    return {
        _id: run ? String(run._id) : null,
        staffId: person._id,
        name: person.name,
        code: person.code,
        designation: person.designation,
        department: person.department,
        status,
        actions: actionsForStatus(status),
        attendance: (run && run.attendanceSummary) || liveSummary || null,
        gross: run ? run.gross : null,
        deductions: run ? run.deductionTotal : null,
        net: run ? run.net : null,
        mode: run ? run.mode : null,
        salaryGroupName: run ? run.salaryGroupName : null,
        lockedAt: run ? run.lockedAt : null,
    };
};

const SKIP_ERRORS = {
    PERSON_NOT_FOUND: (message) => new NotFoundError(message, { module: MODULE, code: 'PERSON_NOT_FOUND' }),
    PAYROLL_RUN_LOCKED: (message) => new ConflictError(message, { module: MODULE, code: 'PAYROLL_RUN_LOCKED' }),
    SALARY_GROUP_NOT_ASSIGNED: (message) => new ValidationError(message, { module: MODULE, code: 'SALARY_GROUP_NOT_ASSIGNED' }),
    SALARY_GROUP_NOT_FOUND: (message) => new NotFoundError(message, { module: MODULE, code: 'SALARY_GROUP_NOT_FOUND' }),
    NO_WORKING_DAYS: (message) => new ValidationError(message, { module: MODULE, code: 'NO_WORKING_DAYS' }),
};

const warningText = (warning) => (warning ? messages.midMonthWarning(warning.remainingDays, warning.remainingCoveredByLeave) : null);

/** The month's table: every matching staff member, left-joined to their run (or pending). */
let ListRuns = async (req, res) => {
    const { adminId, year, month, status, after, limit } = req.query;
    const people = await findStaff(adminId, req.query);
    const ids = people.rows.map((row) => row._id);
    const [runs, monthRuns, assignments] = await Promise.all([
        PayrollRunV2Model.find({ adminId, year, month, staffId: { $in: ids }, deletedAt: null }).lean(),
        // The side card is the whole school's month, not the filtered page.
        PayrollRunV2Model.find({ adminId, year, month, deletedAt: null }, { status: 1, net: 1 }).lean(),
        StaffSalaryAssignmentV2Model.find({ adminId, staffId: { $in: ids } }, { staffId: 1 }).lean(),
    ]);
    const runOf = new Map(runs.map((row) => [row.staffId, row]));
    const assigned = new Set(assignments.map((row) => row.staffId));

    const filtered = people.rows.filter((person) => {
        const rowStatus = runOf.has(person._id) ? runOf.get(person._id).status : 'pending';
        return !status || rowStatus === status;
    });
    const page = keysetPage(filtered, after, limit);

    // Pending rows still show this month's attendance — computed for this page only, batched.
    const pendingIds = page.rows.filter((person) => !runOf.has(person._id)).map((person) => person._id);
    const live = await summarizeStaffMonth(adminId, pendingIds, year, month, todayKey());

    return res.status(200).json({
        rows: page.rows.map((person) => ({
            ...toRunRow(person, runOf.get(person._id), live.get(person._id)),
            assigned: assigned.has(person._id),
        })),
        nextCursor: page.nextCursor,
        total: filtered.length,
        truncated: people.truncated,
        summary: {
            totalPayroll: money(monthRuns.reduce((sum, row) => sum + (row.net || 0), 0)),
            locked: monthRuns.filter((row) => row.status === 'locked').length,
            draft: monthRuns.filter((row) => row.status === 'draft').length,
            totalStaff: people.rows.length,
        },
        canEdit: canEditOf(req, PERMISSIONS.GENERATE),
    });
};

/** View: the itemised breakdown — scoped {_id, adminId} (errors.md, the module's worst leak). */
let GetRun = async (req, res) => {
    const { adminId } = req.query;
    if (!isObjectId(req.params.id)) throw runNotFound(req.params.id);
    const run = await PayrollRunV2Model.findOne({ _id: req.params.id, adminId, deletedAt: null }).lean();
    if (!run) throw runNotFound(req.params.id);
    const person = (await describeStaff(adminId, [run.staffId])).get(run.staffId) || { _id: run.staffId, name: null };
    return res.status(200).json({ run: { ...run, _id: String(run._id) }, person });
};

/** Generate (pending) or Regenerate (draft) one person's month. */
let GenerateRun = async (req, res) => {
    const { adminId, staffId, year, month } = req.body;
    const before = await PayrollRunV2Model.findOne({ adminId, staffId, year, month }, { net: 1, status: 1 }).lean();
    const result = await generatePayroll({ adminId, staffIds: [staffId], year, month, actor: actorOf(req), todayKey: todayKey() });
    if (result.skipped.length) {
        const [skip] = result.skipped;
        throw SKIP_ERRORS[skip.errorCode](skip.reason);
    }
    const [run] = result.runs;
    const person = (await describeStaff(adminId, [staffId])).get(staffId);
    await logActivity(req, {
        module: MODULE, action: 'payroll.generate', targetId: String(run._id),
        meta: { staffId, year, month, regenerated: Boolean(before) },
        changes: { before: before ? { net: before.net } : null, after: { net: run.net } },
    });
    return res.status(200).json({
        message: messages.generated(1),
        row: toRunRow(person, run),
        // Never blocked mid-month — saved as Draft with an explicit warning.
        warning: warningText(result.warning),
    });
};

/** Generate for Selected — inline up to INLINE_LIMIT, a background job above it. */
let BulkGenerate = async (req, res) => {
    const { adminId, staffIds, year, month } = req.body;
    const actor = actorOf(req);
    const data = { adminId, staffIds, year, month, actor, todayKey: todayKey() };

    const queueModule = staffIds.length > INLINE_LIMIT ? queue() : null;
    if (queueModule) {
        const jobId = await queueModule.addGenerateJob(data);
        await logActivity(req, { module: MODULE, action: 'payroll.generate.bulk', targetId: jobId, meta: { year, month, staffCount: staffIds.length, queued: true } });
        return res.status(202).json({ message: messages.queued(), jobId });
    }

    const result = await generatePayroll(data);
    await logActivity(req, {
        module: MODULE, action: 'payroll.generate.bulk', targetId: null,
        meta: { year, month, staffCount: staffIds.length, generated: result.runs.length, skipped: result.skipped.length },
    });
    return res.status(200).json({
        message: result.skipped.length
            ? `${messages.generated(result.runs.length)} ${messages.rowSkipped(result.skipped.length)}`
            : messages.generated(result.runs.length),
        generated: result.runs.length,
        // Every skip by name with its own reason (errors.md shape 7, PAYROLL_GENERATE_ROW_SKIPPED).
        skipped: result.skipped,
        code: result.skipped.length ? 'PAYROLL_GENERATE_ROW_SKIPPED' : undefined,
        warning: warningText(result.warning),
    });
};

/** draft → locked, as ONE conditional write (two racing Locks: the loser is refused). */
let LockRun = async (req, res) => {
    const { adminId } = req.body;
    if (!isObjectId(req.params.id)) throw runNotFound(req.params.id);
    const actor = actorOf(req);
    const run = await PayrollRunV2Model.findOneAndUpdate(
        { _id: req.params.id, adminId, status: 'draft', deletedAt: null },
        { $set: { status: 'locked', lockedAt: new Date(), lockedBy: actor, updatedAt: new Date() } },
        { new: true }
    ).lean();
    if (!run) {
        const exists = await PayrollRunV2Model.exists({ _id: req.params.id, adminId, deletedAt: null });
        if (!exists) throw runNotFound(req.params.id);
        throw new ConflictError(messages.runAlreadyLocked(), { module: MODULE, code: 'PAYROLL_RUN_ALREADY_LOCKED' });
    }
    const person = (await describeStaff(adminId, [run.staffId])).get(run.staffId);
    await logActivity(req, { module: MODULE, action: 'payroll.lock', targetId: String(run._id), meta: { staffId: run.staffId, year: run.year, month: run.month, net: run.net } });
    return res.status(200).json({ message: messages.locked(), row: toRunRow(person, run) });
};

/**
 * locked → draft. Undoes a finalized state, so it is logged (who, when) and refused once any
 * live payment (pending or confirmed) exists. The payment check and the status flip run in
 * ONE transaction, and Record Payment re-verifies `locked` inside its own transaction — so
 * the two can never interleave into a payment against a run that then regenerates
 * (errors.md, "Critical — confirmed concurrency gap").
 */
let UnlockRun = async (req, res) => {
    const { adminId } = req.body;
    if (!isObjectId(req.params.id)) throw runNotFound(req.params.id);
    const actor = actorOf(req);
    const run = await withTransaction(async (dbSession) => {
        const current = await PayrollRunV2Model.findOne({ _id: req.params.id, adminId, deletedAt: null }).session(dbSession).lean();
        if (!current) throw runNotFound(req.params.id);
        if (current.status !== 'locked') throw new ConflictError(messages.runNotLocked(), { module: MODULE, code: 'PAYROLL_RUN_NOT_LOCKED' });
        const live = await PayrollPaymentV2Model.countDocuments({
            adminId, payrollRunId: String(current._id), deletedAt: null,
            // A pending payment past its window is already expired, swept or not.
            $or: [{ confirmationStatus: 'confirmed' }, { confirmationStatus: 'pending', confirmationExpiresAt: { $gt: new Date() } }],
        }).session(dbSession);
        if (live) throw new ConflictError(messages.unlockBlockedPayment(), { module: MODULE, code: 'PAYROLL_UNLOCK_BLOCKED_PAYMENT' });
        const updated = await PayrollRunV2Model.findOneAndUpdate(
            { _id: current._id, adminId, status: 'locked' },
            { $set: { status: 'draft', unlockedAt: new Date(), unlockedBy: actor, updatedAt: new Date() } },
            { new: true, session: dbSession }
        ).lean();
        if (!updated) throw new ConflictError(messages.runNotLocked(), { module: MODULE, code: 'PAYROLL_RUN_NOT_LOCKED' });
        return updated;
    });
    const person = (await describeStaff(adminId, [run.staffId])).get(run.staffId);
    await logActivity(req, {
        module: MODULE, action: 'payroll.unlock', targetId: String(run._id),
        meta: { staffId: run.staffId, year: run.year, month: run.month, net: run.net, unlockedBy: actor, unlockedAt: run.unlockedAt },
        changes: { before: { status: 'locked' }, after: { status: 'draft' } },
    });
    return res.status(200).json({ message: messages.unlocked(), row: toRunRow(person, run) });
};

let GetJobStatus = async (req, res) => {
    const queueModule = queue();
    const job = queueModule ? await queueModule.payrollQueue.getJob(req.params.jobId) : null;
    // Another school's job is reported exactly like a missing one.
    if (!job || String(job.data.adminId) !== String(req.query.adminId)) {
        throw new NotFoundError(messages.jobNotFound(), { module: MODULE, context: { jobId: req.params.jobId } });
    }
    const state = await job.getState();
    const result = state === 'completed' ? job.returnvalue : null;
    return res.status(200).json({
        jobId: job.id,
        name: job.name,
        state,
        progress: typeof job.progress === 'number' ? job.progress : 0,
        result: result ? { ...result, warning: warningText(result.warning) } : null,
        error: state === 'failed' ? 'The job could not be completed. Please try again.' : null,
    });
};

module.exports = {
    ListRuns,
    GetRun,
    GenerateRun,
    BulkGenerate,
    LockRun,
    UnlockRun,
    GetJobStatus,
};
