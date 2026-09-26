'use strict';
const { Worker } = require('bullmq');
const { defaultWorkerOptions } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/student-queue');
const StudentProfileModel = require('../models/student/student');
const StudentEnrollmentModel = require('../models/student/student-enrollment');
const SubjectGroupModel = require('../models/academic-setup/subject-group');
const BiometricMappingModel = require('../models/biometric-mapping');
const { createWdmsEmployee, updateWdmsEmployee, resyncWdmsDevices } = require('../services/wdms-employee');
const { getStudentFieldConfig, validateStudentRecord } = require('../validators/student/field-config.validator');
const {
    loadClassIndex, toObjectId, withTransaction, runPromotionSteps,
} = require('../helpers/student/student.utils');
const { startHeartbeat } = require('./heartbeat');
const logger = require('../helpers/logger');

// Consumer for queues/student-queue.js — runs only in the worker process (worker.js).
//
// Each handler returns a small result object; BullMQ stores it as the job's returnvalue,
// which GET /api/v2/student/jobs/:jobId hands to the page that is polling for it.

// Bulk jobs are Mongo-bound, device-sync is WDMS-bound; a small concurrency keeps one
// school's 2,000-row import from starving everyone else's quick card assign.
const CONCURRENCY = Number(process.env.STUDENT_WORKER_CONCURRENCY) || 3;

// Class Promotion processes this many students per transaction — bounded so no single
// transaction holds locks across a whole school's cohort (class-promotion.md, Scale).
const PROMOTION_CHUNK_SIZE = 200;

// A failed import row list is for a person to read; past this it stops being useful.
const MAX_REPORTED_ROW_ERRORS = 200;

// Fields that belong to the enrollment, not the profile.
const ENROLLMENT_FIELDS = new Set(['rollNumber']);

const chunk = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

// bulkWrite with ordered:false writes every valid op and reports the rest; turn that into
// a per-op-index Map instead of losing the whole batch to one duplicate.
const bulkWriteCollectingErrors = async (model, ops) => {
    if (ops.length === 0) return new Map();
    try {
        await model.bulkWrite(ops, { ordered: false });
        return new Map();
    } catch (error) {
        if (!error.writeErrors) throw error;
        const failed = new Map();
        [].concat(error.writeErrors).forEach((writeError) => {
            const index = writeError.index != null ? writeError.index : writeError.err && writeError.err.index;
            const duplicate = writeError.code === 11000 || /E11000/.test(writeError.errmsg || '');
            failed.set(index, duplicate ? 'Duplicate value (Admission No. or Roll Number already in use)' : 'Could not be saved');
        });
        return failed;
    }
};

// ---------------------------------------------------------------------------------------
// import
// ---------------------------------------------------------------------------------------

