'use strict';
const mongoose = require('mongoose');

// A class(+stream)'s marksheet structure for one session. ONE model, two writers:
//   - Settings → Marksheet Templates ("Use This Template") creates the row and sets
//     templateId + subjectIds (a SNAPSHOT of the class's Subject Group at assignment time —
//     the candidate subjects).
//   - Examination › Marksheet Structure sets `subjects` — which of those candidates this
//     class is marked on, each with its own Theory/Practical max (marksheet-structure.md).
//     Generate Marksheet reads `subjects` to build the entry form and bound every score.
//
// An empty `subjects` = "assigned a template but not set up yet". Already-saved results
// keep their own snapshot (exam-result.js) and are never retroactively changed.
const MarksheetStructureSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-academic-session', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // null for a class without streams.
    streamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-marksheet-template', required: true },
    subjectIds: [{ type: mongoose.Schema.Types.ObjectId }],
    // Examination's setup. null max = that part isn't examined for this subject; at least
    // one of the two is always set (exam-rules.validateMaxes).
    subjects: [{
        _id: false,
        subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
        theoryMax: { type: Number, default: null },
        practicalMax: { type: Number, default: null },
    }],
    setupAt: { type: Date, default: null },
    // Optimistic lock for the setup save (errors.md STRUCTURE_CHANGED): every write bumps it.
    version: { type: Number, default: 0 },
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
