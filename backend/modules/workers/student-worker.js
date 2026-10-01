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
    loadClassIndex, toObjectId, withTransaction, runPromotionSteps, DUPLICATE_RULES,
} = require('../helpers/student/student.utils');
const studentMessages = require('../helpers/messages/student.messages');
const { invalidateClassStats } = require('../helpers/student/student-write');
const { keepStoredForMasks } = require('../helpers/student/student-mask');
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

// A duplicate-key write error names its index ("index: adminId_1_aadharNumber_1 dup key")
// but not always a keyPattern; read the field off either, so each failed row gets its own
// catalog code (AADHAR_DUPLICATE, ROLL_NUMBER_DUPLICATE, …) rather than one vague message.
const duplicateFieldOf = (writeError) => {
    const pattern = (writeError.err && writeError.err.keyPattern) || writeError.keyPattern;
    const fromPattern = pattern && Object.keys(pattern).find((key) => DUPLICATE_RULES[key]);
    if (fromPattern) return fromPattern;
    const indexName = (/index: (\S+)/.exec(writeError.errmsg || (writeError.err && writeError.err.errmsg) || '') || [])[1] || '';
    return Object.keys(DUPLICATE_RULES).find((key) => indexName.includes(key)) || null;
};

/** One catalog `rows[]` entry's field error. */
const fieldError = (field, code, message) => ({ field, ...(code ? { code } : {}), message });

// bulkWrite with ordered:false writes every valid op and reports the rest; turn that into
// a per-op-index Map of field errors instead of losing the whole batch to one duplicate.
// The driver's BulkWriteResult comes back too (also on a partial failure): the import's
// counts are built from what the write REPORTED, never from how many rows went in
// (student-critical-fixes.md P0-1).
//
// A write error is mapped back to its op by the op's FILTER (`keyOf`), never by the
// driver's index: mongoose 6's unordered bulkWrite re-orders the ops before sending them
// (validOps.sort() — a string sort, so op 10 goes before op 2), and the driver's indexes
// refer to that re-ordered list. Trusting them pinned failures on the wrong rows.
const bulkWriteCollectingErrors = async (model, ops, keyOf) => {
    if (ops.length === 0) return { failed: new Map(), result: null };
    try {
        const result = await model.bulkWrite(ops, { ordered: false });
        return { failed: new Map(), result };
    } catch (error) {
        if (!error.writeErrors) throw error;
        const indexByKey = new Map(ops.map((op, index) => [keyOf(op.updateOne.filter), index]));
        const failed = new Map();
        [].concat(error.writeErrors).forEach((writeError) => {
            const op = typeof writeError.getOperation === 'function' ? writeError.getOperation() : null;
            const filter = op && (op.q || op.filter);
            const index = filter && indexByKey.has(keyOf(filter))
                ? indexByKey.get(keyOf(filter))
                : (writeError.index != null ? writeError.index : writeError.err && writeError.err.index);
            const isDuplicate = writeError.code === 11000 || /E11000/.test(writeError.errmsg || '');
            const field = isDuplicate ? duplicateFieldOf(writeError) : null;
            const rule = field && DUPLICATE_RULES[field];
            failed.set(index, rule
                ? fieldError(rule.field, rule.code, studentMessages.duplicate[rule.code]())
                : fieldError('row', 'ROW_NOT_SAVED', 'This row could not be saved.'));
        });
        return { failed, result: error.result || null };
    }
};

/** The _ids a BulkWriteResult says it upserted (by id, not index — see above). */
const upsertedIdSet = (result) => new Set(Object.values((result && result.upsertedIds) || {}).map(String));

// A document as comparable data — ids and dates as strings, null ≡ missing, bookkeeping
// timestamps ignored — so "did this row change anything?" is read off the stored document
// before and after the write, never assumed from the sheet.
const BOOKKEEPING_KEYS = ['_id', '__v', 'createdAt', 'updatedAt'];
const canonical = (value) => {
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) return value.toISOString();
    if (value._bsontype) return String(value);
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === 'object') {
        const out = {};
        Object.keys(value).sort().forEach((key) => {
            const item = canonical(value[key]);
            if (item !== undefined) out[key] = item;
        });
        return Object.keys(out).length ? out : undefined;
    }
    return value;
};
const fingerprint = (doc) => {
    if (!doc) return null;
    const copy = { ...doc };
    BOOKKEEPING_KEYS.forEach((key) => { delete copy[key]; });
    return JSON.stringify(canonical(copy) || {});
};