const processImport = async (job) => {
    const { adminId, session, placement, rows } = job.data;
    const config = await getStudentFieldConfig(adminId);
    const classIndex = await loadClassIndex(adminId);
    const classEntry = classIndex.get(String(placement.classId));
    if (!classEntry) throw new Error('Scoped class no longer exists in Academic Setup');

    // Section and group are given by NAME in the sheet — resolved once into Maps here.
    const sectionPool = placement.streamId
        ? ((classEntry.streams.get(String(placement.streamId)) || {}).sections || [])
        : (classEntry.doc.sections || []);
    const sectionByName = new Map(sectionPool.map((section) => [section.name.toUpperCase(), section._id]));
    const groups = classEntry.doc.hasStreams
        ? await SubjectGroupModel.find({ adminId, classId: placement.classId, streamId: placement.streamId }, 'name').lean()
        : [];
    const groupByName = new Map(groups.map((group) => [group.name.toLowerCase(), group._id]));

    const rowErrors = [];
    const valid = [];
    const seenAdmissionNos = new Set();

    for (const { rowNumber, values } of rows) {
        const { value, errors } = validateStudentRecord(values, config);
        const messages = errors.map((error) => error.message);

        if (value.admissionNo == null && !messages.some((m) => m.startsWith('Admission No.'))) {
            messages.push('Admission No. is required for import');
        }
        if (value.admissionNo != null) {
            if (seenAdmissionNos.has(value.admissionNo)) messages.push(`Admission No. ${value.admissionNo} appears twice in this sheet`);
            seenAdmissionNos.add(value.admissionNo);
        }

        let sectionId = null;
        const sectionName = String(values.sectionName || '').trim().toUpperCase();
        if (sectionName) {
            sectionId = sectionByName.get(sectionName) || null;
            if (!sectionId) messages.push(`Section "${sectionName}" is not set up for this class`);
        }
        let groupId = null;
        const groupName = String(values.groupName || '').trim().toLowerCase();
        if (groupName) {
            groupId = groupByName.get(groupName) || null;
            if (!groupId) messages.push(`Subject Group "${values.groupName}" is not set up for this class`);
        }

        if (messages.length) rowErrors.push({ row: rowNumber, messages });
        else valid.push({ rowNumber, value, sectionId, groupId });
    }

    // "Add or update within this class(+stream)" — a student already placed in a DIFFERENT
    // class this session is reported, never silently moved.
    const existing = await StudentProfileModel
        .find({ adminId, admissionNo: { $in: valid.map((item) => item.value.admissionNo) } }, '_id admissionNo')
        .lean();
    const existingIdByNo = new Map(existing.map((item) => [item.admissionNo, item._id]));
    const existingEnrollments = await StudentEnrollmentModel
        .find({ adminId, session, studentId: { $in: existing.map((item) => item._id) } }, 'studentId classId streamId')
        .lean();
    const enrollmentByStudent = new Map(existingEnrollments.map((item) => [String(item.studentId), item]));

    const writable = valid.filter((item) => {
        const studentId = existingIdByNo.get(item.value.admissionNo);
        const enrollment = studentId && enrollmentByStudent.get(String(studentId));
        const moved = enrollment && (String(enrollment.classId) !== String(placement.classId)
            || String(enrollment.streamId || '') !== String(placement.streamId || ''));
        if (moved) {
            rowErrors.push({ row: item.rowNumber, messages: [`Admission No. ${item.value.admissionNo} is already placed in another class this session`] });
        }
        return !moved;
    });

    const now = new Date();
    const studentOps = writable.map(({ value }) => {
        const profile = {};
        Object.keys(value).forEach((key) => { if (!ENROLLMENT_FIELDS.has(key)) profile[key] = value[key]; });
        return {
            updateOne: {
                filter: { adminId, admissionNo: value.admissionNo },
                update: {
                    // bulkWrite skips mongoose middleware, so the derived fields are set here.
                    $set: { ...profile, nameLower: String(value.name).toLowerCase(), status: 'admitted', updatedAt: now },
                    $setOnInsert: { adminId, admissionSession: session, createdAt: now },
                },
                upsert: true,
            },
        };
    });
    const studentFailures = await bulkWriteCollectingErrors(StudentProfileModel, studentOps);

    const savedRows = writable.filter((item, index) => {
        if (!studentFailures.has(index)) return true;
        rowErrors.push({ row: item.rowNumber, messages: [studentFailures.get(index)] });
        return false;
    });

    const saved = await StudentProfileModel
        .find({ adminId, admissionNo: { $in: savedRows.map((item) => item.value.admissionNo) } }, '_id admissionNo')
        .lean();
    const idByNo = new Map(saved.map((item) => [item.admissionNo, item._id]));

    const enrollmentOps = savedRows.map(({ value, sectionId, groupId }) => ({
        updateOne: {
            filter: { adminId, studentId: idByNo.get(value.admissionNo), session },
            update: {
                $set: {
                    classId: toObjectId(placement.classId),
                    class: placement.class,
                    streamId: toObjectId(placement.streamId),
                    groupId: groupId || null,
                    sectionId: sectionId || null,
                    rollNumber: value.rollNumber != null ? value.rollNumber : null,
                    placementIncomplete: Boolean(classEntry.doc.hasStreams && !groupId),
                    updatedAt: now,
                },
                $setOnInsert: { entryType: 'import', createdAt: now },
            },
            upsert: true,
        },
    }));
    const enrollmentFailures = await bulkWriteCollectingErrors(StudentEnrollmentModel, enrollmentOps);
    enrollmentFailures.forEach((message, index) => {
        rowErrors.push({ row: savedRows[index].rowNumber, messages: [message] });
    });

    rowErrors.sort((a, b) => a.row - b.row);
    const succeeded = savedRows.filter((item, index) => !enrollmentFailures.has(index));
    const created = succeeded.filter((item) => !existingIdByNo.has(item.value.admissionNo)).length;
    return {
        total: rows.length,
        created,
        updated: succeeded.length - created,
        failedCount: rowErrors.length,
        failed: rowErrors.slice(0, MAX_REPORTED_ROW_ERRORS),
    };
};

// ---------------------------------------------------------------------------------------
// device-sync (Assign Card / Resync)
// ---------------------------------------------------------------------------------------

const processDeviceSync = async (job) => {
    const { adminId, studentIds } = job.data;
    const students = await StudentProfileModel
        .find({ adminId, _id: { $in: studentIds }, cardNumber: { $type: 'string' } }, 'name cardNumber verifyMode')
        .lean();

    const failed = [];
    let synced = 0;

    // Sequential on purpose: WDMS is an external box with its own rate tolerance, and a
    // bulk assign of 40 cards finishing in a few seconds is fine for a background job.
    for (const student of students) {
        const personId = String(student._id);
        try {
            // Same convention as controllers/biometric-mapping.js: the Schoolzen person id
            // IS the WDMS emp code, so punch ingest resolves it back without a lookup table.
            const mapping = await BiometricMappingModel.findOneAndUpdate(
                { adminId, personType: 'student', personId },
                {
                    $set: { cardNo: student.cardNumber, verifyMode: student.verifyMode, wdmsEmpCode: personId },
                    $setOnInsert: { adminId, personType: 'student', personId, createdAt: new Date() },
                },
                { upsert: true, new: true }
            );

            const person = {
                empCode: mapping.wdmsEmpCode,
                name: student.name,
                cardNo: student.cardNumber,
                verifyMode: student.verifyMode,
            };
            if (mapping.wdmsId) {
                await updateWdmsEmployee(mapping.wdmsId, person);
            } else {
                const created = await createWdmsEmployee(person);
                if (created && created.id != null) {
                    await BiometricMappingModel.updateOne({ _id: mapping._id }, { $set: { wdmsId: String(created.id) } });
                }
            }
            synced += 1;
        } catch (error) {
            failed.push({ studentId: personId, name: student.name, reason: error.message });
        }
    }

    // Best-effort, never throws — see services/wdms-employee.js.
    const pushed = synced > 0 ? await resyncWdmsDevices() : false;

    return { requested: studentIds.length, synced, pushedToDevices: pushed, failed };
};

