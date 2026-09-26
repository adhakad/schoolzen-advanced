'use strict';

// THE one validator for a student record's profile fields.
//
// The Admission form, Manage Students' Create/Update form and the Excel import worker all
// call validateStudentRecord() with the config from getStudentFieldConfig() — never their
// own hand-written rules. The legacy app had the form and its bulk import validating the
// same fields two different ways, and they silently drifted apart; this file existing once
// is the whole fix (settings/admission-form-fields.md).
//
// Placement (class/stream/group/section) is not validated here: it is checked against
// Academic Setup's real configuration by resolvePlacement() in helpers/student, because a
// "valid class" is whatever this school has configured, not a fixed rule.

// Categorical options, shared with the frontend through GET /field-config so the `.dd`
// menus and this validator can never disagree.
const OPTIONS = {
    medium: ['English', 'Hindi'],
    gender: ['Male', 'Female', 'Other'],
    category: ['General', 'OBC', 'SC', 'ST', 'EWS'],
    religion: ['Hindu', 'Sikh', 'Jain', 'Buddhist', 'Christian', 'Muslim', 'Other'],
    nationality: ['Indian', 'Other'],
    qualification: ['Illiterate', 'Primary', 'Secondary', 'Higher Secondary', 'Graduate', 'Postgraduate', 'Doctorate', 'Other'],
    occupation: ['Business', 'Service', 'Government Job', 'Self-employed', 'Farmer', 'Labour', 'Homemaker', 'Other'],
};

// The defaults a school gets until it customizes them in Settings → Admission Form Fields.
// Field shape mirrors that page's FieldConfig document (fieldKey, label, group, required,
// visible, locked, validationRule) so switching the source to the real collection changes
// getStudentFieldConfig() and nothing else.
//
// `locked` = can't be hidden or made optional (Name/DOB/Gender — the "Always Required"
// group). admissionNo/rollNumber are shown-but-not-required: a blank Admission No. is what
// makes an admission Pending.
const f = (fieldKey, label, group, type, rule = {}, flags = {}) => ({
    fieldKey,
    label,
    group,
    type,
    required: Boolean(flags.required),
    visible: flags.visible !== false,
    locked: Boolean(flags.locked),
    validationRule: rule,
});

const DEFAULT_STUDENT_FIELD_CONFIG = Object.freeze([
    f('admissionNo', 'Admission No.', 'admission', 'number', { min: 1, max: 99999999999 }),
    f('rollNumber', 'Roll Number', 'admission', 'number', { min: 1, max: 99999 }),
    f('doa', 'Date of Admission', 'admission', 'date'),
    f('medium', 'Medium', 'admission', 'enum', { options: OPTIONS.medium }, { required: true }),
    f('admissionClass', 'First Enrolled Class', 'admission', 'number'),
    f('admissionFee', 'Admission Fee (₹)', 'admission', 'number', { min: 0 }),
    f('feesConcession', 'Fees Concession (₹)', 'admission', 'number', { min: 0 }),
    f('lastSchool', 'Last School', 'admission', 'text', { maxLength: 120 }),

    f('name', 'Name', 'student', 'text', { minLength: 2, maxLength: 80 }, { required: true, locked: true }),
    f('dob', 'Date of Birth', 'student', 'date', { past: true }, { required: true, locked: true }),
    f('gender', 'Gender', 'student', 'enum', { options: OPTIONS.gender }, { required: true, locked: true }),
    f('aadharNumber', 'Aadhar Number', 'student', 'text', { pattern: '^\\d{12}$', patternMessage: 'Must be a 12-digit number' }),
    f('samagraId', 'Samagra ID', 'student', 'text', { pattern: '^\\d{9}$', patternMessage: 'Must be a 9-digit number' }),
    f('category', 'Category', 'student', 'enum', { options: OPTIONS.category }, { required: true }),
    f('religion', 'Religion', 'student', 'enum', { options: OPTIONS.religion }, { required: true }),
    f('nationality', 'Nationality', 'student', 'enum', { options: OPTIONS.nationality }, { required: true }),
    f('address', 'Address', 'student', 'text', { minLength: 3, maxLength: 250 }, { required: true }),
    f('udiseNumber', 'UDISE Number', 'student', 'text', { pattern: '^\\d{11}$', patternMessage: 'Must be an 11-digit number' }),
    f('bankAccountNo', 'Bank A/C Number', 'student', 'text', { pattern: '^\\d{9,18}$', patternMessage: 'Must be 9 to 18 digits' }),
    f('bankIfscCode', 'Bank IFSC Code', 'student', 'text', { pattern: '^[A-Za-z]{4}0[A-Za-z0-9]{6}$', patternMessage: 'Must be an 11-character IFSC code' }),

    f('fatherName', 'Father Name', 'parents', 'text', { minLength: 2, maxLength: 80 }, { required: true }),
    f('motherName', 'Mother Name', 'parents', 'text', { minLength: 2, maxLength: 80 }, { required: true }),
    f('fatherQualification', 'Father Qualification', 'parents', 'enum', { options: OPTIONS.qualification }, { required: true }),
    f('motherQualification', 'Mother Qualification', 'parents', 'enum', { options: OPTIONS.qualification }, { required: true }),
    f('fatherOccupation', 'Father Occupation', 'parents', 'enum', { options: OPTIONS.occupation }, { required: true }),
    f('motherOccupation', 'Mother Occupation', 'parents', 'enum', { options: OPTIONS.occupation }, { required: true }),
    f('familyAnnualIncome', 'Family Annual Income (₹)', 'parents', 'number', { min: 0 }, { required: true }),
    f('parentsContact', 'Parents Contact', 'parents', 'phone'),
]);

