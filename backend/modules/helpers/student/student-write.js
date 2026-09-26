'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { ValidationError, NotFoundError, ConflictError } = require('../../errors');
const { getStudentFieldConfig, validateStudentRecord } = require('../../validators/student/field-config.validator');
const { uploadImage, destroyImages } = require('../../services/media/cloudinary.service');
const messages = require('../messages/student.messages');
const { MODULE, resolvePlacement, withTransaction, toObjectId } = require('./student.utils');

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

// Roll No. and Admission No. collide on real unique indexes; name the field that did.
const rethrowDuplicate = (error) => {
    if (error && error.code === 11000) {
        const key = Object.keys(error.keyPattern || {});
        if (key.includes('rollNumber')) failFields([{ field: 'rollNumber', message: 'This roll number is already taken in this class/section' }]);
        if (key.includes('admissionNo')) failFields([{ field: 'admissionNo', message: 'This admission number is already in use' }]);
    }
    throw error;
};

/**
 * Create a Student and its enrollment for `session` in one transaction.
 *
 * @param {Object} args
 * @param {String} args.adminId
 * @param {Object} args.body       raw form body (profile fields + session + placement ids)
 * @param {Object} [args.file]     Multer photo file
 * @param {String} args.entryType  'admission' (Admission page) or 'manual' (Manage Students)
 * @returns {Promise<String>} the new student's id
 */
const createStudentRecord = async ({ adminId, body, file, entryType }) => {
    const config = await getStudentFieldConfig(adminId);
    const { value, errors } = validateStudentRecord(body, config);
    if (errors.length) failFields(errors);

    const placement = await resolvePlacement(adminId, body);
    const { profile, enrollment } = splitProfile(value);

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
    }).catch(rethrowDuplicate);

    // After commit: an external upload can't be rolled back, so it never runs inside the
    // transaction. A failed upload leaves a student without a photo, never a half-student.
    if (file && file.path) {
        const photo = await uploadImage(file.path, adminId, 'students');
        await StudentProfileModel.updateOne({ _id: studentId }, { $set: { photoUrl: photo.url, photoPublicId: photo.publicId } });
    }

    return String(studentId);
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
    }).catch(rethrowDuplicate);

    if (file && file.path) {
        const photo = await uploadImage(file.path, adminId, 'students');
        await StudentProfileModel.updateOne({ _id: student._id }, { $set: { photoUrl: photo.url, photoPublicId: photo.publicId } });
        if (student.photoPublicId) destroyImages([student.photoPublicId]);
    }
};

/** Throws a ConflictError naming the first card already held by a student NOT in the set. */
const assertCardsFree = async (adminId, items) => {
    const taken = await StudentProfileModel.findOne({
        adminId,
        cardNumber: { $in: items.map((item) => item.cardNumber) },
        _id: { $nin: items.map((item) => toObjectId(item.studentId)) },
    }, 'cardNumber').lean();
    if (taken) throw new ConflictError(messages.cardInUse(taken.cardNumber), { module: MODULE, context: { cardNumber: taken.cardNumber } });
};

module.exports = {
    createStudentRecord,
    updateStudentRecord,
    assertCardsFree,
};
