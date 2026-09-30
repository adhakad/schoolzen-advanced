'use strict';

// The Student module's fixed option lists — ONE definition, imported by everything that
// needs them: the FieldConfig seed (and so the form's `.dd` menus via GET /field-config),
// the Excel import validator, the Excel export and any demo/sample-data generator
// (student-fix4.md, B). A second hand-typed copy anywhere is how an exported or demo sheet
// ends up failing its own import ("Graduate" in one list, "graduate degree" in another).

const MEDIUM_OPTIONS = Object.freeze(['English', 'Hindi']);
const GENDER_OPTIONS = Object.freeze(['Male', 'Female', 'Other']);
const CATEGORY_OPTIONS = Object.freeze(['General', 'OBC', 'SC', 'ST', 'EWS']);
const RELIGION_OPTIONS = Object.freeze(['Hindu', 'Sikh', 'Jain', 'Buddhist', 'Christian', 'Muslim', 'Other']);
const NATIONALITY_OPTIONS = Object.freeze(['Indian', 'Other']);
const QUALIFICATION_OPTIONS = Object.freeze(['Illiterate', 'Primary', 'Secondary', 'Higher Secondary', 'Graduate', 'Postgraduate', 'Doctorate', 'Other']);
/**
 * 'new' = admitted from today; 'old' = already studying here before the school adopted the
 * ERP (student/errors.md, admissionType) — a real past admission date and, optionally, fees
 * already paid.
 */
const ADMISSION_TYPES = Object.freeze(['new', 'old']);
const OCCUPATION_OPTIONS = Object.freeze(['Business', 'Service', 'Government Job', 'Self-employed', 'Farmer', 'Labour', 'Homemaker', 'Other']);

/** Keyed the way GET /field-config returns them to the form. */
const OPTIONS = Object.freeze({
    medium: MEDIUM_OPTIONS,
    gender: GENDER_OPTIONS,
    category: CATEGORY_OPTIONS,
    religion: RELIGION_OPTIONS,
    nationality: NATIONALITY_OPTIONS,
    qualification: QUALIFICATION_OPTIONS,
    occupation: OCCUPATION_OPTIONS,
    admissionType: ADMISSION_TYPES,
});

/**
 * Name-like text: any script's letters plus space . ' - — so "D'Souza", "Mary-Jane",
 * "A. Kumar" and Devanagari/Tamil names pass, where the legacy `^[a-zA-Z\s]+$` rejected
 * them (student/errors.md).
 */
const NAME_PATTERN = "^[\\p{L}\\p{M}\\s.'-]+$";

/**
 * A concession above this share of the total fee needs a written reason, stored on the fee
 * record for audit (student/errors.md, "Admission-time fee & concession"). Admin-configured
 * per school once Settings exists; until then every school gets this default.
 */
const CONCESSION_REASON_THRESHOLD = 0.5;

module.exports = {
    MEDIUM_OPTIONS,
    GENDER_OPTIONS,
    CATEGORY_OPTIONS,
    RELIGION_OPTIONS,
    NATIONALITY_OPTIONS,
    QUALIFICATION_OPTIONS,
    OCCUPATION_OPTIONS,
    ADMISSION_TYPES,
    OPTIONS,
    NAME_PATTERN,
    CONCESSION_REASON_THRESHOLD,
};
