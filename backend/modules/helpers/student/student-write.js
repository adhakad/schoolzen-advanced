'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { ValidationError, NotFoundError, ConflictError } = require('../../errors');
const { getStudentFieldConfig, validateStudentRecord } = require('../../validators/student/field-config.validator');
const { uploadImage, destroyImages } = require('../../services/media/cloudinary.service');
const messages = require('../messages/student.messages');
const { MODULE, resolvePlacement, withTransaction, toObjectId, rethrowAsDuplicate } = require('./student.utils');
const logger = require('../logger');
const { isValidSession, SESSION_EXAMPLE } = require('../academic-session-format');

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
    if (!file || !file.path) return null;
    try {
        const photo = await uploadImage(file.path, adminId, 'students');
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
 * @returns {Promise<{ id: String, warning: Object|null }>} the new student's id, plus the
 *          photo-upload warning when the record saved but its photo didn't
 */
const createStudentRecord = async ({ adminId, body, file, entryType }) => {
    assertSession(body.session);
    const config = await getStudentFieldConfig(adminId);
    const { value, errors } = validateStudentRecord(body, config);
    if (errors.length) failFields(errors);

    const placement = await resolvePlacement(adminId, body);
    const { profile, enrollment } = splitProfile(value);
    // A new admission's date is today unless the form gave a real one — never left empty
    // for the letter/records to guess at (legacy 'new' admission behaviour, errors.md).
    if (profile.doa == null) profile.doa = todayUtc();

    const studentId = await withTransaction(async (dbSession) => {
        const [student] = await StudentProfileModel.create([{
            ...profile,
            adminId,
            admissionSession: body.session,
            // No Admission No. yet = Pending; the letter can't print until one is issued.
            status: profile.admissionNo != null ? 'admitted' : 'pending',
        }], { session: dbSession });

        await StudentEnrollmentModel.create([{
            adminId,
            studentId: student._id,
            session: body.session,
            classId: placement.classId,
            class: placement.class,
            streamId: placement.streamId,
            groupId: placement.groupId,
            sectionId: placement.sectionId,
            rollNumber: enrollment.rollNumber != null ? enrollment.rollNumber : null,
            entryType,
        }], { session: dbSession });

        return student._id;
    }).catch(rethrowAsDuplicate);

    const warning = await attachPhoto(adminId, studentId, file, null);
    return { id: String(studentId), warning };
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
    const { value, errors } = validateStudentRecord(body, config, { partial: true });
    if (errors.length) failFields(errors);
    const { profile, enrollment: enrollmentValues } = splitProfile(value);

    if ('admissionNo' in profile) {
        if (student.admissionNo != null && profile.admissionNo !== student.admissionNo) {
            failFields([{ field: 'admissionNo', message: messages.admissionNoLocked() }]);
        }
        if (student.admissionNo == null && profile.admissionNo != null) profile.status = 'admitted';
        if (profile.admissionNo == null) delete profile.admissionNo;
    }

    const enrollment = body.session
        ? await StudentEnrollmentModel.findOne({ adminId, studentId: student._id, session: body.session })
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

    // @returns {Promise<{ warning: Object|null }>}
    const warning = await attachPhoto(adminId, student._id, file, student.photoPublicId);
    return { warning };
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
};
