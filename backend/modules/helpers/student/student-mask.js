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
const MASKED_PATTERN = /^X[X-]*[A-Z0-9]{0,4}$/i;

/**
 * True for a value that is a MASK, not data — a Masked export re-imported must leave the
 * stored identifier alone, never overwrite it with "XXXX-XXXX-9067" (or fail the row).
 */
const isMaskedValue = (value) => typeof value === 'string' && value.trim().length > 4 && MASKED_PATTERN.test(value.trim());

/** A shallow copy with every sensitive field masked. */
const maskStudent = (student) => {
    const masked = { ...student };
    SENSITIVE_FIELDS.forEach((field) => {
        if (field in masked) masked[field] = maskValue(field, masked[field]);
    });
    return masked;
};

module.exports = { SENSITIVE_FIELDS, maskValue, maskStudent, isMaskedValue };
