'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/student.messages');
const { getStudentFieldConfig, optionsFor } = require('../../validators/student/field-config.validator');
const { buildWorkbook, parseWorkbook } = require('../../services/excel/excel.service');
const { destroyImages, imageUrl } = require('../../services/media/cloudinary.service');
const { buildStudentSheetColumns, formatSheetDate } = require('../../helpers/student/student-excel');
const { createStudentRecord, updateStudentRecord, invalidateClassStats } = require('../../helpers/student/student-write');
const { findSessionId, ensureSessionId, labelOfSessionId } = require('../../helpers/academic-session/session-resolver');
const { maskStudent, maskValue, SENSITIVE_FIELDS } = require('../../helpers/student/student-mask');
const { logActivity } = require('../../services/activity-log.service');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const {
    MODULE, toObjectId, loadClassIndex, loadSubjectGroups, describePlacement, buildEnrollmentMatch,
    listStudentRows, runStudentDeleteCascade, withTransaction,
} = require('../../helpers/student/student.utils');

// Manage Students — every student in the session, filters only narrow (manage-students.md).
//
// Same error contract as Academic Setup: handlers throw typed errors and let the shared
// errorHandler shape the response; success messages come from helpers/messages/.
//
// The queue module is required lazily inside the handlers that enqueue: it opens the Redis
// connection at require-time, and a read-only list request has no reason to depend on it.
const queue = () => require('../../queues/student-queue');

// An import is a class's worth of students, not a whole school's — past this, split it.
const MAX_IMPORT_ROWS = 5000;

// ---------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------

let ListStudents = async (req, res) => {
    const result = await listStudentRows({ adminId: req.query.adminId, query: req.query });
    return res.status(200).json(result);
};

// The side card: Total Students (this session) and Cards Assigned — two index-backed
// counts, never a scan.
let GetOverview = async (req, res) => {
    const { adminId, session } = req.query;
    const sessionId = await findSessionId(adminId, session);
    const [totalStudents, cardsAssigned] = await Promise.all([
        sessionId ? StudentEnrollmentModel.countDocuments({ adminId, sessionId }) : 0,
        StudentProfileModel.countDocuments({ adminId, cardNumber: { $type: 'string' } }),
    ]);
    return res.status(200).json({ totalStudents, cardsAssigned });
};

/** Everything the form and the view modal need for one student, with placement labels. */
let GetStudent = async (req, res) => {
    const adminId = req.query.adminId;
    const student = await StudentProfileModel
        .findOne({ _id: req.params.id, adminId }, '-legacyStudentId -nameLower -__v')
        .lean();
    if (!student) throw new NotFoundError(messages.studentNotFound(), { module: MODULE, context: { id: req.params.id } });

    // The asked-for session's placement; without one, the student's most recent placement.
    const sessionId = req.query.session ? await findSessionId(adminId, req.query.session) : null;
    const enrollment = sessionId
        ? await StudentEnrollmentModel.findOne({ adminId, studentId: student._id, sessionId }).lean()
        : await StudentEnrollmentModel.findOne({ adminId, studentId: student._id }).sort({ createdAt: -1 }).lean();

    const classIndex = await loadClassIndex(adminId);
    let placement = null;
    if (enrollment) {
        const [group, sessionLabel] = await Promise.all([
            enrollment.groupId ? SubjectGroupModel.findOne({ _id: enrollment.groupId, adminId }, 'name').lean() : null,
            labelOfSessionId(adminId, enrollment.sessionId),
        ]);
        const described = describePlacement(classIndex, enrollment);
        placement = {
            enrollmentId: String(enrollment._id),
            // The label the page shows; the enrollment itself stores the session's id.
            session: sessionLabel,
            classId: String(enrollment.classId),
            class: enrollment.class,
            streamId: enrollment.streamId ? String(enrollment.streamId) : null,
            groupId: enrollment.groupId ? String(enrollment.groupId) : null,
            sectionId: enrollment.sectionId ? String(enrollment.sectionId) : null,
            rollNumber: enrollment.rollNumber,
            entryType: enrollment.entryType,
            placementIncomplete: Boolean(enrollment.placementIncomplete),
            className: described.className,
            streamName: described.streamName,
            sectionName: described.sectionName,
            groupName: group ? group.name : null,
        };
    }

    // The card number is shown IN FULL (student-fix4.md C): an operational identifier the
    // admin reads for device troubleshooting, not regulated PII.
    student.card = student.cardNumber || null;
    delete student.cardNumber;
    // First Enrolled Class is stored as a class id; the view shows its label.
    const firstClass = student.admissionClass && classIndex.get(String(student.admissionClass));
    student.admissionClass = student.admissionClass ? String(student.admissionClass) : null;
    student.admissionClassLabel = firstClass ? firstClass.label : null;
    // The profile view's photo, at the size it renders (f_auto,q_auto).
    if (student.photoPublicId) student.photoUrl = imageUrl(student.photoPublicId);

    // Aadhar / bank A/C / IFSC / PEN leave the server MASKED, except to the Edit form, which
    // has to show the real value to edit it. View Profile reveals one field at a time
    // through POST /students/:id/reveal, which is logged.
    const body = req.query.purpose === 'edit' ? student : maskStudent(student);

    // The fee ledger for this placement's session (else the latest): once it exists, the
    // form shows admission fee/concession read-only — they're Fees-module truth.
    const feeDoc = await StudentFeeRecordModel
        .findOne({ adminId, studentId: student._id, ...(enrollment ? { sessionId: enrollment.sessionId } : {}) },
            'totalFee concession admissionFee concessionReason')
        .sort({ createdAt: -1 })
        .lean();
    const feeRecord = feeDoc ? {
        totalFee: feeDoc.totalFee,
        concession: feeDoc.concession,
        admissionFee: feeDoc.admissionFee,
        payable: feeDoc.totalFee - feeDoc.concession,
        concessionReason: feeDoc.concessionReason || null,
    } : null;
    return res.status(200).json({ student: body, placement, feeRecord });
};