// The Admission No. as the validator will read it — for looking the student up BEFORE
// validation (their stored identifiers decide what a masked cell means).
const admissionNoOf = (raw) => {
    const number = Number(String(raw == null ? '' : raw).replace(/[,\s]/g, ''));
    return Number.isInteger(number) && number > 0 ? number : null;
};

// The unique fields a sheet can repeat within itself (student/errors.md, Bulk Import):
// a duplicate between row 5 and row 40 is caught before either is written.
const IN_FILE_UNIQUE = ['admissionNo', 'rollNumber', 'aadharNumber', 'samagraId', 'penNumber'];

// "8th", "8", "8TH", "LKG" → one comparable token.
const classToken = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(\d+)(st|nd|rd|th)$/, '$1');

// ---------------------------------------------------------------------------------------
// import
// ---------------------------------------------------------------------------------------

const processImport = async (job) => {
    // `sessionId` is the AcademicSession reference the controller resolved; enrollments store
    // it, never the label.
    const { adminId, sessionId: sessionIdText, placement, rows } = job.data;
    const sessionId = toObjectId(sessionIdText);
    const config = await getStudentFieldConfig(adminId);
    const classIndex = await loadClassIndex(adminId);
    const classEntry = classIndex.get(String(placement.classId));
    if (!classEntry) throw new Error('Scoped class no longer exists in Academic Setup');

    // Section and group are given by NAME in the sheet — resolved once into Maps here.
    const sectionPool = placement.streamId
        ? ((classEntry.streams.get(String(placement.streamId)) || {}).sections || [])
        : (classEntry.doc.sections || []);
    const sectionByName = new Map(sectionPool.map((section) => [section.name.toUpperCase(), section._id]));
    // Group (student-fix5.md #9): validated against the groups that ACTUALLY exist for this
    // sheet's class+stream — never a fixed list. A non-streamed class's rows ignore the
    // column and take the class's automatic "General" group.
    const groups = await SubjectGroupModel
        .find({ adminId, classId: placement.classId, streamId: placement.streamId || null }, 'name isSystemGroup')
        .lean();
    const streamGroups = groups.filter((group) => !group.isSystemGroup);
    const generalGroup = groups.find((group) => group.isSystemGroup);
    const groupByName = new Map(streamGroups.map((group) => [group.name.toLowerCase(), group._id]));

    // Every student this sheet could touch, as stored right now. Read ONCE, before
    // validation: it decides what a masked identifier means for a row (below), and it is the
    // "before" side of the created/updated/unchanged counts.
    const candidateNos = [...new Set(rows.map(({ values }) => admissionNoOf(values.admissionNo)).filter(Boolean))];
    const existingProfiles = candidateNos.length
        ? await StudentProfileModel.find({ adminId, admissionNo: { $in: candidateNos } }).lean()
        : [];
    const existingByNo = new Map(existingProfiles.map((item) => [item.admissionNo, item]));

    // Every failing row, in the catalog's shape #7: { row, fields:[{field, code?, message}] }.
    // ALL rows are validated before anything is written, and one bad row never stops the
    // rest — rows that pass are still committed.
    const rowErrors = [];
    const valid = [];
    const labelOf = new Map(config.map((field) => [field.fieldKey, field.label]));
    // value → first row it appeared on, per unique field.
    const seen = new Map(IN_FILE_UNIQUE.map((key) => [key, new Map()]));

    // The scoped class, and every configured class, by comparable token.
    const scopeToken = classToken(classEntry.label);
    const classTokens = new Set();
    // "First Enrolled Class" is written as a class LABEL in the sheet ("8th") and stored as
    // that class's id — resolved here, before validation, from the same tokens.
    const classIdByToken = new Map();
    classIndex.forEach((entry) => {
        classTokens.add(classToken(entry.label));
        classTokens.add(classToken(String(entry.doc.class)));
        classIdByToken.set(classToken(entry.label), String(entry.doc._id));
        classIdByToken.set(classToken(String(entry.doc.class)), String(entry.doc._id));
    });

    for (const { rowNumber, values } of rows) {
        const fields = [];
        const admissionClassText = String(values.admissionClass == null ? '' : values.admissionClass).trim();
        const record = { ...values };
        // A Masked export re-imported: the exact mask of an EXISTING student's stored
        // identifier means "unchanged" and is dropped here. Any other masked cell (a new
        // student, nothing stored, a mask of a different number) is failed by the validator
        // as MASKED_VALUE — a mask is never written (P0-2).
        keepStoredForMasks(record, existingByNo.get(admissionNoOf(values.admissionNo)) || null);
        // A sheet row with no Admission Type is an existing student when it gives a real
        // admission date (the usual mid-session onboarding sheet), else a new admission.
        if (record.admissionType == null || String(record.admissionType).trim() === '') {
            record.admissionType = record.doa != null && String(record.doa).trim() !== '' ? 'old' : 'new';
        }
        if (admissionClassText) {
            const id = classIdByToken.get(classToken(admissionClassText));
            if (id) record.admissionClass = id;
            else {
                delete record.admissionClass;
                fields.push(fieldError('admissionClass', 'CLASS_NAME_UNRECOGNIZED', studentMessages.classNameUnrecognized(admissionClassText)));
            }
        }
        // 'new' is admitted TODAY (student/errors.md, admissionType) — same rule as the form: a
        // sheet date on a 'new' row is ignored, so it can neither set the date nor fail
        // DOA_BEFORE_DOB. Today is applied on insert only (below), so re-importing an export
        // never rewrites an existing student's recorded date.
        if (String(record.admissionType).trim().toLowerCase() === 'new') delete record.doa;
        const { value, errors } = validateStudentRecord(record, config);
        if (value.admissionType === 'old' && value.doa == null && !errors.some((error) => error.field === 'doa')) {
            errors.push({ field: 'doa', message: studentMessages.doaRequired() });
        }

        // Missing required fields become ONE line naming every one of them (legacy
        // behaviour, kept): "Missing: Father Name, Mother Occupation, Date of Birth."
        const missing = errors.filter((error) => error.missing).map((error) => labelOf.get(error.field) || error.field);
        if (missing.length) fields.push(fieldError('row', 'FIELDS_REQUIRED', `Missing: ${missing.join(', ')}.`));
        errors.filter((error) => !error.missing)
            .forEach((error) => fields.push(fieldError(error.field, error.code, error.message)));

        if (value.admissionNo == null && !missing.includes(labelOf.get('admissionNo'))) {
            fields.push(fieldError('admissionNo', 'ADMISSION_NO_REQUIRED', 'Admission No. is required for import.'));
        }

        IN_FILE_UNIQUE.forEach((key) => {
            if (value[key] == null || value[key] === '') return;
            const firstRow = seen.get(key).get(String(value[key]));
            if (firstRow) {
                const rule = DUPLICATE_RULES[key];
                fields.push(fieldError(key, rule.code, studentMessages.duplicateInFile(labelOf.get(key) || key, firstRow)));
            } else {
                seen.get(key).set(String(value[key]), rowNumber);
            }
        });

        const classText = String(values.className || '').trim();
        if (classText && classToken(classText) !== scopeToken) {
            fields.push(classTokens.has(classToken(classText))
                ? fieldError('className', 'CLASS_OUT_OF_SCOPE', studentMessages.classOutOfScope(classText, classEntry.label))
                : fieldError('className', 'CLASS_NAME_UNRECOGNIZED', studentMessages.classNameUnrecognized(classText)));
        }

        let sectionId = null;
        const sectionName = String(values.sectionName || '').trim().toUpperCase();
        if (sectionName) {
            sectionId = sectionByName.get(sectionName) || null;
            if (!sectionId) fields.push(fieldError('sectionName', 'SECTION_NOT_FOUND', `Section "${sectionName}" is not set up for this class.`));
        }
        let groupId = null;
        if (classEntry.doc.hasStreams) {
            const groupText = String(values.groupName || '').trim();
            if (!streamGroups.length) {
                fields.push(fieldError('groupName', 'SUBJECT_GROUP_MISSING', studentMessages.subjectGroupMissing()));
            } else if (!groupText) {
                fields.push(fieldError('groupName', 'GROUP_REQUIRED', studentMessages.groupRequired()));
            } else {
                groupId = groupByName.get(groupText.toLowerCase()) || null;
                if (!groupId) fields.push(fieldError('groupName', 'GROUP_NAME_UNRECOGNIZED', studentMessages.groupNameUnrecognized(groupText)));
            }
        } else {
            groupId = generalGroup ? generalGroup._id : null;
        }

        if (fields.length) rowErrors.push({ row: rowNumber, fields });
        else valid.push({ rowNumber, value, sectionId, groupId });
    }

    // "Add or update within this class(+stream)" — a student already placed in a DIFFERENT
    // class this session is reported, never silently moved.
    const existing = valid.map((item) => existingByNo.get(item.value.admissionNo)).filter(Boolean);
    const existingEnrollments = existing.length
        ? await StudentEnrollmentModel.find({ adminId, sessionId, studentId: { $in: existing.map((item) => item._id) } }).lean()
        : [];
    const enrollmentByStudent = new Map(existingEnrollments.map((item) => [String(item.studentId), item]));

    const writable = valid.filter((item) => {
        const before = existingByNo.get(item.value.admissionNo);
        const enrollment = before && enrollmentByStudent.get(String(before._id));
        const moved = enrollment && (String(enrollment.classId) !== String(placement.classId)
            || String(enrollment.streamId || '') !== String(placement.streamId || ''));
        if (moved) {
            rowErrors.push({
                row: item.rowNumber,
                fields: [fieldError('admissionNo', 'STUDENT_IN_OTHER_CLASS',
                    `Admission No. ${item.value.admissionNo} is already placed in another class this session.`)],
            });
        }
        return !moved;
    });

    // updatedAt is NOT in the $set: a row that changes nothing must leave its document
    // exactly as it was, so "unchanged" is something the database confirms. It is bumped
    // below for the rows that really changed.
    const now = new Date();
    const studentOps = writable.map(({ value }) => {
        const profile = {};
        Object.keys(value).forEach((key) => {
            if (ENROLLMENT_FIELDS.has(key)) return;
            // Custom fields go in one by one, so a re-import never wipes the others.
            if (key === 'extraFields') Object.entries(value.extraFields).forEach(([name, v]) => { profile[`extraFields.${name}`] = v; });
            else profile[key] = value[key];
        });
        // A blank First Enrolled Class on a NEW student means the class being imported into;
        // an existing student's recorded value is never overwritten by a blank.
        const onInsert = { adminId, createdAt: now, updatedAt: now };
        if (profile.admissionClass == null) {
            delete profile.admissionClass;
            onInsert.admissionClass = toObjectId(placement.classId);
        }
        if (value.admissionType === 'new') {
            delete profile.doa;
            const today = new Date();
            onInsert.doa = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
        }
        return {
            updateOne: {
                filter: { adminId, admissionNo: value.admissionNo },
                update: {
                    // bulkWrite skips mongoose middleware, so the derived fields are set here.
                    $set: { ...profile, nameLower: String(value.name).toLowerCase(), status: 'admitted' },
                    // No session on the profile — the enrollment below carries it.
                    $setOnInsert: onInsert,
                },
                upsert: true,
            },
        };
    });
    const { failed: studentFailures, result: studentResult } = await bulkWriteCollectingErrors(
        StudentProfileModel, studentOps, (filter) => `no:${filter.admissionNo}`);
    // "Created" is exactly what the driver says it upserted — matched to rows by _id below.
    const upsertedIds = upsertedIdSet(studentResult);

    const savedRows = [];
    writable.forEach((item, index) => {
        if (studentFailures.has(index)) {
            rowErrors.push({ row: item.rowNumber, fields: [studentFailures.get(index)] });
            return;
        }
        savedRows.push(item);
    });
    // The write must account for every op it was given: upserted + matched + failed.
    if (studentResult && studentResult.upsertedCount + studentResult.matchedCount + studentFailures.size !== studentOps.length) {
        logger.warn('student-worker.import.countMismatch', {
            jobId: job.id, ops: studentOps.length, upserted: studentResult.upsertedCount,
            matched: studentResult.matchedCount, failed: studentFailures.size,
        });
    }

    const saved = await StudentProfileModel
        .find({ adminId, admissionNo: { $in: savedRows.map((item) => item.value.admissionNo) } }, '_id admissionNo')
        .lean();
    const idByNo = new Map(saved.map((item) => [item.admissionNo, item._id]));
    savedRows.forEach((item) => { item.inserted = upsertedIds.has(String(idByNo.get(item.value.admissionNo))); });

    const enrollmentOps = savedRows.map(({ value, sectionId, groupId }) => ({
        updateOne: {
            filter: { adminId, studentId: idByNo.get(value.admissionNo), sessionId },
            update: {
                $set: {
                    classId: toObjectId(placement.classId),
                    class: placement.class,
                    streamId: toObjectId(placement.streamId),
                    groupId: groupId || null,
                    sectionId: sectionId || null,
                    rollNumber: value.rollNumber != null ? value.rollNumber : null,
                    placementIncomplete: Boolean(classEntry.doc.hasStreams && !groupId),
                },
                $setOnInsert: { entryType: 'import', createdAt: now, updatedAt: now },
            },
            upsert: true,
        },
    }));
    const { failed: enrollmentFailures } = await bulkWriteCollectingErrors(
        StudentEnrollmentModel, enrollmentOps, (filter) => `student:${filter.studentId}`);
    // A student this run INSERTED whose enrollment then failed is removed again — never a
    // student without a placement (the form's transaction rule), and never a row reported
    // as failed that is nonetheless sitting in v2-student.
    const orphanIds = [];
    enrollmentFailures.forEach((error, index) => {
        rowErrors.push({ row: savedRows[index].rowNumber, fields: [error] });
        if (savedRows[index].inserted) orphanIds.push(idByNo.get(savedRows[index].value.admissionNo));
    });
    if (orphanIds.length) await StudentProfileModel.deleteMany({ adminId, _id: { $in: orphanIds } });

    // Created / updated / unchanged per row, off the STORED documents: "created" per the
    // driver's upserts; otherwise "updated" only when the profile or this session's
    // enrollment now reads differently than it did before the write.
    const succeeded = savedRows.filter((item, index) => !enrollmentFailures.has(index));
    const succeededIds = succeeded.map((item) => idByNo.get(item.value.admissionNo));
    const [afterProfiles, afterEnrollments] = succeeded.length
        ? await Promise.all([
            StudentProfileModel.find({ adminId, _id: { $in: succeededIds } }).lean(),
            StudentEnrollmentModel.find({ adminId, sessionId, studentId: { $in: succeededIds } }).lean(),
        ])
        : [[], []];
    const profileAfter = new Map(afterProfiles.map((item) => [String(item._id), item]));
    const enrollmentAfter = new Map(afterEnrollments.map((item) => [String(item.studentId), item]));

    let created = 0;
    let updated = 0;
    const changedProfiles = [];
    const changedEnrollments = [];
    succeeded.forEach((item) => {
        if (item.inserted) {
            created += 1;
            return;
        }
        const studentId = idByNo.get(item.value.admissionNo);
        const key = String(studentId);
        const profileChanged = fingerprint(existingByNo.get(item.value.admissionNo)) !== fingerprint(profileAfter.get(key));
        const beforeEnrollment = enrollmentByStudent.get(key);
        const enrollmentChanged = fingerprint(beforeEnrollment) !== fingerprint(enrollmentAfter.get(key));
        if (profileChanged) changedProfiles.push(studentId);
        // A brand-new enrollment already carries its own updatedAt ($setOnInsert).
        if (enrollmentChanged && beforeEnrollment) changedEnrollments.push(beforeEnrollment._id);
        if (profileChanged || enrollmentChanged) updated += 1;
    });
    await Promise.all([
        changedProfiles.length && StudentProfileModel.updateMany({ adminId, _id: { $in: changedProfiles } }, { $set: { updatedAt: now } }),
        changedEnrollments.length && StudentEnrollmentModel.updateMany({ adminId, _id: { $in: changedEnrollments } }, { $set: { updatedAt: now } }),
    ]);

    // Enrollments were created/updated — Academic Setup's enrolled count is stale.
    await invalidateClassStats(adminId);
    rowErrors.sort((a, b) => a.row - b.row);
    // Rows that passed are summarized as counts; only failures are listed (design-system.md,
    // bulk/import result panel). created + updated + unchanged + failedCount = total.
    return {
        total: rows.length,
        created,
        updated,
        unchanged: succeeded.length - created - updated,
        failedCount: rowErrors.length,
        code: rowErrors.length ? 'BULK_ROWS_FAILED' : null,
        message: rowErrors.length ? studentMessages.bulkRowsFailed(rowErrors.length, rows.length) : null,
        rows: rowErrors.slice(0, MAX_REPORTED_ROW_ERRORS),
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
    const { adminId, fromSession, toSession, toSessionId: toSessionIdText, items } = job.data;
    const toSessionId = toObjectId(toSessionIdText);
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
                .find({ adminId, sessionId: toSessionId, studentId: { $in: studentIds } }, 'studentId')
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
                    sessionId: toSessionId,
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

    // New next-session enrollments exist now — Academic Setup's enrolled count is stale.
    await invalidateClassStats(adminId);
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
