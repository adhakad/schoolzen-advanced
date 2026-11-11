'use strict';
const mongoose = require('mongoose');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const StudentProfileModel = require('../../models/student/student');
const messages = require('../messages/academic-setup.messages');

// The "what would block deleting this?" counts for Academic Setup — ONE definition per
// resource, shared by the list endpoints (each row's `blockingCount`, shown in the delete
// confirmation before anyone types DELETE) and the bulk-delete guards (re-counted live at
// delete time, never trusted from the list — optimization.md, cascade counts are never cached).
//
// Every function is a grouped aggregation over the WHOLE id set — one $group per dependent
// collection, never a count query per row (errors.md, "Bulk delete/update always runs one
// grouped query"). Each returns Map<String(id), count>; an id with no dependents is absent.

const toObjectIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(String(id)));

const groupCount = async (Model, adminId, field, ids) => {
    const counts = new Map();
    if (!ids.length) return counts;
    const rows = await Model.aggregate([
        { $match: { adminId: adminId, [field]: { $in: toObjectIds(ids) } } },
        { $group: { _id: `$${field}`, total: { $sum: 1 } } },
    ]);
    rows.forEach((row) => counts.set(String(row._id), row.total));
    return counts;
};

/**
 * Class: students placed in it (StudentEnrollment, ANY session) plus students whose First
 * Enrolled Class it is (Student.admissionClass) — the same sum the class delete guard
 * (CLASS_HAS_STUDENTS) has always used.
 */
const classBlockingCounts = async (adminId, classIds) => {
    const [placed, firstEnrolled] = await Promise.all([
        groupCount(StudentEnrollmentModel, adminId, 'classId', classIds),
        groupCount(StudentProfileModel, adminId, 'admissionClass', classIds),
    ]);
    const counts = new Map(placed);
    firstEnrolled.forEach((total, id) => counts.set(id, (counts.get(id) || 0) + total));
    return counts;
};

/** Subject Group: student enrollments (ANY session) placed on it (SUBJECT_GROUP_IN_USE). */
const groupBlockingCounts = (adminId, groupIds) =>
    groupCount(StudentEnrollmentModel, adminId, 'groupId', groupIds);

/** Section (a class sub-document): student enrollments (ANY session) placed in it. */
const sectionBlockingCounts = (adminId, sectionIds) =>
    groupCount(StudentEnrollmentModel, adminId, 'sectionId', sectionIds);

/**
 * Subject: how many Subject Groups include it (SUBJECT_IN_USE). subjectIds is an array, so
 * the group is unwound and re-matched to count each requested subject separately — still
 * one aggregation, on the { adminId, subjectIds } index.
 */
const subjectBlockingCounts = async (adminId, subjectIds) => {
    const counts = new Map();
    if (!subjectIds.length) return counts;
    const ids = toObjectIds(subjectIds);
    const rows = await SubjectGroupModel.aggregate([
        { $match: { adminId: adminId, subjectIds: { $in: ids } } },
        { $unwind: '$subjectIds' },
        { $match: { subjectIds: { $in: ids } } },
        { $group: { _id: '$subjectIds', total: { $sum: 1 } } },
    ]);
    rows.forEach((row) => counts.set(String(row._id), row.total));
    return counts;
};

/** De-duplicated string ids, request order kept — one result per distinct id. */
const uniqueIds = (ids) => [...new Set((ids || []).map(String))];

/**
 * The bulk-delete response body: per-row outcomes plus the summary counts. Shape (the
 * contract the three pages render):
 *   { message, deletedCount, blockedCount, notFoundCount,
 *     results: [{ id, status: 'deleted'|'blocked'|'not_found'|'error', code?, blockingCount? }] }
 */
const bulkDeleteBody = (results, entity) => {
    const tally = (status) => results.filter((row) => row.status === status).length;
    const deletedCount = tally('deleted');
    const blockedCount = tally('blocked');
    const notFoundCount = tally('not_found');
    return {
        message: messages.bulkDeleteSummary(entity, { deleted: deletedCount, blocked: blockedCount, notFound: notFoundCount }),
        deletedCount,
        blockedCount,
        notFoundCount,
        results,
    };
};

module.exports = {
    classBlockingCounts,
    groupBlockingCounts,
    sectionBlockingCounts,
    subjectBlockingCounts,
    uniqueIds,
    bulkDeleteBody,
};
