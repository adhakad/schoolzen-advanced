'use strict';
const StaffModel = require('../models/staff');
const TeacherModel = require('../models/teacher');
const StudentModel = require('../models/student');

// The three person collections disagree on how "active" is spelled: staff uses
// 'active'/'inactive' (lowercase) while teacher and student use 'Active'/'Inactive'
// (capitalised). Every attendance read that wants "people who should be here today" would
// otherwise have to remember that per-collection quirk. It lives here once instead.

const MODEL_BY_TYPE = {
    staff: StaffModel,
    teacher: TeacherModel,
    student: StudentModel,
};

const ACTIVE_FILTER_BY_TYPE = {
    staff: { status: 'active' },
    teacher: { status: 'Active' },
    student: { status: 'Active' },
};

const getModel = (personType) => MODEL_BY_TYPE[personType] || null;

const activeFilter = (personType) => ACTIVE_FILTER_BY_TYPE[personType] || {};

/**
 * Active people of one type for one school. `extra` narrows further (e.g. { class: 5 } for
 * students, who are listed class-by-class rather than school-wide).
 * @returns {Promise<Array>} lean docs with just the fields the attendance grid needs.
 */
const getActivePeople = async (adminId, personType, extra = {}) => {
    const model = getModel(personType);
    if (!model) return [];
    return model
        .find({ adminId, ...activeFilter(personType), ...extra })
        .select('name empCode teacherUserId admissionNo class rollNumber status')
        .lean();
};

/**
 * A single person, used by the per-person calendar endpoint to label the response.
 * @returns {Promise<Object|null>}
 */
const getPerson = async (personType, personId) => {
    const model = getModel(personType);
    if (!model) return null;
    return model
        .findOne({ _id: personId })
        .select('name adminId empCode teacherUserId admissionNo class rollNumber status')
        .lean();
};

// Display code differs per type too — staff carry an admin-assigned empCode, teachers a
// numeric teacherUserId, students an admissionNo.
const personCode = (personType, person) => {
    if (!person) return '';
    if (personType === 'staff') return person.empCode || '';
    if (personType === 'teacher') return person.teacherUserId != null ? String(person.teacherUserId) : '';
    return person.admissionNo != null ? String(person.admissionNo) : '';
};

module.exports = { getModel, activeFilter, getActivePeople, getPerson, personCode };
