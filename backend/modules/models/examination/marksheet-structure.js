'use strict';
const mongoose = require('mongoose');

// A class(+stream)'s marksheet structure for one session — MINIMAL, created by Settings →
// Marksheet Templates ("Use This Template") because the Examination module (module 9) is
// not built yet. Examination › Marksheet Structure EXTENDS this same model (per-subject max
// marks, terms) — it does not create a second one.
//
// subjectIds is a SNAPSHOT of the class's Subject Group at assignment time (errors.md:
// reassigning regenerates this structure; already-generated marksheets keep their own
// snapshot and are never retroactively changed).
const MarksheetStructureSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-academic-session', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // null for a class without streams.
    streamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-marksheet-template', required: true },
    subjectIds: [{ type: mongoose.Schema.Types.ObjectId }],
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// One structure per class+stream per session — the DB guard behind
// CLASS_TEMPLATE_ALREADY_ASSIGNED (two concurrent first assignments → one wins).
MarksheetStructureSchema.index({ adminId: 1, sessionId: 1, classId: 1, streamId: 1 }, { unique: true });
// usedBy: one $group per school+session.
MarksheetStructureSchema.index({ adminId: 1, sessionId: 1, templateId: 1 });

const MarksheetStructureV2Model = mongoose.model('v2-marksheet-structure', MarksheetStructureSchema);

module.exports = MarksheetStructureV2Model;
