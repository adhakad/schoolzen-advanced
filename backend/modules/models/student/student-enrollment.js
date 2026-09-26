'use strict';
const mongoose = require('mongoose');

// Where a student sits in ONE academic session: class, stream, subject group, section and
// roll number. One document per (student, session).
//
// This is the placement half of the Student/Enrollment split (see ./student.js). A
// student's class is never a flat field on the profile because it changes every year:
// Class Promotion creates the NEXT session's enrollment and leaves this session's exactly
// as it was (class-promotion.md), so last year's class lists, fee records and results stay
// correct forever.
//
// classId/streamId/sectionId point at the Academic Setup class document and the _ids of
// its stream/section sub-documents; groupId at an academic-subject-group. `class` (the
// number) is a denormalized copy — the display label and the join key every class-keyed
// collection in the app uses — and never drifts because a configured class's number is its
// identity (UpdateClass cannot change it).
const EnrollmentSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-student', required: true },
    session: { type: String, required: true, trim: true },

    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'academic-class', required: true },
    class: { type: Number, required: true },
    streamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'academic-subject-group', default: null },
    sectionId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // Cleared on promotion — assigned fresh in the new class via Manage Students.
    rollNumber: { type: Number, default: null },

    // How this placement came to exist. The Admission page lists `admission` rows only.
    entryType: {
        type: String,
        enum: ['admission', 'promotion', 'detained', 'import', 'migration', 'manual'],
        required: true,
    },

    // A promotion into a streamed class (11th/12th) with no Stream + Subject Group chosen
    // yet. The confirm modal warns about these; Manage Students' edit form unlocks
    // Stream/Group only while this is set.
    placementIncomplete: { type: Boolean, default: false },

    // The enrollment this one was promoted/detained from, and the promotion chunk that
    // wrote it — the retry-safety key for the promotion worker.
    sourceEnrollmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    promotionJobKey: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// One placement per student per session. This is what makes a retried promotion chunk
// collide instead of double-enrolling.
EnrollmentSchema.index({ adminId: 1, studentId: 1, session: 1 }, { unique: true });

// Backs Manage Students / Admission / Class Promotion's cascade filter directly, in ESR
// order (equality fields, then _id as the keyset-pagination sort) — the list query is an
// index range scan at any depth, never .skip(N) (performance-principles.md).
EnrollmentSchema.index({ adminId: 1, session: 1, classId: 1, streamId: 1, groupId: 1, sectionId: 1, _id: 1 });

// The Admission page's own list: this session's admission-type rows, newest paging by _id.
EnrollmentSchema.index({ adminId: 1, session: 1, entryType: 1, _id: 1 });

// A roll number is unique inside one section of one class in one session. Partial, because
// null ("not assigned yet") is the normal state right after a promotion.
EnrollmentSchema.index(
    { adminId: 1, session: 1, classId: 1, streamId: 1, sectionId: 1, rollNumber: 1 },
    { unique: true, partialFilterExpression: { rollNumber: { $type: 'number' } } }
);

const StudentEnrollmentModel = mongoose.model('student-enrollment', EnrollmentSchema);

module.exports = StudentEnrollmentModel;