/**
 * The field config for one school. Today every school gets the defaults; when the Settings
 * module lands its FieldConfig collection, this merges that school's saved rows over the
 * defaults — and is the ONLY line that changes. Async already so no caller has to change.
 */
const getStudentFieldConfig = async (adminId) => { // eslint-disable-line no-unused-vars
    return DEFAULT_STUDENT_FIELD_CONFIG;
};

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

// "12/03/2013" (the forms' dd/mm/yyyy), "2013-03-12", or a Date / Excel date cell.
const parseDate = (value) => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value).trim();
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (dmy) {
        const [, d, m, y] = dmy.map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (iso) {
        const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
};

// Returns [normalizedValue, errorMessage|null] for one non-blank value.
const checkValue = (field, raw) => {
    const rule = field.validationRule || {};
    switch (field.type) {
        case 'number': {
            const num = Number(String(raw).replace(/[,\s₹]/g, ''));
            if (!Number.isFinite(num)) return [raw, 'Must be a number'];
            if (rule.min != null && num < rule.min) return [raw, `Must be at least ${rule.min}`];
            if (rule.max != null && num > rule.max) return [raw, `Must be at most ${rule.max}`];
            return [num, null];
        }
        case 'date': {
            const date = parseDate(raw);
            if (!date) return [raw, 'Must be a valid date (dd/mm/yyyy)'];
            if (rule.past && date.getTime() > Date.now()) return [raw, 'Must be a date in the past'];
            return [date, null];
        }
        case 'enum': {
            // Case-insensitive match onto the canonical spelling, so an Excel sheet saying
            // "obc" stores "OBC" exactly like the form's `.dd` would.
            const match = (rule.options || []).find((option) => option.toLowerCase() === String(raw).trim().toLowerCase());
            return match ? [match, null] : [raw, `Must be one of: ${(rule.options || []).join(', ')}`];
        }
        case 'phone': {
            const digits = String(raw).replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
            return /^\d{10}$/.test(digits) ? [digits, null] : [raw, 'Must be a 10-digit mobile number'];
        }
        default: {
            const text = String(raw).trim();
            if (rule.minLength != null && text.length < rule.minLength) return [text, `Must be at least ${rule.minLength} characters`];
            if (rule.maxLength != null && text.length > rule.maxLength) return [text, `Must be at most ${rule.maxLength} characters`];
            if (rule.pattern && !new RegExp(rule.pattern).test(text)) return [text, rule.patternMessage || 'Invalid format'];
            return [text, null];
        }
    }
};

/**
 * Validate and normalize one student record against a field config.
 *
 * @param {Object} record   raw values (form body or one Excel row), keyed by fieldKey
 * @param {Array}  config   from getStudentFieldConfig()
 * @param {Object} [opts]
 * @param {Boolean} [opts.partial]  update mode: only fields present in `record` are checked,
 *                                  and a missing required field is not an error
 * @returns {{ value: Object, errors: Array<{field, message}> }}
 *          `value` holds only config fields that were supplied, normalized (numbers parsed,
 *          dates as Date, enums in canonical case); blanks become null.
 */
const validateStudentRecord = (record, config, opts = {}) => {
    const value = {};
    const errors = [];

    for (const field of config) {
        const present = Object.prototype.hasOwnProperty.call(record, field.fieldKey);
        if (opts.partial && !present) continue;
        // A hidden, non-locked field is not collected, so it is neither required nor kept.
        if (!field.visible && !field.locked) continue;

        const raw = record[field.fieldKey];
        if (isBlank(raw)) {
            // In partial mode only a field actually sent can fail — sending it blank is an
            // attempt to clear it.
            if (field.required) {
                errors.push({ field: field.fieldKey, message: `${field.label} is required` });
            } else if (present) {
                value[field.fieldKey] = null;
            }
            continue;
        }

        const [normalized, message] = checkValue(field, raw);
        if (message) errors.push({ field: field.fieldKey, message });
        else value[field.fieldKey] = normalized;
    }

    return { value, errors };
};

module.exports = {
    OPTIONS,
    DEFAULT_STUDENT_FIELD_CONFIG,
    getStudentFieldConfig,
    validateStudentRecord,
    parseDate,
};
