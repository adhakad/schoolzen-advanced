'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/student.messages');
const { getStudentFieldConfig, OPTIONS } = require('../../validators/student/field-config.validator');
const { buildWorkbook, parseWorkbook } = require('../../services/excel/excel.service');
const { destroyImages } = require('../../services/media/cloudinary.service');
const { buildStudentSheetColumns, formatSheetDate } = require('../../helpers/student/student-excel');
const { createStudentRecord, updateStudentRecord } = require('../../helpers/student/student-write');
const {
    MODULE, maskCard, toObjectId, loadClassIndex, describePlacement, buildEnrollmentMatch,
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
    const [totalStudents, cardsAssigned] = await Promise.all([
        StudentEnrollmentModel.countDocuments({ adminId, session }),
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

    const enrollment = req.query.session
        ? await StudentEnrollmentModel.findOne({ adminId, studentId: student._id, session: req.query.session }).lean()
        : await StudentEnrollmentModel.findOne({ adminId, studentId: student._id }).sort({ session: -1 }).lean();

    let placement = null;
    if (enrollment) {
        const [classIndex, group] = await Promise.all([
            loadClassIndex(adminId),
            enrollment.groupId ? SubjectGroupModel.findOne({ _id: enrollment.groupId, adminId }, 'name').lean() : null,
        ]);
        const described = describePlacement(classIndex, enrollment);
        placement = {
            enrollmentId: String(enrollment._id),
            session: enrollment.session,
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

    // The full card number is only ever needed by the Assign Card modal's "change" flow;
    // the profile ships the masked form like the table does.
    student.card = maskCard(student.cardNumber);
    delete student.cardNumber;

    return res.status(200).json({ student, placement });
};

/**
 * Everything the Class → Stream → Group → Section cascade filter needs, in ONE response —
 * the school's classes with their streams and sections, and every subject group keyed by
 * class/stream. Shared by all three Student pages and the Student form, so none of them
 * stitches Academic Setup's separate endpoints together in the browser.
 */
let GetFilterOptions = async (req, res) => {
    const adminId = req.query.adminId;
    const [classIndex, groups] = await Promise.all([
        loadClassIndex(adminId),
        SubjectGroupModel.find({ adminId }, 'name classId streamId').sort({ name: 1 }).lean(),
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
    const fields = await getStudentFieldConfig(req.query.adminId);
    return res.status(200).json({ fields, options: OPTIONS });
};

// ---------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------

// `warning` is set when the record saved but its photo didn't (IMAGE_UPLOAD_FAILED) — a
// 200 with a warning, never a 500 for a student that actually exists.
let CreateStudent = async (req, res) => {
    const { id, warning } = await createStudentRecord({
        adminId: req.adminId,
        body: req.body,
        file: req.file,
        entryType: 'manual',
    });
    return res.status(200).json({ message: success.created('Student'), id, warning });
};

let UpdateStudent = async (req, res) => {
    const { warning } = await updateStudentRecord({
        adminId: req.adminId,
        studentId: req.params.id,
        body: req.body,
        file: req.file,
    });
    return res.status(200).json({ message: success.updated('Student'), warning });
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
    return res.status(202).json({ message: messages.cardsQueued(writable.length), jobId, assigned: writable.length, rows });
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
    const { classIndex, entry } = await resolveExcelScope(adminId, req.query);
    const config = await getStudentFieldConfig(adminId);
    const columns = buildStudentSheetColumns(config, entry.doc.hasStreams);

    const match = buildEnrollmentMatch(adminId, session, { classId, streamId, groupId: req.query.groupId, sectionId: req.query.sectionId });
    // One class(+stream) — hundreds of rows at most, so one aggregation with the full
    // profile is fine here (unlike the paged list, the sheet really does need every field).
    const [enrollments, groups] = await Promise.all([
        StudentEnrollmentModel.aggregate([
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
            const value = enrollment.student[column.key];
            row[column.key] = column.type === 'date' ? formatSheetDate(value) : (value == null ? '' : value);
        });
        return row;
    });

    const buffer = await buildWorkbook(columns, rows, 'Students');
    const stream = streamId ? entry.streams.get(String(streamId)) : null;
    const label = [entry.label, stream && stream.name].filter(Boolean).join('-').replace(/\s+/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="students-${label}-${session}.xlsx"`);
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
    if (parsed.missingHeaders.length) {
        const message = `Missing columns: ${parsed.missingHeaders.join(', ')}. Export a sheet first to get the right headers.`;
        throw new ValidationError(message, { module: MODULE, fields: [{ field: 'file', message }] });
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

    const jobId = await queue().addImportJob({
        adminId,
        session,
        placement: { classId: String(classId), class: entry.doc.class, streamId: streamId ? String(streamId) : null },
        rows,
    }, req.file.buffer);

    return res.status(202).json({ message: messages.importQueued(), jobId });
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
