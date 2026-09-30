'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const { resolveFeeStructure } = require('../fees/fee-structure-resolver');
const { CONCESSION_REASON_THRESHOLD } = require('./student.constants');
const { ValidationError, NotFoundError, ConflictError } = require('../../errors');
const { getStudentFieldConfig, validateStudentRecord } = require('../../validators/student/field-config.validator');
const { uploadImageBuffer, destroyImages } = require('../../services/media/cloudinary.service');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const messages = require('../messages/student.messages');
const { MODULE, resolvePlacement, withTransaction, toObjectId, rethrowAsDuplicate, loadListRow, loadClassIndex } = require('./student.utils');
const { ensureSessionId, findSessionId } = require('../academic-session/session-resolver');
const logger = require('../logger');
const { isValidSession, SESSION_EXAMPLE } = require('../academic-session-format');

/**
 * Academic Setup's Students-Enrolled stat counts enrollments, so any enrollment create or
 * delete invalidates it in the same request (academic-setup/optimization.md: the one
 * cross-module invalidation that module accepts from outside).
 */
const invalidateClassStats = (adminId) => cacheService.del(cacheKeys.academicSetup.classStats(adminId));

// The student write paths, shared by Manage Students (Create/Update) and Admission
// (New Admission) — one implementation, so both forms create exactly the same documents.

// Profile fields that are really enrollment fields.
const ENROLLMENT_FIELDS = ['rollNumber'];

const splitProfile = (value) => {
    const profile = { ...value };
    const enrollment = {};
    ENROLLMENT_FIELDS.forEach((key) => {
        if (key in profile) {
            enrollment[key] = profile[key];
            delete profile[key];
        }
    });
    return { profile, enrollment };
};

const failFields = (fields) => {
    throw new ValidationError('Please fix the highlighted fields', { module: MODULE, fields });
};

/**
 * First Enrolled Class must be one of THIS school's Academic Setup classes (the validator
 * only checked the id's shape). Returns the ObjectId, or null for blank.
 */
const resolveAdmissionClass = (classIndex, value) => {
    if (value == null) return null;
    if (!classIndex.has(String(value))) {
        failFields([{ field: 'admissionClass', message: messages.classNotConfigured() }]);
    }
    return toObjectId(value);
};

/**
 * Admission-time fee (student-fix4.md E; student/errors.md "Admission-time fee &
 * concession"). With a FeeStructure for this class/session: its admission fee and total are
 * used — never a typed amount — the concession is bounded by the total, a concession above
 * the threshold needs a reason, and the first StudentFeeRecord is prepared for the SAME
 * transaction as the student. Without one (the Fees module isn't built yet, so today most
 * schools have none): the admission still goes through, with a FEE_STRUCTURE_MISSING
 * warning and no fee record — a soft gate until Fee Structures exist.
 *
 * @returns {Promise<{ record: Object|null, warning: Object|null }>}
 */
const planAdmissionFee = async ({ adminId, sessionId, sessionLabel, placement, profile, body }) => {
    const fee = await resolveFeeStructure(adminId, sessionId, placement);
    if (!fee) {
        return { record: null, warning: { code: 'FEE_STRUCTURE_MISSING', message: messages.feeStructureMissing(sessionLabel) } };
    }
    const concession = profile.feesConcession || 0;
    if (concession > fee.totalFee) {
        failFields([{ field: 'feesConcession', code: 'CONCESSION_EXCEEDS_FEE', message: messages.concessionExceedsFee(fee.totalFee) }]);
    }
    const reason = String(body.concessionReason || '').trim().slice(0, 300);
    if (concession > fee.totalFee * CONCESSION_REASON_THRESHOLD && reason.length < 3) {
        failFields([{ field: 'concessionReason', code: 'CONCESSION_REASON_REQUIRED',
            message: messages.concessionReasonRequired(Math.round(CONCESSION_REASON_THRESHOLD * 100)) }]);
    }
    // The Student keeps a write-once snapshot; the fee record is the ledger from here on.
    profile.admissionFee = fee.admissionFee;
    profile.feesConcession = concession;
    return {
        record: {
            adminId,
            sessionId,
            feeStructureId: fee.structure._id,
            admissionFee: fee.admissionFee,
            totalFee: fee.totalFee,
            concession,
            concessionReason: reason || null,
        },
        warning: null,
    };
};

