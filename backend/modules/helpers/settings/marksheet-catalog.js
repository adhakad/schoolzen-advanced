'use strict';

// The fixed marksheet-template catalog (settings-marksheet-templates.md) — T1–T8, values
// transcribed from the approved reference (settings-marksheet-templates.html). That file is
// the authority here, not the commented-out legacy definitions in exam-result-structure.js
// (which differ on T2/T5/T6): the .html is the approved design, legacy is not a source (§0).
//
// Not admin data: changes only through a deploy that edits this file, seeded by
// scripts/seed-marksheet-templates.js.

const A_PLUS = [['A+', 91, 100], ['A', 81, 90], ['B+', 71, 80], ['B', 61, 70], ['C+', 51, 60], ['C', 41, 50], ['D', 33, 40], ['F', 0, 32]];
const A_ONE = [['A1', 91, 100], ['A2', 81, 90], ['B1', 71, 80], ['B2', 61, 70], ['C1', 51, 60], ['C2', 41, 50], ['D', 33, 40], ['F', 0, 32]];

const t = (code, order, terms, gradeScale, marks, coScholasticAreas, supplyLimit) => ({
    code,
    name: code,
    order,
    terms,
    gradeScale,
    theoryMax: marks.theoryMax,
    theoryPass: marks.theoryPass,
    practicalMax: marks.practicalMax == null ? null : marks.practicalMax,
    coScholasticAreas,
    supplyLimit,
    gradeRows: gradeScale === 'A1 to F' ? A_ONE : A_PLUS,
});

const MARKSHEET_CATALOG = Object.freeze([
    t('T1', 1, ['Half-Yearly'], 'A+ to F', { theoryMax: 100, theoryPass: 33 }, ['Work Education', 'Arts Education', 'Discipline'], 2),
    t('T2', 2, ['Half-Yearly'], 'A+ to F', { theoryMax: 100, theoryPass: 33 }, ['Work Education', 'Discipline'], 1),
    t('T3', 3, ['Half-Yearly', 'Final Exam'], 'A1 to F', { theoryMax: 80, theoryPass: 27, practicalMax: 20 },
        ['Work Education', 'Arts Education', 'Discipline', 'Health & PE'], 2),
    t('T4', 4, ['Half-Yearly', 'Final Exam'], 'A1 to F', { theoryMax: 80, theoryPass: 27, practicalMax: 20 },
        ['Work Education', 'Arts Education', 'Discipline'], 2),
    t('T5', 5, ['Half-Yearly', 'Final Exam'], 'A+ to F', { theoryMax: 100, theoryPass: 33 }, ['Work Education', 'Arts Education'], 3),
    t('T6', 6, ['Term 1', 'Term 2'], 'A1 to F', { theoryMax: 80, theoryPass: 27, practicalMax: 20 }, ['Work Education', 'Discipline'], 2),
    t('T7', 7, ['Final Exam'], 'A+ to F', { theoryMax: 100, theoryPass: 33 }, ['Discipline'], 1),
    t('T8', 8, ['Final Exam'], 'A+ to F', { theoryMax: 100, theoryPass: 33 }, ['Work Education'], 2),
]);

module.exports = { MARKSHEET_CATALOG };