/**
 * View Profile's eye toggle: ONE masked field's real value. The reveal is written to the
 * ActivityLog before the value is sent — if the log write fails, nothing is revealed.
 * Hiding it again is purely client-side and isn't logged.
 */
let RevealStudentField = async (req, res) => {
    const { adminId, field } = req.body;
    const student = await StudentProfileModel.findOne({ _id: req.params.id, adminId }, field).lean();
    if (!student) throw new NotFoundError(messages.studentNotFound(), { module: MODULE, context: { id: req.params.id } });
    const value = student[field] == null ? null : String(student[field]);
    await logActivity(req, { module: MODULE, action: 'student.field.reveal', targetId: req.params.id, meta: { field } });
    return res.status(200).json({ field, value });
};

/**
 * Everything the Class → Stream → Group → Section cascade filter needs, in ONE response —
 * the school's classes with their streams and sections, and every subject group keyed by
 * class/stream. Shared by all three Student pages and the Student form, so none of them
 * stitches Academic Setup's separate endpoints together in the browser.
 */
let GetFilterOptions = async (req, res) => {
    const adminId = req.query.adminId;
    // Both through Academic Setup's own cache keys (student/optimization.md) — never a
    // Student-local copy of the same data.
    const [classIndex, groups] = await Promise.all([
        loadClassIndex(adminId),
        loadSubjectGroups(adminId),
    ]);
    const classes = [...classIndex.values()]
        .sort((a, b) => (a.doc.class >= 200 ? a.doc.class - 300 : a.doc.class) - (b.doc.class >= 200 ? b.doc.class - 300 : b.doc.class))
        .map((entry) => ({
            _id: String(entry.doc._id),
            class: entry.doc.class,
            label: entry.label,
            hasStreams: Boolean(entry.doc.hasStreams),
            sections: (entry.doc.sections || []).map((section) => ({ _id: String(section._id), name: section.name })),
            streams: (entry.doc.streams || []).map((stream) => ({
                _id: String(stream._id),
                name: stream.name,
                sections: (stream.sections || []).map((section) => ({ _id: String(section._id), name: section.name })),
            })),
        }));
    return res.status(200).json({
        classes,
        groups: groups.map((group) => ({
            _id: String(group._id),
            name: group.name,
            classId: String(group.classId),
            streamId: group.streamId ? String(group.streamId) : null,
        })),
    });
};

/**
 * The FieldConfig the forms render from — which fields show, which are required, and the
 * categorical options — so the `.dd` menus and the server validator share one source.
 */
