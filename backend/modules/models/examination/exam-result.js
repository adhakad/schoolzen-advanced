'use strict';
const mongoose = require('mongoose');

// One student's marks for one term of one session — the RESULTS model (generate-marksheet.md).
//
// Everything a printed marksheet shows is SNAPSHOTTED here at save time (subject names,
// maxes, totals, grade, pass/fail): a later Marksheet Structure edit or subject rename never
// changes a result already handed to a family (errors.md, retroactive-change note).
//
// `isAnnual` marks the template's LAST term (e.g. "Final Exam") — Certificates' "Last
// Annual Exam & Result" reads it through helpers/examination/result-lookup.js.
const ExamResultSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-academic-session', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-student', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, required: true },
    class: { type: Number, required: true },
    streamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    structureId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-marksheet-structure', required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-marksheet-template', required: true },
    templateCode: { type: String, default: null },
    term: { type: String, required: true, trim: true },
    isAnnual: { type: Boolean, default: false },
    // Snapshot labels for the printed sheet.
    className: { type: String, default: null },
    streamName: { type: String, default: null },
    subjects: [{
        _id: false,
        subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        theoryMax: { type: Number, default: null },
        practicalMax: { type: Number, default: null },
        theory: { type: Number, default: null },
        practical: { type: Number, default: null },
        total: { type: Number, default: 0 },
        grade: { type: String, default: null },
    }],
    coScholastic: [{ _id: false, area: { type: String, required: true }, grade: { type: String, required: true } }],
    totals: {
        obtained: { type: Number, default: 0 },
        max: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
        grade: { type: String, default: null },
        result: { type: String, enum: ['Pass', 'Fail'], default: 'Fail' },
    },
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// One result per student per term per session — the guard behind MARKS_ALREADY_ENTERED.
ExamResultSchema.index({ adminId: 1, sessionId: 1, studentId: 1, term: 1 }, { unique: true });
// Generate Marksheet's per-class status lookup + Marksheet Structure's remove cascade.
ExamResultSchema.index({ adminId: 1, sessionId: 1, classId: 1, streamId: 1, term: 1 });
// "Last annual result" for a student, newest first.
ExamResultSchema.index({ adminId: 1, studentId: 1, isAnnual: 1, updatedAt: -1 });

const ExamResultModel = mongoose.model('v2-exam-result', ExamResultSchema);

module.exports = ExamResultModel;
