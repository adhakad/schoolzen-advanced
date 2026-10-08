'use strict';
const mongoose = require('mongoose');

// v2 ClassShift — a student's expected shift comes from where they sit: one row per
// (session, class, stream, section). Session-scoped, like the placement itself
// (StudentEnrollment). streamId/sectionId are null when the class has none.
//
// Resolution for a student is most-specific-first: section row, then stream row, then the
// class row (services/attendance-v2/shift-lookup.js).
const ClassShiftSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: String, required: true },
    classId: { type: String, required: true },
    streamId: { type: String, default: null },
    sectionId: { type: String, default: null },
    shiftId: { type: String, required: true },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

ClassShiftSchema.index({ adminId: 1, sessionId: 1, classId: 1, streamId: 1, sectionId: 1 }, { unique: true });
ClassShiftSchema.index({ adminId: 1, shiftId: 1 });

const ClassShiftV2Model = mongoose.model('v2-class-shift', ClassShiftSchema);

module.exports = ClassShiftV2Model;
