'use strict';
const mongoose = require('mongoose');

// One configured exam: a Class(+Stream/Group/Section) scope, an exam name, and each
// subject's date and time (admit-card-structure.md). Creating/editing one queues the
// background job that (re)generates an AdmitCard per matching student; deleting removes them.
//
// Session-scoped: an exam belongs to one academic session's calendar.
const AdmitCardStructureSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-academic-session', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, required: true },
    class: { type: Number, required: true },
    streamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sectionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    examName: { type: String, required: true, trim: true, maxlength: 60 },
    subjects: [{
        _id: false,
        subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
        examDate: { type: String, required: true },   // "YYYY-MM-DD"
        startTime: { type: String, required: true },  // "HH:mm" 24h
        endTime: { type: String, required: true },
    }],
    // Optimistic lock (STRUCTURE_CHANGED) and the generation job's dedup key component.
    version: { type: Number, default: 1 },
    generation: {
        state: { type: String, enum: ['generating', 'ready', 'partial', 'failed'], default: 'generating' },
        total: { type: Number, default: 0 },
        generated: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        jobId: { type: String, default: null },
        finishedAt: { type: Date, default: null },
    },
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// EXAM_STRUCTURE_DUPLICATE as a real index, not an app-level check (errors.md data-modeling
// gap): one exam name per exact scope per session, case-insensitively.
AdmitCardStructureSchema.index(
    { adminId: 1, sessionId: 1, classId: 1, streamId: 1, groupId: 1, sectionId: 1, examName: 1 },
    { unique: true, collation: { locale: 'en', strength: 2 } }
);
// The list (filters narrow by class/stream/group/section), newest first.
AdmitCardStructureSchema.index({ adminId: 1, sessionId: 1, classId: 1, streamId: 1, createdAt: -1 });

const AdmitCardStructureModel = mongoose.model('v2-admit-card-structure', AdmitCardStructureSchema);

module.exports = AdmitCardStructureModel;
