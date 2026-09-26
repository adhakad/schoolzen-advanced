'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const { NotFoundError, ConflictError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/student.messages');
const { buildLetterheadDocument } = require('../../services/pdf/letterhead.service');
const { createStudentRecord } = require('../../helpers/student/student-write');
const {
    MODULE, listStudentRows, loadClassIndex, describePlacement,
} = require('../../helpers/student/student.utils');

// Admission — new students entering the school this session (admission.md).
//
// An admission IS a Student at an early lifecycle stage plus an enrollment whose entryType
// is 'admission'. There is no separate admission collection: issuing the Admission No.
// (on Manage Students' edit form) is what moves it from Pending to Admitted.

let ListAdmissions = async (req, res) => {
    const result = await listStudentRows({
        adminId: req.query.adminId,
        query: req.query,
        extraMatch: { entryType: 'admission' },
    });
    return res.status(200).json(result);
};

// "This Session" side card — Admitted / Pending, one grouped aggregation.
let GetAdmissionOverview = async (req, res) => {
    const { adminId, session } = req.query;
    const groups = await StudentEnrollmentModel.aggregate([
        { $match: { adminId, session, entryType: 'admission' } },
        { $lookup: { from: StudentProfileModel.collection.name, localField: 'studentId', foreignField: '_id', as: 'student' } },
        { $unwind: '$student' },
        { $group: { _id: '$student.status', count: { $sum: 1 } } },
    ]);
    const byStatus = Object.fromEntries(groups.map((group) => [group._id, group.count]));
    return res.status(200).json({ admitted: byStatus.admitted || 0, pending: byStatus.pending || 0 });
};

let CreateAdmission = async (req, res) => {
    const id = await createStudentRecord({
        adminId: req.body.adminId,
        body: req.body,
        file: req.file,
        entryType: 'admission',
    });
    return res.status(200).json({ message: success.created('Admission'), id });
};

const formatDate = (date) => (date
    ? new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null);

/**
 * The Admission Letter — built by the SHARED letterhead service, the same one Fee Receipt,
 * Admit Card, Marksheet and TC use. This handler only supplies the document's own title,
 * fields and closing note.
 */
let GetAdmissionLetter = async (req, res) => {
    const adminId = req.query.adminId;
    const student = await StudentProfileModel.findOne({ _id: req.params.id, adminId }).lean();
    if (!student) throw new NotFoundError(messages.studentNotFound(), { module: MODULE, context: { id: req.params.id } });
    if (student.status !== 'admitted' || student.admissionNo == null) {
        throw new ConflictError(messages.letterNotReady(), { module: MODULE, context: { id: req.params.id } });
    }

    const enrollment = await StudentEnrollmentModel
        .findOne({ adminId, studentId: student._id, session: student.admissionSession })
        .lean();
    const placement = enrollment ? describePlacement(await loadClassIndex(adminId), enrollment) : null;
    const session = student.admissionSession;

    const document = await buildLetterheadDocument({
        adminId,
        title: 'CERTIFICATE OF ADMISSION',
        subtitle: `Academic Session ${session}`,
        sectionLabel: 'Admission Details',
        fields: [
            { label: 'Admission No.', value: student.admissionNo },
            { label: 'Roll Number', value: enrollment ? enrollment.rollNumber : null },
            { label: 'Class', value: placement ? placement.tag : null },
            { label: 'Student Name', value: student.name },
            { label: "Father's Name", value: student.fatherName },
            { label: 'Date of Admission', value: formatDate(student.doa || student.createdAt) },
        ],
        note: (schoolName) =>
            `This is to certify that the above-named student has been admitted to ${schoolName} ` +
            `for the academic session ${session}. This letter serves as proof of admission for all official purposes.`,
    });

    return res.status(200).json(document);
};

module.exports = {
    ListAdmissions,
    GetAdmissionOverview,
    CreateAdmission,
    GetAdmissionLetter,
};
