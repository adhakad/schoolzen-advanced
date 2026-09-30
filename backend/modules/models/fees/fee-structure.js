'use strict';
const mongoose = require('mongoose');

// A Class(+Stream+Group)'s annual fee for one session — schema per fees/fee-structure.md.
//
// Created here, AHEAD of the Fees module (08), because Admission needs to read it: the
// admission form's total fee comes from this document, never a typed amount
// (student-fix4.md E). The Fees module's Fee Structure page owns create/edit; until it
// exists, a school has none, and Admission falls back to its FEE_STRUCTURE_MISSING warning.
//
// Mongoose name differs from the legacy 'fees-structure' (label/class-number keyed).
const FeeStructureSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'v2-academic-session', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'academic-class', required: true },
    streamId: { type: mongoose.Schema.Types.ObjectId, default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, default: null },
    admissionFee: { type: Number, min: 0, default: 0 },
    // e.g. Tuition, Transport, Lab. Their sum is the annual total ("Particular Total").
    particulars: [{
        _id: false,
        name: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

FeeStructureSchema.index({ adminId: 1, sessionId: 1, classId: 1, streamId: 1, groupId: 1 }, { unique: true });

/** The annual total a student's fee record is created from. */
FeeStructureSchema.statics.totalOf = (structure) =>
    (structure && structure.particulars ? structure.particulars : []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

const FeeStructureModel = mongoose.model('v2-fee-structure', FeeStructureSchema);

module.exports = FeeStructureModel;
