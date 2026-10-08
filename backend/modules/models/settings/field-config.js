'use strict';
const mongoose = require('mongoose');

// A school's saved Admission Form Fields configuration (settings/admission-form-fields.md).
//
// Stores ONLY what the school changed or added, never a full copy of the defaults:
//   - isCustom:false — an override of a seeded field (validators/student/
//     field-config.validator.js DEFAULT_STUDENT_FIELD_CONFIG): label / required / visible /
//     editable rule keys. The seed stays the source of type, locked, group and any platform
//     rule keys (checksum, normalize…), so a seed improvement reaches every school.
//   - isCustom:true — a field the school created; its value lives on v2-student under
//     extraFields[fieldKey].
// getStudentFieldConfig() merges these rows over the seed — the ONE config the Admission
// form, Manage Students and the Excel import all validate against.
const FieldConfigSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    fieldKey: { type: String, required: true, trim: true },
    label: { type: String, trim: true, default: null },
    // 'student' | 'parents' | 'parentsContact' | 'admission' — custom fields only (a seeded
    // field's group comes from the seed).
    group: { type: String, trim: true, default: null },
    required: { type: Boolean, default: undefined },
    visible: { type: Boolean, default: undefined },
    // Always false on a saved row: `locked` is a property of the SEED, checked server-side
    // against the seed, never trusted from a client or stored per school.
    locked: { type: Boolean, default: false },
    // Structured rule (type + pattern/min/max/options…), never a hardcoded regex per field.
    // On an override, a key set to null clears the seed's value for that key.
    validationRule: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // The state this field only shows for (null = every state).
    stateSpecific: { type: String, trim: true, default: null },
    isCustom: { type: Boolean, default: false },
    // Optimistic concurrency (errors.md FIELD_CONFIG_CHANGED): every save is a conditional
    // update on the version the editor loaded, then $inc.
    version: { type: Number, default: 0 },
    schemaVersion: { type: Number, default: 1 },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String, default: 'system' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// One row per field per school — the real guard behind FIELD_KEY_DUPLICATE (and the race
// guard when two saves upsert the same seeded field's first override).
FieldConfigSchema.index({ adminId: 1, fieldKey: 1 }, { unique: true });

const FieldConfigModel = mongoose.model('v2-field-config', FieldConfigSchema);

module.exports = FieldConfigModel;
