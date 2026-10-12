'use strict';

// The 19 board-mandated Transfer Certificate fields (certificates/tc-structure.md) — a fixed
// constant, not per-school data. TC Structure shows them locked; the certificate prints them
// in this order. `key` is the snapshot field each one prints from.
const TC_FIELDS = Object.freeze([
    { no: 1, key: 'name', label: 'Name of the Pupil', printLabel: 'Name of the Pupil' },
    { no: 2, key: 'motherName', label: "Mother's Name", printLabel: "Mother's Name" },
    { no: 3, key: 'fatherName', label: "Father's/Guardian's Name", printLabel: "Father's/Guardian's Name" },
    { no: 4, key: 'dob', label: 'Date of Birth (Admission Register)', printLabel: 'Date of Birth (Admission Register & in words)' },
    { no: 5, key: 'aadharNumber', label: 'Aadhar Number', printLabel: 'Aadhar Number' },
    { no: 6, key: 'samagraId', label: 'Samagra ID', printLabel: 'Samagra ID' },
    { no: 7, key: 'nationality', label: 'Nationality', printLabel: 'Nationality' },
    { no: 8, key: 'category', label: 'Category (SC/ST/OBC/General)', printLabel: 'Category' },
    { no: 9, key: 'firstAdmissionDate', label: 'Date of First Admission', printLabel: 'Date of First Admission in the School' },
    { no: 10, key: 'classLastStudied', label: 'Class Last Studied (+ Section)', printLabel: 'Class in which the Pupil Last Studied' },
    { no: 11, key: 'lastExamResult', label: 'Last Annual Exam & Result', printLabel: 'School/Board Annual Examination Last Taken, with Result' },
    { no: 12, key: 'subjects', label: 'Subjects Studied (+ Stream)', printLabel: 'Subjects Studied' },
    { no: 13, key: 'promotion', label: 'Qualified for Promotion', printLabel: 'Qualified for Promotion to Higher Class' },
    { no: 14, key: 'workingDays', label: 'Total Working Days', printLabel: 'Total No. of Working Days (this session)' },
    { no: 15, key: 'presentDays', label: 'Total Days Present', printLabel: 'Total No. of Days Present' },
    { no: 16, key: 'issueDate', label: 'Date of Issue', printLabel: 'Date of Issue of Certificate' },
    { no: 17, key: 'reason', label: 'Reason for Leaving', printLabel: 'Reason for Leaving the School' },
    { no: 18, key: 'conduct', label: 'General Conduct', printLabel: 'General Conduct' },
    { no: 19, key: 'remarks', label: 'Any Other Remarks', printLabel: 'Any Other Remarks' },
]);

const REASON_LABELS = Object.freeze({
    transfer: "Parent's Transfer", relocation: 'Relocation', admission: 'Admission Elsewhere', other: 'Other',
});
const CONDUCT_LABELS = Object.freeze({ good: 'Good', satisfactory: 'Satisfactory', excellent: 'Excellent' });

module.exports = { TC_FIELDS, REASON_LABELS, CONDUCT_LABELS };
