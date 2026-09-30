'use strict';

// The Student Excel sheet's column contract — used by BOTH the export (controller) and the
// import (worker), so a sheet exported from Manage Students always re-imports cleanly.
//
// The profile columns come straight from the FieldConfig, so a school's custom
// visibility/required settings shape the sheet the same way they shape the form.

// Placement columns. The scope (class/stream) is fixed by the modal; `Class` is written on
// export so the sheet says which class it holds, and on import a row naming a different
// class — or text matching no class at all — is reported (CLASS_OUT_OF_SCOPE /
// CLASS_NAME_UNRECOGNIZED) instead of being silently filed under the selected one.
// Optional: a blank Class cell means "the selected class".
// Subject Group: written only for a streamed class; on IMPORT it is always a recognised
// header, so a non-streamed class's sheet that carries one has it silently ignored (the
// class's automatic "General" group applies) — never flagged as an unknown column
// (student/errors.md, Group column).
const placementColumns = (hasStreams, acceptGroup) => [
    { key: 'className', header: 'Class', width: 10 },
    { key: 'sectionName', header: 'Section', width: 10 },
    ...(hasStreams || acceptGroup ? [{ key: 'groupName', header: 'Subject Group', width: 22 }] : []),
];

/**
 * @param {Array} fieldConfig from getStudentFieldConfig()
 * @param {Boolean} hasStreams whether the scoped class has streams
 * @param {Object} [opts]
 * @param {Boolean} [opts.forImport] recognise the Subject Group header even for a
 *        non-streamed class (its values are then ignored)
 */
const buildStudentSheetColumns = (fieldConfig, hasStreams, opts = {}) => {
    const visible = fieldConfig.filter((field) => field.visible || field.locked);
    const byKey = new Map(visible.map((field) => [field.fieldKey, field]));

    // Identity first, in the order a person scanning the sheet expects.
    const leading = ['admissionNo', 'name', 'rollNumber']
        .filter((key) => byKey.has(key))
        .map((key) => byKey.get(key));
    const rest = visible.filter((field) => !['admissionNo', 'name', 'rollNumber'].includes(field.fieldKey));

    const toColumn = (field) => ({
        key: field.fieldKey,
        header: field.label,
        // Import rows must carry an Admission No.: it is the upsert key that makes a
        // re-import update rather than duplicate.
        // …and a field with a server default (Admission Type) never makes its column
        // mandatory: a sheet without it takes the default.
        required: field.fieldKey === 'admissionNo' || (field.required && (field.validationRule || {}).default === undefined),
        type: field.validationRule.type,
    });

    return [
        ...leading.map(toColumn),
        ...placementColumns(hasStreams, Boolean(opts.forImport)),
        ...rest.map(toColumn),
    ];
};

const pad = (n) => String(n).padStart(2, '0');
/** dd/mm/yyyy — the same format the forms and the validator accept. */
const formatSheetDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

module.exports = { buildStudentSheetColumns, formatSheetDate };