let GetFieldConfig = async (req, res) => {
    // Cached, and already resolved for this school's state (state-specific fields hidden,
    // state-specific option lists applied).
    const fields = await getStudentFieldConfig(req.query.adminId);
    return res.status(200).json({ fields, options: optionsFor(fields) });
};

// ---------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------

// `warnings` lists every save-with-a-caveat (IMAGE_UPLOAD_FAILED: saved, photo not;
// FEE_STRUCTURE_MISSING: saved, no fee record yet) — a 200 with warnings, never a 500 for a
// student that actually exists. `warning` (the first) is kept for older callers.
// Both writes respond with the FRESH list row (module-optimization-guide.md §2), so the page
// updates its table from the response — never a follow-up GET to see its own change.
let CreateStudent = async (req, res) => {
    const { id, row, warnings } = await createStudentRecord({
        adminId: req.adminId,
        body: req.body,
        file: req.file,
        entryType: 'manual',
    });
    return res.status(200).json({ message: success.created('Student'), id, student: row, warnings, warning: warnings[0] || null });
};

let UpdateStudent = async (req, res) => {
    const { row, warnings } = await updateStudentRecord({
        adminId: req.adminId,
        studentId: req.params.id,
        body: req.body,
        file: req.file,
    });
    return res.status(200).json({ message: success.updated('Student'), id: req.params.id, student: row, warnings, warning: warnings[0] || null });
};

/**
 * Delete one or many students with the full cascade (login, fees, admit cards, results —
 * whatever the owning modules have registered) inside ONE transaction.
 *
 * `confirmed` is the server-side backstop for the type-DELETE modal: the API refuses
 * without it, so calling it directly can't skip what the UI insists on.
 */
const requireConfirmation = (confirmed, count) => {
    if (!confirmed) {
        throw new ConflictError(messages.deleteNeedsConfirmation(count), {
            module: MODULE,
            code: 'DELETE_NOT_CONFIRMED',
            context: { requiresConfirmation: true, count },
        });
    }
};

/**
 * Delete the given students — cascade included — in ONE transaction; ids that don't
 * resolve to a student of THIS school are reported back, never deleted (and never revealed
 * as "belongs to another school": another school's id reads exactly like a missing one).
 * @returns {Promise<{ deleted: Number, missing: String[] }>}
 */
const deleteStudents = async (adminId, ids) => {
    const studentIds = ids.map(toObjectId);
    const found = await StudentProfileModel.find({ adminId, _id: { $in: studentIds } }, '_id').lean();
    const foundIds = found.map((item) => item._id);
    const foundSet = new Set(foundIds.map(String));
    const missing = ids.filter((id) => !foundSet.has(String(id)));

    if (foundIds.length) {
        const afterCommit = await withTransaction((dbSession) => runStudentDeleteCascade({ dbSession, adminId, studentIds: foundIds }));
        // Same request as the write: enrollments are gone, so Academic Setup's enrolled count is stale.
        await invalidateClassStats(adminId);
        // Outside the transaction: an external delete can't be rolled back.
        destroyImages(afterCommit.photoPublicIds);
    }
    return { deleted: foundIds.length, missing };
};

let DeleteStudent = async (req, res) => {
    const confirmed = req.query.confirmed === 'true' || req.body.confirmed === true;
    requireConfirmation(confirmed, 1);
    const { deleted } = await deleteStudents(req.adminId, [req.params.id]);
    if (!deleted) throw new NotFoundError(messages.studentNotFound(), { module: MODULE, code: 'STUDENT_NOT_FOUND' });
    return res.status(200).json({ message: success.deleted('Student') });
};

/**
 * "Delete Selected" — a PER-ROW outcome (student/errors.md, frontend requirements), never
 * one pass/fail for the whole selection: every student that exists is deleted, and any id
 * that didn't resolve is listed in `rows[]` with its own code.
 */
let BulkDeleteStudents = async (req, res) => {
    const { ids, confirmed } = req.body;
    requireConfirmation(confirmed, ids.length);
    const { deleted, missing } = await deleteStudents(req.adminId, ids);
    if (!deleted) {
        throw new NotFoundError(messages.studentsNotFound(missing.length), { module: MODULE, code: 'STUDENT_NOT_FOUND' });
    }
    return res.status(200).json({
        message: success.bulkProcessed(deleted, 'student'),
        deleted,
        rows: missing.map((id) => ({ id, code: 'STUDENT_NOT_FOUND', message: messages.studentNotFound() })),
    });
};