/** Custom-field values as dotted paths, so an update sets one without wiping the rest. */
const flattenExtraFields = (profile) => {
    if (!profile.extraFields) return profile;
    const { extraFields, ...rest } = profile;
    Object.entries(extraFields).forEach(([key, value]) => { rest[`extraFields.${key}`] = value; });
    return rest;
};

// Multipart bodies skip the Joi request schemas, so the session label is checked here —
// a session is a join key, and a second spelling of one year would split its data.
const assertSession = (session) => {
    if (!isValidSession(session)) failFields([{ field: 'session', message: `Session must look like ${SESSION_EXAMPLE}` }]);
};

/**
 * Upload a photo AFTER the record has committed. An external call can't be rolled back, so
 * it never runs inside the transaction — and a failed upload must not turn a saved student
 * into a 500: the record stands, and the caller gets the IMAGE_UPLOAD_FAILED warning to show
 * (student/errors.md, shape #8).
 * @returns {Promise<{code:String,message:String}|null>} a warning, or null on success
 */
const attachPhoto = async (adminId, studentId, file, previousPublicId) => {
    if (!file || !file.buffer) return null;
    try {
        // Straight from memory to Cloudinary — no local temp folder (student-fix3.md).
        const photo = await uploadImageBuffer(file.buffer, adminId, 'students');
        await StudentProfileModel.updateOne({ _id: studentId, adminId }, { $set: { photoUrl: photo.url, photoPublicId: photo.publicId } });
        if (previousPublicId) destroyImages([previousPublicId]);
        return null;
    } catch (error) {
        logger.warn('student.photoUploadFailed', { adminId, studentId: String(studentId), reason: error.message });
        return { code: 'IMAGE_UPLOAD_FAILED', message: messages.imageUploadFailed() };
    }
};

// Today at UTC midnight — the date-only value `doa` is stored as.
const todayUtc = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

/**
 * Create a Student and its enrollment for `session` in one transaction.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {Object} args.body       raw form body (profile fields + session + placement ids)
 * @param {Object} [args.file]     Multer photo file
 * @param {String} args.entryType  'admission' (Admission page) or 'manual' (Manage Students)
 * @returns {Promise<{ id: String, row: Object, warnings: Object[] }>} the new student's id,
 *          the fresh list row (module-optimization-guide.md §2: a mutation returns the fresh
 *          document, so the page never re-GETs its own change), and any save-with-a-caveat
 *          warnings (photo didn't upload; no fee structure yet)
 */
