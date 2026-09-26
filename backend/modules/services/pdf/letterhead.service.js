'use strict';
const SchoolModel = require('../../models/school');

// THE letterhead template service — one for every printable document in the app.
//
// The Admission Letter is the first consumer; Fee Receipt, Admit Card, Marksheet and
// Transfer Certificate reuse this same function when their modules are built
// (admission.md, README "Reuse, don't duplicate"). A document type supplies only its own
// title, section label, field grid and closing note; the school header band is built here
// once, so every document carries identical letterhead language.
//
// It returns a structured document model, not an HTML string: the frontend's shared
// <app-letterhead-document> renders it (and prints it with the browser), and a future
// server-side "Download PDF" renders the SAME model — neither path concatenates markup per
// document type.

/**
 * @param {Object} opts
 * @param {String} opts.adminId
 * @param {String} opts.title          "CERTIFICATE OF ADMISSION"
 * @param {String} [opts.subtitle]     "Academic Session 2026-27"
 * @param {String} [opts.sectionLabel] "Admission Details"
 * @param {Array<{label: String, value: String}>} opts.fields
 * @param {String|Function} [opts.note] closing paragraph, or (schoolDisplayName) => paragraph
 *                                     when the wording needs the school's name
 * @returns {Promise<Object>} letterhead document model
 */
const buildLetterheadDocument = async ({ adminId, title, subtitle, sectionLabel, fields, note }) => {
    const school = await SchoolModel.findOne(
        { adminId },
        'schoolName schoolLogo affiliationNumber board street city district state pinCode phoneOne email'
    ).lean();

    const addressLine = school
        ? [school.street, school.city, [school.state, school.pinCode].filter(Boolean).join(' - ')]
            .filter(Boolean).join(', ')
        : '';
    const contactLine = school ? [school.phoneOne, school.email].filter(Boolean).join(' · ') : '';
    const affiliation = school
        ? [school.board ? `Recognized by ${String(school.board).toUpperCase()}` : null,
            school.affiliationNumber ? `Affiliation No. ${school.affiliationNumber}` : null]
            .filter(Boolean).join(' · ')
        : '';

    return {
        header: {
            schoolName: school ? String(school.schoolName || '').toUpperCase() : 'SCHOOL',
            logoUrl: (school && school.schoolLogo) || null,
            // Two meta lines under the name, exactly like the reference letter.
            metaLines: [affiliation, [addressLine, contactLine].filter(Boolean).join(' · ')].filter(Boolean),
        },
        title,
        subtitle: subtitle || null,
        sectionLabel: sectionLabel || null,
        fields: (fields || []).map((field) => ({
            label: field.label,
            value: field.value == null || field.value === '' ? '—' : String(field.value),
        })),
        note: (typeof note === 'function' ? note(school ? school.schoolName : 'the school') : note) || null,
        generatedAt: new Date().toISOString(),
    };
};

module.exports = { buildLetterheadDocument };
