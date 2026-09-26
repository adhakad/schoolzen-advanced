'use strict';

// The Student Excel sheet's column contract — used by BOTH the export (controller) and the
// import (worker), so a sheet exported from Manage Students always re-imports cleanly.
//
// The profile columns come straight from the FieldConfig, so a school's custom
// visibility/required settings shape the sheet the same way they shape the form.

// Placement columns: the scope (class/stream) is fixed by the modal, so only what varies
// inside it is a column.
const placementColumns = (hasStreams) => [
    { key: 'sectionName', header: 'Section', width: 10 },
    ...(hasStreams ? [{ key: 'groupName', header: 'Subject Group', width: 22 }] : []),
];

/**
 * @param {Array} fieldConfig from getStudentFieldConfig()
 * @param {Boolean} hasStreams whether the scoped class has streams
 */
const buildStudentSheetColumns = (fieldConfig, hasStreams) => {
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
        required: field.fieldKey === 'admissionNo' || field.required,
        type: field.type,
    });

    return [
        ...leading.map(toColumn),
        ...placementColumns(hasStreams),
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
