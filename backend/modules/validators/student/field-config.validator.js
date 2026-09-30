'use strict';
const Joi = require('joi');
const { OPTIONS, NAME_PATTERN } = require('../../helpers/student/student.constants');

// THE one validator for a student record's profile fields.
//
// The Admission form, Manage Students' Create/Update form and the Excel import worker all
// call validateStudentRecord() with the config from getStudentFieldConfig() — never their
// own hand-written rules. The legacy app had the form and its bulk import validating the
// same fields two different ways, and they silently drifted apart; this file existing once
// is the whole fix (settings/admission-form-fields.md).
//
// Every field — seeded or school-added — is validated by buildJoiSchema(), a rule
// interpreter keyed off `validationRule.type`, never off a field NAME (student/errors.md,
// "Dynamic (school-created custom) fields"). A custom "Blood Group" dropdown validates with
// exactly the same rigor as Gender.
//
// Placement (class/stream/group/section) is not validated here: it is checked against
// Academic Setup's real configuration by resolvePlacement() in helpers/student, because a
// "valid class" is whatever this school has configured, not a fixed rule. The same goes for
// `classRef` fields (First Enrolled Class): here only the id's shape is checked; the
// write path resolves it against the school's classes.

/** The rule types a FieldConfig may use. Settings rejects any other type at config-save time. */
const FIELD_TYPES = Object.freeze(['text', 'number', 'date', 'dropdown', 'email', 'phone', 'boolean', 'file']);
/** Platform-only types, never offered for a custom field. */
const PLATFORM_TYPES = Object.freeze(['classRef']);

// The defaults a school gets until it customizes them in Settings → Admission Form Fields.
// Field shape mirrors that page's FieldConfig document (fieldKey, label, group, required,
// visible, locked, isCustom, stateSpecific, validationRule{type,…}) so switching the source
// to the real collection changes getStudentFieldConfig() and nothing else.
//
// `locked` = can't be hidden or made optional (Name/DOB/Gender — the "Always Required"
// group). admissionNo/rollNumber are shown-but-not-required: a blank Admission No. is what
// makes an admission Pending.
//
// `stateSpecific`: the field exists only for schools in that state — shown and validated
// there, hidden and ignored everywhere else. `validationRule.optionsByState` is the
// dropdown equivalent: the SAME field shown everywhere, with a per-state option list and a
// `default` for every other state (student/errors.md, "state-wise conditional visibility").
//
// `validationRule.normalize: 'digits'` strips spaces/dashes BEFORE the pattern check —
// "1234 5678 9012" is a correctly written Aadhar, not an invalid one.
const f = (fieldKey, label, group, rule, flags = {}) => ({
    fieldKey,
    label,
    group,
    required: Boolean(flags.required),
    visible: flags.visible !== false,
    locked: Boolean(flags.locked),
    isCustom: false,
    stateSpecific: flags.stateSpecific || null,
    validationRule: rule,
});