/**
 * Assign Card — single or bulk. The cards are saved here (one bulkWrite); pushing them to
 * the biometric devices is a background job, so the request never waits on WDMS
 * (manage-students.md). 202 + jobId; the modal polls it.
 */
let AssignCards = async (req, res) => {
    const { items, verifyMode } = req.body;
    const adminId = req.adminId;
    const cardMessage = messages.duplicate.CARD_ALREADY_ASSIGNED();

    // Per-row outcome (student/errors.md): a student that doesn't exist here, or a card
    // another student already holds, fails ITS row — the rest of the selection still goes
    // through. (A card typed twice in one request is rejected before this, by the schema.)
    const [found, taken] = await Promise.all([
        StudentProfileModel.find({ adminId, _id: { $in: items.map((item) => toObjectId(item.studentId)) } }, '_id').lean(),
        StudentProfileModel.find({
            adminId,
            cardNumber: { $in: items.map((item) => item.cardNumber) },
            _id: { $nin: items.map((item) => toObjectId(item.studentId)) },
        }, 'cardNumber').lean(),
    ]);
    const foundSet = new Set(found.map((item) => String(item._id)));
    const takenSet = new Set(taken.map((item) => item.cardNumber));

    const rows = [];
    const writable = [];
    items.forEach((item) => {
        if (!foundSet.has(String(item.studentId))) {
            rows.push({ studentId: item.studentId, code: 'STUDENT_NOT_FOUND', message: messages.studentNotFound() });
        } else if (takenSet.has(item.cardNumber)) {
            rows.push({ studentId: item.studentId, code: 'CARD_ALREADY_ASSIGNED', message: `Card ${item.cardNumber}: ${cardMessage}` });
        } else {
            writable.push(item);
        }
    });

    // ordered:false — the unique index is the real guard; a card lost to a concurrent assign
    // fails only its own row here instead of the whole batch.
    const now = new Date();
    try {
        if (writable.length) {
            await StudentProfileModel.bulkWrite(writable.map((item) => ({
                updateOne: {
                    filter: { _id: toObjectId(item.studentId), adminId },
                    update: { $set: { cardNumber: item.cardNumber, verifyMode, updatedAt: now } },
                },
            })), { ordered: false });
        }
    } catch (error) {
        if (!error.writeErrors) throw error;
        const failedIndexes = new Set([].concat(error.writeErrors).map((writeError) => writeError.index));
        const stillWritable = [];
        writable.forEach((item, index) => {
            if (failedIndexes.has(index)) {
                rows.push({ studentId: item.studentId, code: 'CARD_ALREADY_ASSIGNED', message: `Card ${item.cardNumber}: ${cardMessage}` });
            } else {
                stillWritable.push(item);
            }
        });
        writable.length = 0;
        writable.push(...stillWritable);
    }

    if (!writable.length) {
        throw new ConflictError(rows.length === 1 ? rows[0].message : `None of the ${rows.length} cards could be assigned.`, {
            module: MODULE,
            code: rows.every((row) => row.code === 'CARD_ALREADY_ASSIGNED') ? 'CARD_ALREADY_ASSIGNED' : 'BULK_ROWS_FAILED',
            fields: rows.length === 1 && rows[0].code === 'CARD_ALREADY_ASSIGNED'
                ? [{ field: 'cardNumber', code: 'CARD_ALREADY_ASSIGNED', message: rows[0].message }]
                : undefined,
            rows,
        });
    }

    const jobId = await queue().addDeviceSyncJob({
        adminId,
        studentIds: writable.map((item) => item.studentId),
        reason: 'assign',
    });
    // `cards` is the write-back: each saved card, masked the way the table shows it, so the
    // page updates those rows from this response rather than re-GETting the list.
    return res.status(202).json({
        message: messages.cardsQueued(writable.length),
        jobId,
        assigned: writable.length,
        cards: writable.map((item) => ({ studentId: item.studentId, card: item.cardNumber })),
        rows,
    });
};