// ---------------------------------------------------------------------------------------
// promotion
// ---------------------------------------------------------------------------------------

const processPromotion = async (job) => {
    const { adminId, fromSession, toSession, items } = job.data;
    const chunks = chunk(items, PROMOTION_CHUNK_SIZE);
    const totals = { promoted: 0, detained: 0, skipped: 0, incomplete: 0 };

    for (let index = 0; index < chunks.length; index += 1) {
        // Per-chunk idempotency key. A retried job re-enters here from the top; any chunk
        // whose enrollments already carry its key committed on an earlier attempt and is
        // skipped rather than re-processed.
        const chunkKey = `${job.id}#${index}`;
        const alreadyDone = await StudentEnrollmentModel.exists({ adminId, promotionJobKey: chunkKey });
        if (alreadyDone) continue;

        const result = await withTransaction(async (dbSession) => {
            const studentIds = chunks[index].map((item) => toObjectId(item.studentId));
            // Anyone already placed in the next session (an earlier promotion, a manual
            // add) is skipped, never overwritten.
            const placed = await StudentEnrollmentModel
                .find({ adminId, session: toSession, studentId: { $in: studentIds } }, 'studentId')
                .session(dbSession)
                .lean();
            const placedSet = new Set(placed.map((item) => String(item.studentId)));

            const now = new Date();
            const docs = [];
            const counts = { promoted: 0, detained: 0, skipped: 0, incomplete: 0 };
            for (const item of chunks[index]) {
                if (placedSet.has(String(item.studentId))) {
                    counts.skipped += 1;
                    continue;
                }
                const target = item.target;
                docs.push({
                    adminId,
                    studentId: toObjectId(item.studentId),
                    session: toSession,
                    classId: toObjectId(target.classId),
                    class: target.class,
                    streamId: toObjectId(target.streamId),
                    groupId: toObjectId(target.groupId),
                    sectionId: toObjectId(target.sectionId),
                    rollNumber: null,   // cleared on promotion — assigned fresh via Manage Students
                    entryType: item.decision === 'detain' ? 'detained' : 'promotion',
                    placementIncomplete: Boolean(target.placementIncomplete),
                    sourceEnrollmentId: toObjectId(item.enrollmentId),
                    promotionJobKey: chunkKey,
                    createdAt: now,
                    updatedAt: now,
                });
                if (item.decision === 'detain') counts.detained += 1;
                else counts.promoted += 1;
                if (target.placementIncomplete) counts.incomplete += 1;
            }

            if (docs.length) {
                await StudentEnrollmentModel.insertMany(docs, { session: dbSession });
                // Fee arrears carry-forward, LeaveLimit reset, … — whatever the modules that
                // own them have registered (helpers/student/student.utils.js). Same
                // transaction: a student is never half-promoted.
                await runPromotionSteps({ dbSession, adminId, fromSession, toSession, enrollments: docs });
            }
            return counts;
        });

        Object.keys(totals).forEach((key) => { totals[key] += result[key]; });
        await job.updateProgress(Math.round(((index + 1) / chunks.length) * 100));
    }

    return { ...totals, toSession };
};

// ---------------------------------------------------------------------------------------

const HANDLERS = {
    import: processImport,
    'device-sync': processDeviceSync,
    promotion: processPromotion,
};

const processStudentJob = async (job) => {
    const handler = HANDLERS[job.name];
    if (!handler) throw new Error(`Unknown student job: ${job.name}`);
    logger.info('student-worker.start', { name: job.name, jobId: job.id, adminId: job.data.adminId });
    const result = await handler(job);
    logger.info('student-worker.done', { name: job.name, jobId: job.id });
    return result;
};

/** @returns {Worker} started, and owned by worker.js's shutdown handler. */
const startStudentWorker = () => {
    const worker = new Worker(QUEUE_NAME, processStudentJob, {
        ...defaultWorkerOptions,
        concurrency: CONCURRENCY,
    });
    worker.on('failed', (job, error) => logger.error('student-worker.failed', error));
    worker.on('error', (error) => logger.error('student-worker.error', error));
    startHeartbeat(QUEUE_NAME);
    logger.info('student-worker.started', { queue: QUEUE_NAME, concurrency: CONCURRENCY });
    return worker;
};

module.exports = startStudentWorker;
// The job handlers themselves, for running a job in-process (tests, one-off scripts)
// without a Redis-backed Worker.
module.exports.handlers = HANDLERS;