const DEFAULT_STUDENT_FIELD_CONFIG = Object.freeze([
    f('admissionNo', 'Admission No.', 'admission', { type: 'number', integer: true, min: 1, max: 99999999999 }),
    f('rollNumber', 'Roll Number', 'admission', { type: 'number', integer: true, min: 1, max: 99999 }),
    f('doa', 'Date of Admission', 'admission', { type: 'date', notFuture: true }),
    f('medium', 'Medium', 'admission', { type: 'dropdown', options: OPTIONS.medium }, { required: true }),
    // A reference to the Academic Setup class the student FIRST enrolled in — the same
    // class id placement uses, so "Class" and "First Enrolled Class" can't disagree.
    f('admissionClass', 'First Enrolled Class', 'admission', { type: 'classRef' }),
    f('admissionFee', 'Admission Fee (₹)', 'admission', { type: 'number', min: 0 }),
    f('feesConcession', 'Fees Concession (₹)', 'admission', { type: 'number', integer: true, min: 0 }),
    f('lastSchool', 'Last School', 'admission', { type: 'text', maxLength: 120 }),

    f('name', 'Name', 'student', { type: 'text', minLength: 2, maxLength: 80, pattern: NAME_PATTERN,
        errorMessages: { pattern: 'Name can only contain letters, spaces, dots, hyphens and apostrophes.' } },
    { required: true, locked: true }),
    // Not in the future, and not under 2 years old — a sanity bound that catches a
    // fat-fingered year (student/errors.md).
    f('dob', 'Date of Birth', 'student', { type: 'date', notFuture: true, minAgeYears: 2,
        errorMessages: { required: 'Date of birth is required.', notFuture: "Date of birth can't be in the future.", invalid: 'Enter a valid date of birth.' },
        errorCodes: { notFuture: 'DOB_IN_FUTURE', invalid: 'DOB_INVALID' } }, { required: true, locked: true }),
    f('gender', 'Gender', 'student', { type: 'dropdown', options: OPTIONS.gender }, { required: true, locked: true }),
    f('aadharNumber', 'Aadhar Number', 'student', { type: 'text', normalize: 'digits', pattern: '^\\d{12}$', checksum: 'verhoeff',
        errorMessages: { pattern: 'Aadhar number must be a 12-digit number.', checksum: "This isn't a valid Aadhar number — please re-check the digits." },
        errorCodes: { checksum: 'AADHAR_INVALID' } }),
    // Madhya Pradesh's own student ID — never shown to a school in any other state.
    f('samagraId', 'Samagra ID', 'student', { type: 'text', normalize: 'digits', pattern: '^\\d{9}$',
        errorMessages: { pattern: 'Samagra ID must be a 9-digit number.' } }, { stateSpecific: 'Madhya Pradesh' }),
    // Reservation categories differ by state: the field shows everywhere, the LIST varies.
    // Only the national default is seeded — a state's own list is added (by key = the
    // school's state, as stored on the school record) from Settings, not guessed here.
    f('category', 'Category', 'student', { type: 'dropdown', options: OPTIONS.category, optionsByState: { default: OPTIONS.category } },
        { required: true }),
    f('religion', 'Religion', 'student', { type: 'dropdown', options: OPTIONS.religion }, { required: true }),
    f('nationality', 'Nationality', 'student', { type: 'dropdown', options: OPTIONS.nationality }, { required: true }),
    f('address', 'Address', 'student', { type: 'text', minLength: 3, maxLength: 250 }, { required: true }),
    // The student's own national ID (UDISE+ PEN). UDISE itself identifies the school, so it is
    // not a student field.
    f('penNumber', 'PEN (Permanent Education Number)', 'student', { type: 'text', normalize: 'digits', pattern: '^\\d{11}$',
        errorMessages: { pattern: 'PEN must be an 11-digit number.' } }),
    f('bankAccountNo', 'Bank A/C Number', 'student', { type: 'text', normalize: 'digits', pattern: '^\\d{9,18}$',
        errorMessages: { pattern: 'Bank account number must be 9 to 18 digits.' } }),
    f('bankIfscCode', 'Bank IFSC Code', 'student', { type: 'text', normalize: 'upper', pattern: '^[A-Z]{4}0[A-Z0-9]{6}$',
        errorMessages: { pattern: 'Enter a valid 11-character IFSC code (e.g. SBIN0001234).' } }),

    f('fatherName', 'Father Name', 'parents', { type: 'text', minLength: 2, maxLength: 80, pattern: NAME_PATTERN,
        errorMessages: { pattern: "Father's name can only contain letters, spaces, dots, hyphens and apostrophes." } }, { required: true }),
    f('motherName', 'Mother Name', 'parents', { type: 'text', minLength: 2, maxLength: 80, pattern: NAME_PATTERN,
        errorMessages: { pattern: "Mother's name can only contain letters, spaces, dots, hyphens and apostrophes." } }, { required: true }),
    f('fatherQualification', 'Father Qualification', 'parents', { type: 'dropdown', options: OPTIONS.qualification }, { required: true }),
    f('motherQualification', 'Mother Qualification', 'parents', { type: 'dropdown', options: OPTIONS.qualification }, { required: true }),
    f('fatherOccupation', 'Father Occupation', 'parents', { type: 'dropdown', options: OPTIONS.occupation }, { required: true }),
    f('motherOccupation', 'Mother Occupation', 'parents', { type: 'dropdown', options: OPTIONS.occupation }, { required: true }),
    f('familyAnnualIncome', 'Family Annual Income (₹)', 'parents', { type: 'number', min: 0 }, { required: true }),
    f('parentsContact', 'Parents Contact', 'parents', { type: 'phone' }),
]);

