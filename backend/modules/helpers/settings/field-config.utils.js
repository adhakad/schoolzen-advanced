'use strict';
const crypto = require('crypto');

// Admission Form Fields' module logic (settings/admission-form-fields.md, settings/errors.md
// Page 2). Pure functions first (merge, version, rules, key derivation), then the two
// v2-student count queries the schema-safety checks need.
//
// Deliberately does NOT require validators/student/field-config.validator.js at load time —
// that file requires THIS one for the merge, and the seed/type list is passed in instead.

// Where a field is listed on the settings page — same order the page and the Excel export
// use (admission-form-fields.md, "Export").
const DISPLAY_GROUPS = Object.freeze(['always', 'student', 'state', 'parents', 'parentsContact', 'admission']);
// Groups a custom field may be placed in.
const CUSTOM_GROUPS = Object.freeze(['student', 'parents', 'parentsContact', 'admission']);
// Shown on the form, never optional nor hideable from Settings: Admission No. and Roll No.
// (admission-form-fields.md, "Admission Info … always-required, shown but disabled toggle").
// Their required flag stays what the seed says — a blank Admission No. is what makes an
// admission Pending (student/errors.md) — but no Settings save can change either flag.
const FIXED_FIELDS = Object.freeze(['admissionNo', 'rollNumber']);
// Profile values live on v2-student; rollNumber lives on the enrollment instead, so it has
// no student-path count (and can't be type-changed or hidden anyway).
const NON_PROFILE_FIELDS = Object.freeze(['rollNumber']);

// The rule keys an admin may set, per type. Platform keys (checksum, normalize, errorCodes,
// optionsByState, minAgeYears, default) are seed-owned and never accepted from a client.
const EDITABLE_RULE_KEYS = Object.freeze({
    text: ['minLength', 'maxLength', 'pattern'],
    number: ['min', 'max', 'integer'],
    date: ['notFuture'],
    dropdown: ['options'],
    email: [],
    phone: [],
    boolean: [],
});
// Types a school may give a CUSTOM field. 'file' is a recognized rule type but a custom file
// field has no upload path on the form, so it would save as a silently-unrenderable field;
// 'classRef' is platform-only.
const CUSTOM_FIELD_TYPES = Object.freeze(Object.keys(EDITABLE_RULE_KEYS));

const displayGroupOf = (field) => {
    if (field.locked) return 'always';
    if (field.stateSpecific) return 'state';
    if (field.fieldKey === 'parentsContact' || field.group === 'parentsContact') return 'parentsContact';
    return CUSTOM_GROUPS.includes(field.group) ? field.group : 'student';
};

const isDefined = (value) => value !== undefined;

/**
 * Seed + this school's saved rows → the school's full, UNRESOLVED config (state-specific
 * fields for every state still present). Seed order first, then custom fields in creation
 * order. Each field carries its row `version` (0 = never saved).
 */
const mergeFieldConfig = (seed, savedRows = []) => {
    const byKey = new Map(savedRows.map((row) => [row.fieldKey, row]));
    const merged = seed.map((field) => {
        const saved = byKey.get(field.fieldKey);
        if (!saved || saved.isCustom) return { ...field, validationRule: { ...field.validationRule }, version: 0 };
        const fixed = field.locked || FIXED_FIELDS.includes(field.fieldKey);
        const rule = { ...field.validationRule };
        Object.entries(saved.validationRule || {}).forEach(([key, value]) => {
            if (key !== 'type' && isDefined(value)) rule[key] = value;
        });
        return {
            ...field,
            label: saved.label || field.label,
            required: fixed || !isDefined(saved.required) || saved.required === null ? field.required : Boolean(saved.required),
            visible: fixed || !isDefined(saved.visible) || saved.visible === null ? field.visible : Boolean(saved.visible),
            validationRule: rule,
            version: saved.version || 0,
        };
    });
    const seedKeys = new Set(seed.map((field) => field.fieldKey));
    savedRows
        .filter((row) => row.isCustom && !seedKeys.has(row.fieldKey))
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
        .forEach((row) => merged.push({
            fieldKey: row.fieldKey,
            label: row.label,
            group: row.group || 'student',
            required: Boolean(row.required),
            visible: row.visible !== false,
            locked: false,
            isCustom: true,
            stateSpecific: row.stateSpecific || null,
            validationRule: { ...(row.validationRule || {}) },
            version: row.version || 0,
        }));
    return merged;
};

/**
 * A fingerprint of the config's CONTENT (versions excluded): the Admission form sends back
 * the one it rendered with, and a submit against a config that has since changed is
 * FIELD_CONFIG_CHANGED (errors.md, shape 9). Content-based, so a delete or a save that
 * changes nothing behaves correctly with no separate counter to keep.
 */
const configVersionOf = (mergedFields) => crypto
    .createHash('sha1')
    .update(JSON.stringify(mergedFields.map(({ version, ...field }) => field)))
    .digest('hex')
    .slice(0, 16);

/** "Blood Group" → "bloodGroup"; "2nd Language" → "f2ndLanguage". Server-derived, never typed. */
const deriveFieldKey = (label) => {
    const words = String(label || '').normalize('NFKD').replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const key = words
        .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
        .join('')
        .slice(0, 40);
    return /^[0-9]/.test(key) ? `f${key}` : key;
};

