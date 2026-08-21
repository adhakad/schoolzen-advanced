'use strict';
const ClassShiftModel = require('../models/class-shift');
const ShiftModel = require('../models/shift');
const StudentModel = require('../models/student');

// The STUDENT half of shift resolution, extracted so BOTH speeds of the pipeline can use it
// without one requiring the other. services/roster-lookup.js is the staff/teacher twin of
// this file.
//
// It used to live inside services/attendance-reconcile.js, which was fine while only the
// slow path needed it. The ingest filter (services/punch-ingest.js) now needs a student's
// shift too, and having the fast path require the whole reconcile module — mongoose
// sessions, holiday/leave lookups, the bulkWrite machinery — to reach one map builder is
// both wasteful and a require cycle waiting to happen.

/**
 * personId -> Shift, for students, via the class each one is in.
 *
 * ClassShift has no date dimension (a class's timings are stable), so this resolves every
 * date at once — unlike getExpectedShiftsForDate, which is per day.
 *
 * Only the students actually passed in are looked up, so this is never a full roll scan.
 *
 * Three queries regardless of headcount: the school's class->shift map, the students'
 * classes, and the distinct shifts those classes point at.
 *
 * @param {String} adminId
 * @param {String[]} studentIds
 * @returns {Promise<Map<String, Object>>} personId -> lean Shift document
 */
const getStudentShiftMap = async (adminId, studentIds) => {
    const shiftByStudentId = new Map();
    if (studentIds.length === 0) return shiftByStudentId;

    const [classShiftRows, students] = await Promise.all([
        ClassShiftModel.find({ adminId }, { class: 1, shiftId: 1, _id: 0 }).lean(),
        StudentModel.find({ _id: { $in: studentIds } }, { class: 1 }).lean(),
    ]);
    if (classShiftRows.length === 0) return shiftByStudentId;

    // One lookup for the distinct shifts, not one per class.
    const shiftIds = [...new Set(classShiftRows.map((row) => row.shiftId))];
    const shiftList = await ShiftModel.find({ _id: { $in: shiftIds } }).lean();
    const shiftById = new Map(shiftList.map((shift) => [shift._id.toString(), shift]));

    // String() on both sides: ClassShift.class is a String, student.class is a Number.
    // Neither has to know about the other's type — see the note in models/class-shift.js.
    const shiftByClass = new Map();
    for (const row of classShiftRows) {
        const shift = shiftById.get(row.shiftId);
        if (shift) shiftByClass.set(String(row.class), shift);
    }

    for (const student of students) {
        const shift = shiftByClass.get(String(student.class));
        if (shift) shiftByStudentId.set(student._id.toString(), shift);
    }
    return shiftByStudentId;
};

module.exports = { getStudentShiftMap };