const normalizeState = (state) => String(state || '').trim().toLowerCase();

/**
 * Resolve the seeded config for one state: a state-specific field is visible/validated only
 * in its own state (hidden AND not required everywhere else), and an `optionsByState` rule
 * collapses to that state's list (or `default`). Pure — the cached result is plain data.
 */
const resolveForState = (config, state) => {
    const wanted = normalizeState(state);
    return config.map((field) => {
        const resolved = { ...field, validationRule: { ...field.validationRule } };
        if (field.stateSpecific && normalizeState(field.stateSpecific) !== wanted) {
            resolved.visible = false;
            resolved.required = false;
            resolved.locked = false;
        }
        const byState = field.validationRule && field.validationRule.optionsByState;
        if (byState) {
            const key = Object.keys(byState).find((name) => normalizeState(name) === wanted);
            resolved.validationRule.options = byState[key] || byState.default || field.validationRule.options;
            delete resolved.validationRule.optionsByState;
        }
        return resolved;
    });
};

/**
 * The field config for one school, resolved for the school's state, cached near-static
 * under `{adminId}:student:field-config` (student/optimization.md) — Admission's form and a
 * 500-row Excel import both validate against ONE read, never a re-fetch per row. Settings'
 * Admission Form Fields page (the write path, not built yet) must invalidate the same key.
 *
 * Today every school gets the seeded defaults; when Settings adds the FieldConfig
 * collection, this merges that school's saved rows (custom fields included) over them —
 * the only line that changes.
 */
const getStudentFieldConfig = async (adminId) => {
    // Required lazily: this module is also loaded by scripts that have no Redis/cache setup.
    const cacheService = require('../../services/cache/cache.service');
    const cacheKeys = require('../../services/cache/cache-keys');
    const SchoolModel = require('../../models/school');
    return cacheService.wrap(cacheKeys.student.fieldConfig(adminId), cacheService.TTL.NEAR_STATIC_30, async () => {
        // The school record is legacy and only READ here, for its state.
        const school = await SchoolModel.findOne({ adminId }, 'state').lean();
        return resolveForState(DEFAULT_STUDENT_FIELD_CONFIG, school && school.state);
    });
};

/** The `.dd` option lists the form renders — each resolved from THIS school's config. */
const optionsFor = (config) => {
    const byKey = new Map(config.map((field) => [field.fieldKey, field]));
    const listOf = (key, fallback) => (byKey.get(key) && byKey.get(key).validationRule.options) || fallback;
    return {
        ...OPTIONS,
        category: listOf('category', OPTIONS.category),
    };
};

// ---------------------------------------------------------------------------------------
// Aadhaar checksum (Verhoeff). A 12-digit number that fails it can't be a real Aadhaar —
// catches the transposed/mistyped digit the pattern check lets through.
// ---------------------------------------------------------------------------------------
const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
/** True when the digit string (check digit last) passes the Verhoeff checksum. */
const verhoeffValid = (digits) => {
    if (!/^\d+$/.test(digits)) return false;
    let check = 0;
    const reversed = digits.split('').reverse().map(Number);
    reversed.forEach((digit, i) => { check = VERHOEFF_D[check][VERHOEFF_P[i % 8][digit]]; });
    return check === 0;
};
// Aadhaar numbers never start with 0 or 1 (UIDAI), in addition to the checksum.
const isValidAadhaar = (value) => /^[2-9]\d{11}$/.test(value) && verhoeffValid(value);
const CHECKSUMS = { verhoeff: isValidAadhaar };

// ---------------------------------------------------------------------------------------
// The rule interpreter
// ---------------------------------------------------------------------------------------

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

/** Pre-validation normalization — the value a person MEANT, before any pattern is applied. */
const prepare = (rule, raw) => {
    if (typeof raw === 'string') raw = raw.trim();
    switch (rule.normalize) {
        case 'digits': return String(raw).replace(/[\s-]/g, '');
        case 'upper': return String(raw).toUpperCase();
        default: break;
    }
    if (rule.type === 'number') return typeof raw === 'number' ? raw : String(raw).replace(/[,\s₹]/g, '');
    // "+91 98765-43210" → "9876543210"
    if (rule.type === 'phone') return String(raw).replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
    return raw;
};