/** Re-push an EXISTING card to every device (a device was offline or reset). */
let ResyncCard = async (req, res) => {
    const adminId = req.body.adminId;
    const student = await StudentProfileModel.findOne({ _id: req.params.id, adminId }, 'cardNumber').lean();
    if (!student) throw new NotFoundError(messages.studentNotFound(), { module: MODULE });
    if (!student.cardNumber) {
        throw new ValidationError(messages.noCardToResync(), { module: MODULE, fields: [{ field: 'cardNumber', message: messages.noCardToResync() }] });
    }

    const jobId = await queue().addDeviceSyncJob({ adminId, studentIds: [String(student._id)], reason: 'resync' });
    return res.status(202).json({ message: messages.resyncQueued(), jobId });
};

// ---------------------------------------------------------------------------------------
// Excel Import / Export — the one place this page REQUIRES a scope
// ---------------------------------------------------------------------------------------

/** Class (+stream, when the class has streams) is mandatory; anything less is a 400. */
const resolveExcelScope = async (adminId, scope) => {
    const classIndex = await loadClassIndex(adminId);
    const entry = classIndex.get(String(scope.classId));
    if (!entry) {
        throw new ValidationError(messages.classNotConfigured(), { module: MODULE, fields: [{ field: 'classId', message: messages.classNotConfigured() }] });
    }
    if (entry.doc.hasStreams && !scope.streamId) {
        throw new ValidationError(messages.excelNeedsStream(entry.label), { module: MODULE, fields: [{ field: 'streamId', message: messages.excelNeedsStream(entry.label) }] });
    }
    if (scope.streamId && !entry.streams.has(String(scope.streamId))) {
        throw new ValidationError(messages.streamNotInClass(), { module: MODULE, fields: [{ field: 'streamId', message: messages.streamNotInClass() }] });
    }
    return { classIndex, entry };
};

