'use strict';

// Masking of a student's regulated identifiers (student/errors.md, masking note;
// student-fix4.md C). Masked is the DEFAULT everywhere these leave the server: View
// Profile, and the Masked Excel export. The unmasked value goes out only through an
// explicit, logged path — a per-field reveal or a Full export.
//
// Not in this list on purpose: the biometric card number. It's an operational identifier
// the admin reads in full for device troubleshooting, not regulated PII.

const SENSITIVE_FIELDS = Object.freeze(['aadharNumber', 'bankAccountNo', 'bankIfscCode', 'penNumber']);

/**
 * Aadhaar in UIDAI's own "Masked Aadhaar" style (XXXX-XXXX-9067); every other identifier
 * keeps only its last 4 characters (XXXXXXX1234).
 */
const maskValue = (field, value) => {
    if (value === null || value === undefined || value === '') return value === undefined ? undefined : null;
    const text = String(value);
    const last4 = text.slice(-4);
    if (field === 'aadharNumber') return `XXXX-XXXX-${last4}`;
    return 'X'.repeat(Math.max(0, text.length - 4)) + last4;
};

// What maskValue() produces: X's (and the Aadhar's dashes) then the last 4 characters.
// Also the other mask glyphs a person may paste back from a screen (*, •, ●).
const MASKED_PATTERN = /^[X*•●][X*•●\s-]*[A-Z0-9]{0,4}$/i;

/**
 * True for a value that is a MASK, not data. Masking is display-only (student-critical-
 * fixes.md P0-2): a masked value is never what gets written — see keepStoredForMasks()
 * below and the MASKED_VALUE rule in validators/student/field-config.validator.js.
 */
const isMaskedValue = (value) => typeof value === 'string' && value.trim().length > 4 && MASKED_PATTERN.test(value.trim());

// Spacing, dashes and the mask glyph used don't matter: "****-****-6241" is that mask too.
const comparable = (text) => String(text).trim().toUpperCase().replace(/[\s-]/g, '').replace(/[*•●]/g, 'X');

/** True when `value` is exactly the mask this server shows for the stored value. */
const isMaskOf = (field, value, stored) => {
    if (!isMaskedValue(value) || stored === null || stored === undefined || stored === '') return false;
    return comparable(value) === comparable(maskValue(field, stored));
};

/**
 * A masked value echoed back for a sensitive field (a re-imported Masked export, a form
 * that posts the displayed value) means "unchanged" — but only when it is exactly the mask
 * of the STORED value: then it is dropped from `record`, and the write leaves the real value
 * alone. Any other masked value (a new student, nothing stored, the mask of a different
 * number) stays in `record` for the validator to reject with MASKED_VALUE — never written.
 *
 * @param {Object} record  raw input keyed by fieldKey — mutated
 * @param {Object|null} stored  the existing student (lean or document), or null
 * @returns {String[]} the fields dropped as unchanged
 */
const keepStoredForMasks = (record, stored) => {
    const dropped = [];
    if (!stored) return dropped;
    SENSITIVE_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(record, field) && isMaskOf(field, record[field], stored[field])) {
            delete record[field];
            dropped.push(field);
        }
    });
    return dropped;
};

/** A shallow copy with every sensitive field masked. */
const maskStudent = (student) => {
    const masked = { ...student };
    SENSITIVE_FIELDS.forEach((field) => {
        if (field in masked) masked[field] = maskValue(field, masked[field]);
    });
    return masked;
};

module.exports = { SENSITIVE_FIELDS, maskValue, maskStudent, isMaskedValue, isMaskOf, keepStoredForMasks };
