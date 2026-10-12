'use strict';
const crypto = require('crypto');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const FeeReminderFilterModel = require('../../models/fees/fee-reminder-filter');
const FeeReminderDeliveryModel = require('../../models/fees/fee-reminder-delivery');
const { NotFoundError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/fees.messages');
const {
    MODULE, PERMISSIONS, actorOf, canEditOf, isObjectId, toObjectId, requireSessionId, loadClassIndex,
} = require('../../helpers/fees/fee-context');
const { resolveRecipients } = require('../../helpers/fees/fee-reminder');
const { logActivity } = require('../../services/activity-log.service');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Fee Reminder (fees/fee-reminder.md) — saved filters that resolve to a LIVE student list on
// demand. The filter definitions are near-static and cached; every preview re-runs the filter
// against current data and is never cached (fees/optimization.md). Send Now enqueues a job
// with exactly the reviewed list — never a synchronous send inside the request.

// The queue module opens Redis at require-time — required only when a send is enqueued.
const queue = () => require('../../queues/fees-queue');

const ENTITY = 'Reminder filter';
const notFound = (id) => new NotFoundError(messages.reminderNotFound(), { module: MODULE, code: 'FEE_REMINDER_NOT_FOUND', context: { id } });

const toFilterRow = (filter, classIndex) => {
    const entry = classIndex.get(String(filter.classId));
    return {
        _id: String(filter._id),
        classId: String(filter.classId),
        className: entry ? entry.label : '—',
        paidBelowPercent: filter.paidBelowPercent,
        noPaymentSinceDays: filter.noPaymentSinceDays,
        gapSinceLastReminderDays: filter.gapSinceLastReminderDays,
    };
};

const filterFields = (body) => ({
    classId: toObjectId(body.classId),
    paidBelowPercent: body.paidBelowPercent == null ? null : Number(body.paidBelowPercent),
    noPaymentSinceDays: body.noPaymentSinceDays == null ? null : Number(body.noPaymentSinceDays),
    gapSinceLastReminderDays: body.gapSinceLastReminderDays == null ? null : Number(body.gapSinceLastReminderDays),
});

const assertClass = async (adminId, classId) => {
    const classIndex = await loadClassIndex(adminId);
    if (!classIndex.has(String(classId))) {
        throw new ValidationError(messages.reminderClassRequired(), {
            module: MODULE, code: 'FEE_REMINDER_CLASS_REQUIRED',
            fields: [{ field: 'classId', message: messages.reminderClassRequired(), code: 'FEE_REMINDER_CLASS_REQUIRED' }],
        });
    }
    return classIndex;
};

let ListReminderFilters = async (req, res) => {
    const { adminId } = req.query;
    const rows = await cacheService.wrap(cacheKeys.fees.reminderFilters(adminId), cacheService.TTL.NEAR_STATIC_45, async () => {
        const [filters, classIndex] = await Promise.all([
            FeeReminderFilterModel.find({ adminId, deletedAt: null }).sort({ createdAt: -1 }).lean(),
            loadClassIndex(adminId),
        ]);
        return filters.map((filter) => toFilterRow(filter, classIndex));
    });
    const now = new Date();
    const sentThisMonth = await FeeReminderDeliveryModel.countDocuments({
        adminId, status: 'sent', sentAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) },
    });
    return res.status(200).json({
        rows,
        summary: { savedFilters: rows.length, sentThisMonth },
        canEdit: canEditOf(req, PERMISSIONS.VIEW),
    });
};

const saveFilter = async (req) => {
    const { adminId } = req.body;
    const classIndex = await assertClass(adminId, req.body.classId);
    const created = await FeeReminderFilterModel.create({ adminId, ...filterFields(req.body), createdBy: actorOf(req) });
    await cacheService.delPattern(cacheKeys.fees.reminderFiltersPattern(adminId));
    await logActivity(req, { module: MODULE, action: 'fees.reminder-filter.create', targetId: String(created._id), meta: filterFields(req.body) });
    return toFilterRow(created.toObject(), classIndex);
};

let CreateReminderFilter = async (req, res) => {
    const filter = await saveFilter(req);
    return res.status(200).json({ message: success.created(ENTITY), filter });
};

/** The lightweight delete — only the saved definition goes; nothing sent or stored is touched. */
let DeleteReminderFilter = async (req, res) => {
    const { adminId } = req.query;
    if (!isObjectId(req.params.id)) throw notFound(req.params.id);
    const filter = await FeeReminderFilterModel.findOneAndUpdate(
        { _id: req.params.id, adminId, deletedAt: null }, { $set: { deletedAt: new Date() } }, { new: true }
    ).lean();
    if (!filter) throw notFound(req.params.id);
    await cacheService.delPattern(cacheKeys.fees.reminderFiltersPattern(adminId));
    await logActivity(req, { module: MODULE, action: 'fees.reminder-filter.delete', targetId: String(filter._id) });
    return res.status(200).json({ message: messages.filterDeleted() });
};