/**
 * Joi schema for one field's rule. Keyed on `rule.type` only, so it covers any field a
 * school adds. Values arrive already `prepare()`d. The Joi error `type`s used here map onto
 * the message keys below (required / pattern / min / max / minLength / maxLength / options
 * / checksum / invalid).
 *
 * @throws {Error} for an unknown type — a broken config, never a user error
 */
const buildJoiSchema = (field) => {
    const rule = field.validationRule || {};
    let schema;
    switch (rule.type) {
        case 'text': {
            schema = Joi.string();
            if (rule.minLength != null) schema = schema.min(rule.minLength);
            if (rule.maxLength != null) schema = schema.max(rule.maxLength);
            if (rule.pattern) schema = schema.pattern(new RegExp(rule.pattern, 'u'));
            if (rule.checksum) {
                const check = CHECKSUMS[rule.checksum];
                if (!check) throw new Error(`Unknown checksum "${rule.checksum}" on field ${field.fieldKey}`);
                schema = schema.custom((value, helpers) => (check(value) ? value : helpers.error('any.checksum')));
            }
            break;
        }
        case 'number': {
            schema = Joi.number();
            if (rule.integer) schema = schema.integer();
            if (rule.min != null) schema = schema.min(rule.min);
            if (rule.max != null) schema = schema.max(rule.max);
            break;
        }
        case 'date':
            schema = Joi.any().custom((value, helpers) => {
                const date = parseDate(value);
                if (!date) return helpers.error('any.invalid');
                if (rule.notFuture && date.getTime() > Date.now()) return helpers.error('date.max');
                if (rule.minAgeYears) {
                    const bound = new Date();
                    bound.setUTCFullYear(bound.getUTCFullYear() - rule.minAgeYears);
                    if (date.getTime() > bound.getTime()) return helpers.error('any.invalid');
                }
                return date;
            });
            break;
        case 'dropdown':
            // Case-insensitive match onto the canonical spelling, so an Excel sheet saying
            // "obc" stores "OBC" exactly like the form's `.dd` would.
            schema = Joi.any().custom((value, helpers) => {
                const match = (rule.options || []).find((option) => option.toLowerCase() === String(value).toLowerCase());
                return match || helpers.error('any.only');
            });
            break;
        case 'email':
            schema = Joi.string().lowercase().email({ tlds: { allow: false } });
            break;
        case 'phone':
            schema = Joi.string().pattern(/^[6-9]\d{9}$/);
            break;
        case 'boolean':
            schema = Joi.boolean().truthy('yes', 'Yes', 'YES', 'y', '1', 1).falsy('no', 'No', 'NO', 'n', '0', 0);
            break;
        case 'file':
            schema = Joi.object({
                mime: Joi.string().valid(...(rule.allowedMimeTypes || [])),
                size: Joi.number().max((rule.maxSizeMB || 2) * 1024 * 1024),
            }).unknown(true);
            break;
        case 'classRef':
            schema = Joi.string().hex().length(24);
            break;
        default:
            throw new Error(`Unknown validationRule.type "${rule.type}" on field ${field.fieldKey}`);
    }
    return field.required ? schema.required() : schema.optional();
};

// Joi error type → our message key.
const MESSAGE_KEY = {
    'any.required': 'required',
    'string.empty': 'required',
    'string.pattern.base': 'pattern',
    'string.email': 'pattern',
    'string.min': 'minLength',
    'string.max': 'maxLength',
    'string.hex': 'invalid',
    'string.length': 'invalid',
    'number.base': 'invalid',
    'number.integer': 'invalid',
    'number.min': 'min',
    'number.max': 'max',
    'date.max': 'notFuture',
    'any.only': 'options',
    'any.checksum': 'checksum',
    'boolean.base': 'invalid',
};

/**
 * The message for one failure: the field's own `errorMessages[key]` override when the
 * config carries one, else a template by type (student/errors.md, buildMessage).
 */
