'use strict';
const SchoolProfileV2Model = require('../../models/settings/school-profile');
const { letterheadLines } = require('../../helpers/settings/v2-school-profile-lists');

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
    // v2 school profile (Rule 23.7). Not set yet → the clean "SCHOOL" header below, no crash.
    const school = await SchoolProfileV2Model.findOne(
        { adminId },
        'schoolName schoolLogo affiliationNumber schoolCode board street city district state pinCode phoneOne email'
    ).lean();

    // Same text rules as the Settings → School Profile live preview (letterheadLines), so the
    // printed header is exactly what the admin saw while typing.
    const lines = school ? letterheadLines(school) : null;
    const contactLine = lines ? lines.contact : '';
    const addressLine = lines ? lines.address : '';
    const affiliation = lines ? lines.sub : '';

    return {
        header: {
            schoolName: school ? String(school.schoolName || '').toUpperCase() : 'SCHOOL',
            logoUrl: (school && school.schoolLogo) || null,
            // Under the name: board · affiliation · code, then address, then phone · email.
            metaLines: [affiliation, addressLine, contactLine].filter(Boolean),
            // The certificate codes row (Transfer Certificate prints both above its fields).
            schoolCode: (school && school.schoolCode) || null,
            affiliationNumber: (school && school.affiliationNumber) || null,
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