let ExportExcel = async (req, res) => {
    const { adminId, session, classId, streamId } = req.query;
    // "Masked" (default) truncates Aadhar / bank A/C / IFSC / PEN to their last 4; "Full"
    // exports the real values for a bulk-correction round trip and is logged — who, when,
    // which scope (manage-students.md). Masked exports are routine and not logged.
    const full = req.query.mode === 'full';
    const { classIndex, entry } = await resolveExcelScope(adminId, req.query);
    const config = await getStudentFieldConfig(adminId);
    const columns = buildStudentSheetColumns(config, entry.doc.hasStreams);

    const sessionId = await findSessionId(adminId, session);
    const match = buildEnrollmentMatch(adminId, sessionId, { classId, streamId, groupId: req.query.groupId, sectionId: req.query.sectionId });
    // One class(+stream) — hundreds of rows at most, so one aggregation with the full
    // profile is fine here (unlike the paged list, the sheet really does need every field).
    // A session with no record yet exports the header row alone.
    const [enrollments, groups] = await Promise.all([
        !sessionId ? [] : StudentEnrollmentModel.aggregate([
            { $match: match },
            { $sort: { rollNumber: 1, _id: 1 } },
            { $lookup: { from: StudentProfileModel.collection.name, localField: 'studentId', foreignField: '_id', as: 'student' } },
            { $unwind: '$student' },
        ]),
        SubjectGroupModel.find({ adminId, classId: entry.doc._id }, 'name').lean(),
    ]);
    const groupName = new Map(groups.map((group) => [String(group._id), group.name]));

    const rows = enrollments.map((enrollment) => {
        const placement = describePlacement(classIndex, enrollment);
        const row = {
            className: placement.className,
            rollNumber: enrollment.rollNumber,
            sectionName: placement.sectionName || '',
            groupName: groupName.get(String(enrollment.groupId)) || '',
        };
        columns.forEach((column) => {
            if (column.key in row) return;
            let value = enrollment.student[column.key];
            if (column.key === 'admissionClass') {
                // Stored as a class id; the sheet (and a re-import) uses the class label.
                const firstClass = value && classIndex.get(String(value));
                value = firstClass ? firstClass.label : null;
            } else if (!full && SENSITIVE_FIELDS.includes(column.key)) {
                value = maskValue(column.key, value);
            }
            row[column.key] = column.type === 'date' ? formatSheetDate(value) : (value == null ? '' : value);
        });
        return row;
    });

    const stream = streamId ? entry.streams.get(String(streamId)) : null;
    if (full) {
        await logActivity(req, {
            module: MODULE,
            action: 'student.export.full',
            meta: { session, classId, className: entry.label, streamId: streamId || null, streamName: stream ? stream.name : null, rows: rows.length },
        });
    }

    const buffer = await buildWorkbook(columns, rows, 'Students');
    const label = [entry.label, stream && stream.name].filter(Boolean).join('-').replace(/\s+/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="students-${label}-${session}${full ? '-FULL' : ''}.xlsx"`);
    return res.status(200).send(Buffer.from(buffer));
};

/**
 * Import: the sheet is parsed here (cheap, bounded by the 5MB upload limit) so a wrong
 * file is rejected immediately; validating and writing the rows — the slow part — is a
 * background job (manage-students.md, Scale note). 202 + jobId.
 */
let ImportExcel = async (req, res) => {
    const { adminId, session, classId, streamId } = req.body;
    if (!req.file) {
        throw new ValidationError(messages.excelFileRequired(), { module: MODULE, fields: [{ field: 'file', message: messages.excelFileRequired() }] });
    }
    const { entry } = await resolveExcelScope(adminId, req.body);
    const config = await getStudentFieldConfig(adminId);
    const columns = buildStudentSheetColumns(config, entry.doc.hasStreams);

    let parsed;
    try {
        parsed = await parseWorkbook(req.file.buffer, columns);
    } catch (error) {
        throw new ValidationError('That file could not be read as an Excel sheet.', { module: MODULE, fields: [{ field: 'file', message: 'Not a readable .xlsx file' }] });
    }
    // Columns are matched by HEADER TEXT against the current FieldConfig labels, never by
    // position. A required field's column missing rejects the whole file up front.
    if (parsed.missingHeaders.length) {
        const message = `Missing columns: ${parsed.missingHeaders.join(', ')}. Export a sheet first to get the right headers.`;
        throw new ValidationError(message, { module: MODULE, code: 'COLUMNS_MISSING', fields: [{ field: 'file', code: 'COLUMNS_MISSING', message }] });
    }
    if (parsed.rows.length === 0) {
        throw new ValidationError(messages.excelEmpty(), { module: MODULE, fields: [{ field: 'file', message: messages.excelEmpty() }] });
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
        const message = `A sheet can hold at most ${MAX_IMPORT_ROWS} students.`;
        throw new ValidationError(message, { module: MODULE, fields: [{ field: 'file', message }] });
    }

    // Dates become strings for the queue payload; the worker's validator parses them back.
    const rows = parsed.rows.map(({ rowNumber, values }) => ({
        rowNumber,
        values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])),
    }));

    // The session travels to the worker as its REFERENCE (created on first use); the label
    // rides along only for the job's dedup key and messages.
    const sessionId = await ensureSessionId(adminId, session);
    const jobId = await queue().addImportJob({
        adminId,
        session,
        sessionId: String(sessionId),
        placement: { classId: String(classId), class: entry.doc.class, streamId: streamId ? String(streamId) : null },
        rows,
    }, req.file.buffer);

    // Headers matching no field are ignored — and said so ONCE for the file, not per row.
    const warning = parsed.unrecognizedHeaders.length
        ? {
            code: 'COLUMNS_UNRECOGNIZED',
            message: `These columns weren't recognised and were ignored: ${parsed.unrecognizedHeaders.join(', ')}.`,
            headers: parsed.unrecognizedHeaders,
        }
        : null;
    return res.status(202).json({ message: messages.importQueued(), jobId, warning });
};

// ---------------------------------------------------------------------------------------
// Background job status — polled by Excel import, Assign Card and Class Promotion
// ---------------------------------------------------------------------------------------

let GetJobStatus = async (req, res) => {
    const job = await queue().studentQueue.getJob(req.params.jobId);
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
        // The internal reason is logged by the worker; the client gets a stable sentence.
        error: state === 'failed' ? 'The job could not be completed. Please try again.' : null,
    });
};

module.exports = {
    ListStudents,
    GetOverview,
    GetStudent,
    RevealStudentField,
    GetFieldConfig,
    GetFilterOptions,
    CreateStudent,
    UpdateStudent,
    DeleteStudent,
    BulkDeleteStudents,
    AssignCards,
    ResyncCard,
    ExportExcel,
    ImportExcel,
    GetJobStatus,
};