const createStudentRecord = async ({ adminId, body, file, entryType }) => {
    assertSession(body.session);
    // The admission's session is a REFERENCE on the enrollment — never a label on Student.
    const sessionId = await ensureSessionId(adminId, body.session);
    const config = await getStudentFieldConfig(adminId);
    const { value, errors } = validateStudentRecord(body, config);
    if (errors.length) failFields(errors);

    const classIndex = await loadClassIndex(adminId);
    const placement = await resolvePlacement(adminId, body, { classIndex });
    const { profile, enrollment } = splitProfile(value);
    // A new admission's date is today unless the form gave a real one — never left empty
    // for the letter/records to guess at (legacy 'new' admission behaviour, errors.md).
    if (profile.doa == null) profile.doa = todayUtc();
    // First Enrolled Class defaults to the class being enrolled into — the Admission form
    // doesn't ask for it, and "Class" and "First Enrolled Class" must never disagree.
    profile.admissionClass = resolveAdmissionClass(classIndex, profile.admissionClass) || placement.classId;
    const fee = await planAdmissionFee({ adminId, sessionId, sessionLabel: body.session, placement, profile, body });

    const { studentId, enrollmentId } = await withTransaction(async (dbSession) => {
        const [student] = await StudentProfileModel.create([{
            ...profile,
            adminId,
            // No Admission No. yet = Pending; the letter can't print until one is issued.
            status: profile.admissionNo != null ? 'admitted' : 'pending',
        }], { session: dbSession });

        // The student's FIRST enrollment — carrying the session, class, stream and section —
        // in the same transaction as the profile: never a student without a placement.
        const [enrollmentDoc] = await StudentEnrollmentModel.create([{
            adminId,
            studentId: student._id,
            sessionId,
            classId: placement.classId,
            class: placement.class,
            streamId: placement.streamId,
            groupId: placement.groupId,
            sectionId: placement.sectionId,
            rollNumber: enrollment.rollNumber != null ? enrollment.rollNumber : null,
            entryType,
        }], { session: dbSession });

        // The first fee ledger entry — same transaction: never a student whose admission
        // concession was fixed without its fee record, or the reverse.
        if (fee.record) {
            await StudentFeeRecordModel.create([{ ...fee.record, studentId: student._id }], { session: dbSession });
        }

        return { studentId: student._id, enrollmentId: enrollmentDoc._id };
    }).catch(rethrowAsDuplicate);

    await invalidateClassStats(adminId);
    const photoWarning = await attachPhoto(adminId, studentId, file, null);
    const row = await loadListRow(adminId, enrollmentId, body.session);
    return { id: String(studentId), row, warnings: [fee.warning, photoWarning].filter(Boolean) };
};

/**
 * Update a student's profile and their placement details for `session`.
 *
 * Rules the reference form encodes, enforced here too so the API can't skip them:
 *   - Admission No. can be ISSUED (null → number, which admits the student) but never
 *     changed once issued.
 *   - Class and stream are fixed for an enrollment (Class Promotion moves students);
 *     Stream/Group can only be filled in while a promotion into a streamed class left them
 *     unset (placementIncomplete).
 *   - Section and Roll Number are editable.
 */