/** Only the editable keys for `type`, trimmed/normalized; null keeps "clear this key". */
const sanitizeRule = (type, rule = {}) => {
    const out = { type };
    (EDITABLE_RULE_KEYS[type] || []).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(rule, key)) return;
        const value = rule[key];
        if (value === null || value === '') { out[key] = null; return; }
        if (key === 'options') {
            const seen = new Set();
            out.options = (Array.isArray(value) ? value : [])
                .map((option) => String(option).trim())
                .filter((option) => option && !seen.has(option.toLowerCase()) && seen.add(option.toLowerCase()));
            return;
        }
        if (key === 'pattern') { out.pattern = String(value); return; }
        if (key === 'integer' || key === 'notFuture') { out[key] = Boolean(value); return; }
        out[key] = Number(value);
    });
    return out;
};

/**
 * Field-level problems in a rule (shape 1/3), as [{ field, message }] — empty when valid.
 * `field` names the rule key so the gear modal can show it under that input.
 */
const ruleProblems = (rule) => {
    const problems = [];
    const nonNegative = (key) => {
        if (rule[key] != null && (!Number.isFinite(rule[key]) || rule[key] < 0)) {
            problems.push({ field: key, message: 'Enter a number of 0 or more.' });
        }
    };
    const finite = (key) => {
        if (rule[key] != null && !Number.isFinite(rule[key])) problems.push({ field: key, message: 'Enter a valid number.' });
    };
    if (rule.type === 'text') {
        nonNegative('minLength');
        nonNegative('maxLength');
        if (rule.minLength != null && rule.maxLength != null && rule.minLength > rule.maxLength) {
            problems.push({ field: 'maxLength', message: "Max length can't be less than min length." });
        }
        if (rule.pattern) {
            try { new RegExp(rule.pattern, 'u'); } catch (error) {
                problems.push({ field: 'pattern', message: 'Enter a valid pattern (regular expression).' });
            }
        }
    }
    if (rule.type === 'number') {
        finite('min');
        finite('max');
        if (rule.min != null && rule.max != null && rule.min > rule.max) {
            problems.push({ field: 'max', message: "Maximum can't be less than minimum." });
        }
    }
    if (rule.type === 'dropdown' && (!Array.isArray(rule.options) || rule.options.length === 0)) {
        problems.push({ field: 'options', message: 'Add at least one option to choose from.' });
    }
    return problems;
};

/**
 * A type change that can't losslessly represent existing values. Anything → text keeps every
 * stored value readable (a warning to acknowledge); any other change (free text → enum,
 * text → number/date…) can leave stored values invalid — a hard block while data exists.
 */
const isLossyTypeChange = (from, to) => from !== to && to !== 'text';

/** Options present before and missing after (case-insensitive). */
const removedOptions = (before = [], after = []) => {
    const keep = new Set((after || []).map((option) => String(option).toLowerCase()));
    return (before || []).filter((option) => !keep.has(String(option).toLowerCase()));
};

/** The v2-student path holding this field's value, or null when it isn't on the profile. */
const studentPathOf = (field) => {
    if (NON_PROFILE_FIELDS.includes(field.fieldKey)) return null;
    return field.isCustom ? `extraFields.${field.fieldKey}` : field.fieldKey;
};

const hasValue = (path) => ({ $and: [{ $ne: [`$${path}`, null] }, { $ne: [`$${path}`, ''] }] });

/**
 * { [fieldKey]: number of this school's students holding a value } for every field — ONE
 * aggregation for the whole list, never a count per row (database-design-principles.md,
 * "No N+1 queries"). v2-student only; the legacy collection is never read (§0).
 */
const countFieldData = async (adminId, fields) => {
    const StudentModel = require('../../models/student/student');
    const group = { _id: null };
    const aliases = {};
    fields.forEach((field, i) => {
        const path = studentPathOf(field);
        if (!path) return;
        aliases[`f${i}`] = field.fieldKey;
        group[`f${i}`] = { $sum: { $cond: [hasValue(path), 1, 0] } };
    });
    const counts = Object.fromEntries(fields.map((field) => [field.fieldKey, 0]));
    if (!Object.keys(aliases).length) return counts;
    const [row] = await StudentModel.aggregate([{ $match: { adminId } }, { $group: group }]);
    if (row) Object.entries(aliases).forEach(([alias, key]) => { counts[key] = row[alias] || 0; });
    return counts;
};

/** Students holding any value for one field. */
const countWithValue = async (adminId, field) => {
    const path = studentPathOf(field);
    if (!path) return 0;
    const StudentModel = require('../../models/student/student');
    return StudentModel.countDocuments({ adminId, [path]: { $nin: [null, ''], $exists: true } });
};

/** Students whose stored value is one of `values` (dropdown values are stored canonical). */
const countWithValues = async (adminId, field, values) => {
    const path = studentPathOf(field);
    if (!path || !values.length) return 0;
    const StudentModel = require('../../models/student/student');
    return StudentModel.countDocuments({ adminId, [path]: { $in: values } });
};

module.exports = {
    DISPLAY_GROUPS,
    CUSTOM_GROUPS,
    FIXED_FIELDS,
    EDITABLE_RULE_KEYS,
    CUSTOM_FIELD_TYPES,
    displayGroupOf,
    mergeFieldConfig,
    configVersionOf,
    deriveFieldKey,
    sanitizeRule,
    ruleProblems,
    isLossyTypeChange,
    removedOptions,
    studentPathOf,
    countFieldData,
    countWithValue,
    countWithValues,
};