const buildMessage = (field, key) => {
    const rule = field.validationRule || {};
    const custom = rule.errorMessages && rule.errorMessages[key];
    if (custom) return custom;
    const label = field.label;
    switch (key) {
        case 'required': return `${label} is required.`;
        case 'minLength': return `${label} must be at least ${rule.minLength} characters.`;
        case 'maxLength': return `${label} must be at most ${rule.maxLength} characters.`;
        case 'min': return `${label} must be at least ${rule.min}.`;
        case 'max': return `${label} must be at most ${rule.max}.`;
        case 'notFuture': return `${label} can't be in the future.`;
        case 'options': return `${label} must be one of: ${(rule.options || []).join(', ')}.`;
        case 'checksum': return `Enter a valid ${label}.`;
        default:
            if (rule.type === 'date') return `Enter a valid ${label} (dd/mm/yyyy).`;
            if (rule.type === 'phone') return `${label} must be a 10-digit mobile number.`;
            if (rule.type === 'number') return `Enter a valid ${label} (numbers only).`;
            return `Enter a valid ${label}.`;
    }
};

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

// Joi schemas are built once per field object and reused across the rows of an import.
const schemaCache = new WeakMap();
const schemaFor = (field) => {
    if (!schemaCache.has(field)) schemaCache.set(field, buildJoiSchema(field));
    return schemaCache.get(field);
};

/**
 * Validate and normalize one student record against a field config.
 *
 * @param {Object} record   raw values (form body or one Excel row), keyed by fieldKey
 * @param {Array}  config   from getStudentFieldConfig()
 * @param {Object} [opts]
 * @param {Boolean} [opts.partial]  update mode: only fields present in `record` are checked,
 *                                  and a missing required field is not an error
 * @returns {{ value: Object, errors: Array<{field, code?, message, missing?}> }}
 *          `missing: true` marks a required field left blank (the import folds those into one
 *          "Missing: …" line per row).
 *          `value` holds only config fields that were supplied, normalized (numbers parsed,
 *          dates as Date, dropdowns in canonical case, digits stripped of spaces); blanks
 *          become null. A custom field's value goes under `value.extraFields[fieldKey]`.
 */
const validateStudentRecord = (record, config, opts = {}) => {
    const value = {};
    const errors = [];
    const put = (field, normalized) => {
        if (field.isCustom) {
            value.extraFields = value.extraFields || {};
            value.extraFields[field.fieldKey] = normalized;
        } else {
            value[field.fieldKey] = normalized;
        }
    };

    for (const field of config) {
        const present = Object.prototype.hasOwnProperty.call(record, field.fieldKey);
        if (opts.partial && !present) continue;
        // A hidden, non-locked field is not collected, so it is neither required nor kept.
        if (!field.visible && !field.locked) continue;

        const raw = record[field.fieldKey];
        if (isBlank(raw)) {
            // In partial mode only a field actually sent can fail — sending it blank is an
            // attempt to clear it.
            if (field.required) errors.push({ field: field.fieldKey, missing: true, message: buildMessage(field, 'required') });
            else if (present) put(field, null);
            continue;
        }

        const { value: normalized, error } = schemaFor(field).validate(prepare(field.validationRule || {}, raw), { convert: true });
        if (error) {
            const key = MESSAGE_KEY[error.details[0].type] || 'invalid';
            const codes = (field.validationRule && field.validationRule.errorCodes) || {};
            errors.push({ field: field.fieldKey, ...(codes[key] ? { code: codes[key] } : {}), message: buildMessage(field, key) });
        } else {
            put(field, normalized);
        }
    }

    // Cross-field (student/errors.md, shape #3): a student can't be admitted before they
    // were born — catches a fat-fingered year the per-field rules can't see.
    if (value.dob instanceof Date && value.doa instanceof Date && value.doa < value.dob) {
        errors.push({ field: 'doa', code: 'DOA_BEFORE_DOB', message: "Admission date can't be before date of birth." });
    }

    return { value, errors };
};

module.exports = {
    OPTIONS,
    FIELD_TYPES,
    PLATFORM_TYPES,
    DEFAULT_STUDENT_FIELD_CONFIG,
    getStudentFieldConfig,
    resolveForState,
    optionsFor,
    buildJoiSchema,
    buildMessage,
    validateStudentRecord,
    isValidAadhaar,
    parseDate,
};