const updateStudentRecord = async ({ adminId, studentId, body, file }) => {
    const student = await StudentProfileModel.findOne({ _id: studentId, adminId });
    if (!student) throw new NotFoundError(messages.studentNotFound(), { module: MODULE, context: { studentId } });

    const config = await getStudentFieldConfig(adminId);
    // An Aadhar re-sent exactly as stored isn't re-checked: a record saved before the
    // checksum rule must stay editable; only a NEW value has to be a valid Aadhar.
    const input = { ...body };
    if (input.aadharNumber != null && student.aadharNumber
        && String(input.aadharNumber).replace(/[\s-]/g, '') === student.aadharNumber) delete input.aadharNumber;
    const { value, errors } = validateStudentRecord(input, config, { partial: true });
    if (errors.length) failFields(errors);
    const { profile: parsedProfile, enrollment: enrollmentValues } = splitProfile(value);
    if ('admissionClass' in parsedProfile) {
        parsedProfile.admissionClass = resolveAdmissionClass(await loadClassIndex(adminId), parsedProfile.admissionClass);
    }
    const profile = flattenExtraFields(parsedProfile);

    // Once a fee record exists, admission fee and concession are Fees-module truth: the
    // Student snapshot can't be edited to change what the student owes.
    const feeChanges = ['admissionFee', 'feesConcession']
        .filter((key) => key in profile && Number(profile[key] || 0) !== Number(student[key] || 0));
    if (feeChanges.length && await StudentFeeRecordModel.exists({ adminId, studentId: student._id })) {
        failFields(feeChanges.map((field) => ({ field, code: 'FEES_MANAGED_IN_FEES', message: messages.feesManagedInFees() })));
    }

    if ('admissionNo' in profile) {
        if (student.admissionNo != null && profile.admissionNo !== student.admissionNo) {
            failFields([{ field: 'admissionNo', message: messages.admissionNoLocked() }]);
        }
        if (student.admissionNo == null && profile.admissionNo != null) profile.status = 'admitted';
        if (profile.admissionNo == null) delete profile.admissionNo;
    }

    const sessionId = body.session ? await findSessionId(adminId, body.session) : null;
    const enrollment = sessionId
        ? await StudentEnrollmentModel.findOne({ adminId, studentId: student._id, sessionId })
        : null;
    const enrollmentSet = {};
    if (enrollment) {
        if ('rollNumber' in enrollmentValues) enrollmentSet.rollNumber = enrollmentValues.rollNumber;

        const wantsStream = body.streamId !== undefined && String(body.streamId || '') !== String(enrollment.streamId || '');
        const wantsGroup = body.groupId !== undefined && String(body.groupId || '') !== String(enrollment.groupId || '');
        if ((wantsStream || wantsGroup) && !enrollment.placementIncomplete) {
            failFields([{ field: wantsStream ? 'streamId' : 'groupId', message: messages.placementLocked() }]);
        }

        if (wantsStream || wantsGroup || body.sectionId !== undefined) {
            // Re-check the whole placement against Academic Setup; class never changes here.
            const placement = await resolvePlacement(adminId, {
                classId: enrollment.classId,
                streamId: body.streamId !== undefined ? body.streamId : enrollment.streamId,
                groupId: body.groupId !== undefined ? body.groupId : enrollment.groupId,
                sectionId: body.sectionId !== undefined ? body.sectionId : enrollment.sectionId,
            }, { allowIncomplete: enrollment.placementIncomplete });
            enrollmentSet.streamId = placement.streamId;
            enrollmentSet.groupId = placement.groupId;
            enrollmentSet.sectionId = placement.sectionId;
            enrollmentSet.placementIncomplete = placement.placementIncomplete;
        }
    }

    await withTransaction(async (dbSession) => {
        if (Object.keys(profile).length) {
            await StudentProfileModel.updateOne({ _id: student._id }, { $set: profile }, { session: dbSession });
        }
        if (enrollment && Object.keys(enrollmentSet).length) {
            enrollmentSet.updatedAt = new Date();
            await StudentEnrollmentModel.updateOne({ _id: enrollment._id }, { $set: enrollmentSet }, { session: dbSession });
        }
    }).catch(rethrowAsDuplicate);

    // Returns the fresh row (when the student is placed in this session) + any photo warning.
    const photoWarning = await attachPhoto(adminId, student._id, file, student.photoPublicId);
    const row = enrollment ? await loadListRow(adminId, enrollment._id, body.session) : null;
    return { row, warnings: [photoWarning].filter(Boolean) };
};

/** Throws a ConflictError naming the first card already held by a student NOT in the set. */
const assertCardsFree = async (adminId, items) => {
    const taken = await StudentProfileModel.findOne({
        adminId,
        cardNumber: { $in: items.map((item) => item.cardNumber) },
        _id: { $nin: items.map((item) => toObjectId(item.studentId)) },
    }, 'cardNumber').lean();
    if (taken) {
        const message = `Card ${taken.cardNumber}: ${messages.duplicate.CARD_ALREADY_ASSIGNED()}`;
        throw new ConflictError(message, {
            module: MODULE,
            code: 'CARD_ALREADY_ASSIGNED',
            fields: [{ field: 'cardNumber', code: 'CARD_ALREADY_ASSIGNED', message }],
            context: { cardNumber: taken.cardNumber },
        });
    }
};

module.exports = {
    createStudentRecord,
    updateStudentRecord,
    assertCardsFree,
    invalidateClassStats,
};
