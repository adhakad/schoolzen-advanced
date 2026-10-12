'use strict';
const mongoose = require('mongoose');

// One student's generated admit card for one Admit Card Structure. Written ONLY by the
// examination worker (generate-admit-card.md: no configuration lives on that page).
//
// The student details and the resolved schedule are SNAPSHOTTED at generation time
// (errors.md retroactive-change note) — rendering never reads the live structure, so a card
// already printed shows exactly what it showed then until the structure is saved again.
const AdmitCardSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-academic-session', required: true },
    structureId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-admit-card-structure', required: true },
    structureVersion: { type: Number, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-student', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, required: true },
    streamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sectionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    examName: { type: String, required: true },
    student: {
        name: { type: String, default: null },
        dob: { type: Date, default: null },
        motherName: { type: String, default: null },
        fatherName: { type: String, default: null },
        className: { type: String, default: null },
        streamName: { type: String, default: null },
        sectionName: { type: String, default: null },
        rollNumber: { type: Number, default: null },
    },
    schedule: [{
        _id: false,
        subjectName: { type: String, required: true },
        examDate: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
    }],
    generatedAt: { type: Date, default: Date.now },
});

// One card per student per structure — what makes a retried generation job idempotent
// (upsert onto this key, never a second card).
AdmitCardSchema.index({ structureId: 1, studentId: 1 }, { unique: true });
// Generate Admit Card's per-page join: the page's students' cards in one $in.
AdmitCardSchema.index({ adminId: 1, sessionId: 1, studentId: 1 });

const AdmitCardModel = mongoose.model('v2-admit-card', AdmitCardSchema);

module.exports = AdmitCardModel;
