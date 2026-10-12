'use strict';
const mongoose = require('mongoose');

// The school's ONE Transfer Certificate structure (certificates/tc-structure.md). The 19
// board-mandated fields are NOT stored — they are a code constant
// (helpers/certificates/tc-fields.js). This document exists for the live serial counter.
//
// nextSerialNumber is NEVER cached (certificates/optimization.md): Issue TC advances it
// with a conditional findOneAndUpdate inside the same transaction that creates the
// TransferCertificate.
const TcStructureSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    nextSerialNumber: { type: String, required: true, trim: true },
    // "TCs Issued This Session" — a precomputed counter per sessionId, $inc'd on issue and
    // decremented on cancel in the same transaction, never a live count() per page view.
    issuedCounts: { type: Map, of: Number, default: {} },
    schemaVersion: { type: Number, default: 1 },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// One structure per school (certificates/errors.md data-modeling gap) — also makes the lazy
// first-use upsert race-safe.
TcStructureSchema.index({ adminId: 1 }, { unique: true });

const TcStructureModel = mongoose.model('v2-tc-structure', TcStructureSchema);

module.exports = TcStructureModel;
