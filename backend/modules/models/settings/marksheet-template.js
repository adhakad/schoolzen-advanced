'use strict';
const mongoose = require('mongoose');

// The SEEDED, fixed marksheet-template catalog (settings-marksheet-templates.md) — not
// admin-created, identical for every school, so no adminId. Seeded idempotently by
// scripts/seed-marksheet-templates.js (helpers/settings/marksheet-catalog.js holds the data).
//
// NOT models/marksheet-template.js ('marksheet-template' — legacy per-class ASSIGNMENT rows)
// nor models/marksheet-template-structure.js (legacy seed). v2 never reads either (§0).
//
// "usedBy" is never stored here — computed live from v2-marksheet-structure.templateId.
const MarksheetTemplateSchema = new mongoose.Schema({
    // Stable public id, "T1".."T8" — what an assignment references.
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    terms: [{ type: String, trim: true }],
    gradeScale: { type: String, required: true, trim: true },
    theoryMax: { type: Number, required: true },
    theoryPass: { type: Number, required: true },
    practicalMax: { type: Number, default: null },
    coScholasticAreas: [{ type: String, trim: true }],
    supplyLimit: { type: Number, required: true },
    // [[grade, min, max], ...]
    gradeRows: { type: [[mongoose.Schema.Types.Mixed]], default: [] },
    order: { type: Number, default: 0 },
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Global catalog — the one collection here without adminId, by design (no tenant owns it).
MarksheetTemplateSchema.index({ code: 1 }, { unique: true });

const MarksheetTemplateV2Model = mongoose.model('v2-marksheet-template', MarksheetTemplateSchema);

module.exports = MarksheetTemplateV2Model;
