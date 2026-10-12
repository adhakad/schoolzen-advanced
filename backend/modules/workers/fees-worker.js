'use strict';
const { Worker } = require('bullmq');
const { defaultWorkerOptions } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/fees-queue');
const StudentEnrollmentModel = require('../models/student/student-enrollment');
const StudentFeeRecordModel = require('../models/fees/student-fee-record');
const FeeReminderDeliveryModel = require('../models/fees/fee-reminder-delivery');
const SchoolModel = require('../models/school');
const { sendManualFeeReminder } = require('../services/send-whatsapp-message');
const { loadLedgerData, loadProfiles, loadClassIndex, placementLabels } = require('../helpers/fees/fee-context');
const { mobileOf, ledgerSnapshot } = require('../helpers/fees/fee-reminder');
const messages = require('../helpers/messages/fees.messages');
const { startHeartbeat } = require('./heartbeat');
const logger = require('../helpers/logger');

// Consumer for queues/fees-queue.js — runs only in the worker process (worker.js).
//
// reminder: sends to EXACTLY the reviewed list (job input, never re-resolved from the
// filter). Per recipient, a FeeReminderDelivery row keyed (jobKey, studentId) is written
// first, so a retried job skips everyone already 'sent'. A recipient whose dues are now
// settled or whose number is missing/invalid is skipped and reported
// (FEE_REMINDER_RECIPIENT_STALE). Provider failures are recorded and the job is thrown back
// to BullMQ to retry them (NOTIFICATION_SEND_FAILED). lastReminderSentAt is written in ONE
// bulkWrite at the end, never per message.

const CONCURRENCY = Number(process.env.FEES_WORKER_CONCURRENCY) || 2;
const DAY_MS = 24 * 60 * 60 * 1000;
// The template's "pay by" date — a week from the send.
const payByText = (now) => new Date(now.getTime() + 7 * DAY_MS).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** The delivery row for this job + student, created if missing. */
const claimDelivery = async ({ adminId, jobKey, filterId }, studentId) => {
    try {
        return (await FeeReminderDeliveryModel.create({ adminId, jobKey, studentId, filterId: filterId || null })).toObject();
    } catch (error) {
        if (error.code !== 11000) throw error;
        return FeeReminderDeliveryModel.findOne({ jobKey, studentId }).lean();
    }
};

const markDelivery = (id, set) => FeeReminderDeliveryModel.updateOne({ _id: id }, { $set: set });

const processReminder = async (job) => {
    const { adminId, sessionId, studentIds } = job.data;
    const now = new Date();
    const [school, profiles, ledgers, enrollments, classIndex] = await Promise.all([
        SchoolModel.findOne({ adminId }, 'schoolName').lean(),
        loadProfiles(adminId, studentIds),
        loadLedgerData(adminId, studentIds),
        StudentEnrollmentModel.find({ adminId, sessionId, studentId: { $in: studentIds } }, 'studentId classId class streamId groupId sectionId').lean(),
        loadClassIndex(adminId),
    ]);
    const enrollmentOf = new Map(enrollments.map((item) => [String(item.studentId), item]));
    const counts = { sent: 0, stale: 0, failed: 0 };
    const sentRecordIds = [];

    for (const studentId of studentIds) {
        const delivery = await claimDelivery(job.data, studentId);
        if (delivery.status === 'sent') { counts.sent += 1; continue; }
        if (delivery.status === 'skipped') { counts.stale += 1; continue; }

        const profile = profiles.get(String(studentId));
        const snapshot = ledgerSnapshot(ledgers.get(String(studentId)) || { records: [], payments: [] }, sessionId);
        const mobile = mobileOf(profile);
        if (!profile || !snapshot.ledger || snapshot.ledger.totals.totalDue <= 0 || !mobile) {
            counts.stale += 1;
            await markDelivery(delivery._id, { status: 'skipped', reason: !mobile ? 'no-valid-mobile' : 'no-longer-due' });
            continue;
        }
        const enrollment = enrollmentOf.get(String(studentId));
        const className = enrollment ? placementLabels(classIndex, new Map(), enrollment).className : '';
        try {
            await sendManualFeeReminder(mobile, (school && school.schoolName) || '', profile.fatherName || 'Parent',
                snapshot.ledger.totals.totalDue.toLocaleString('en-IN'), profile.name, className || '', payByText(now));
            await markDelivery(delivery._id, { status: 'sent', sentAt: new Date(), reason: null });
            sentRecordIds.push(snapshot.record._id);
            counts.sent += 1;
        } catch (error) {
            counts.failed += 1;
            await markDelivery(delivery._id, { status: 'failed', reason: String(error.message || 'send failed').slice(0, 200) });
        }
    }

    if (sentRecordIds.length) {
        await StudentFeeRecordModel.bulkWrite(sentRecordIds.map((id) => ({
            updateOne: { filter: { _id: id, adminId }, update: { $set: { lastReminderSentAt: now } } },
        })), { ordered: false });
    }

    const attempts = (job.opts && job.opts.attempts) || 1;
    if (counts.failed && job.attemptsMade + 1 < attempts) {
        // BullMQ retries the job; the delivery rows make the retry resend only the failures.
        throw new Error(messages.notificationFailed(counts.failed));
    }
    return {
        requested: studentIds.length,
        sent: counts.sent,
        skipped: counts.stale,
        failed: counts.failed,
        warnings: [
            counts.stale ? { code: 'FEE_REMINDER_RECIPIENT_STALE', message: messages.reminderStale(counts.stale) } : null,
            counts.failed ? { code: 'NOTIFICATION_SEND_FAILED', message: messages.notificationFailed(counts.failed) } : null,
        ].filter(Boolean),
    };
};

const HANDLERS = { reminder: processReminder };

const processFeesJob = async (job) => {
    const handler = HANDLERS[job.name];
    if (!handler) throw new Error(`Unknown fees job: ${job.name}`);
    return handler(job);
};

const startFeesWorker = () => {
    const worker = new Worker(QUEUE_NAME, processFeesJob, { ...defaultWorkerOptions, concurrency: CONCURRENCY });
    worker.on('failed', (job, error) => logger.error('fees-worker.failed', error));
    worker.on('error', (error) => logger.error('fees-worker.error', error));
    startHeartbeat(QUEUE_NAME);
    logger.info('fees-worker.started', { queue: QUEUE_NAME, concurrency: CONCURRENCY });
    return worker;
};

module.exports = startFeesWorker;
module.exports.handlers = HANDLERS;