const loadFilter = async (adminId, id) => {
    if (!isObjectId(id)) throw notFound(id);
    const filter = await FeeReminderFilterModel.findOne({ _id: id, adminId, deletedAt: null }).lean();
    if (!filter) throw notFound(id);
    return filter;
};

/** "To Send" on a saved filter — re-run live, every time. */
let PreviewSavedFilter = async (req, res) => {
    const { adminId, session } = req.query;
    const filter = await loadFilter(adminId, req.params.id);
    const sessionId = await requireSessionId(adminId, session);
    return res.status(200).json({ rows: await resolveRecipients(adminId, sessionId, filter), resolvedAt: new Date() });
};

/** "Choose Filters" from the Create modal — the same live run on an unsaved filter. */
let PreviewFilter = async (req, res) => {
    const { adminId, session } = req.body;
    await assertClass(adminId, req.body.classId);
    const sessionId = await requireSessionId(adminId, session);
    return res.status(200).json({ rows: await resolveRecipients(adminId, sessionId, filterFields(req.body)), resolvedAt: new Date() });
};

/**
 * Enqueue the send for exactly the reviewed students. They must be enrolled in the filter's
 * class this session (tenant + scope check) — the worker then sends to that list as given.
 */
const enqueueSend = async (req, { filterId, classId, sessionId, studentIds }) => {
    const { adminId } = req.body;
    const enrolled = await StudentEnrollmentModel.find(
        { adminId, sessionId, classId, studentId: { $in: studentIds.map(toObjectId) } }, 'studentId'
    ).lean();
    const allowed = new Set(enrolled.map((item) => String(item.studentId)));
    const recipients = studentIds.filter((id) => allowed.has(String(id)));
    if (!recipients.length) {
        throw new ValidationError(messages.reminderRecipientsRequired(), {
            module: MODULE, code: 'FEE_REMINDER_RECIPIENTS_REQUIRED',
            fields: [{ field: 'studentIds', message: messages.reminderRecipientsRequired() }],
        });
    }
    const jobKey = crypto.randomUUID();
    const jobId = await queue().addReminderJob({
        adminId, jobKey, filterId: filterId ? String(filterId) : null, sessionId: String(sessionId), studentIds: recipients,
    });
    await logActivity(req, {
        module: MODULE, action: 'fees.reminder.send', targetId: filterId ? String(filterId) : null,
        meta: { jobId, classId: String(classId), recipients: recipients.length, skippedNotInClass: studentIds.length - recipients.length },
    });
    return { jobId, queued: recipients.length };
};

let SendSavedFilter = async (req, res) => {
    const { adminId, session, studentIds } = req.body;
    const filter = await loadFilter(adminId, req.params.id);
    const sessionId = await requireSessionId(adminId, session);
    const result = await enqueueSend(req, { filterId: filter._id, classId: filter.classId, sessionId, studentIds });
    return res.status(202).json({ message: messages.reminderQueued(result.queued), ...result });
};

/** Send from the Create flow; "Save these filters for next time" saves the definition too. */
let SendFilter = async (req, res) => {
    const { adminId, session, studentIds, saveFilter: save } = req.body;
    await assertClass(adminId, req.body.classId);
    const sessionId = await requireSessionId(adminId, session);
    const saved = save ? await saveFilter(req) : null;
    const result = await enqueueSend(req, { filterId: saved ? saved._id : null, classId: req.body.classId, sessionId, studentIds });
    return res.status(202).json({ message: messages.reminderQueued(result.queued), filter: saved, ...result });
};

let GetJobStatus = async (req, res) => {
    let job = null;
    try {
        job = await queue().feesQueue.getJob(req.params.jobId);
    } catch (error) {
        job = null;
    }
    // Another school's job is reported exactly like a missing one.
    if (!job || String(job.data.adminId) !== String(req.query.adminId)) {
        throw new NotFoundError(messages.jobNotFound(), { module: MODULE, context: { jobId: req.params.jobId } });
    }
    const state = await job.getState();
    return res.status(200).json({
        jobId: job.id,
        name: job.name,
        state,
        progress: typeof job.progress === 'number' ? job.progress : 0,
        result: state === 'completed' ? job.returnvalue : null,
        error: state === 'failed' ? messages.notificationFailed(job.data.studentIds.length) : null,
    });
};

module.exports = {
    ListReminderFilters,
    CreateReminderFilter,
    DeleteReminderFilter,
    PreviewSavedFilter,
    PreviewFilter,
    SendSavedFilter,
    SendFilter,
    GetJobStatus,
};
