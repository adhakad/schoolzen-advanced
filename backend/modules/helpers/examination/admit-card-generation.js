'use strict';
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const AdmitCardStructureModel = require('../../models/examination/admit-card-structure');
const AdmitCardModel = require('../../models/examination/admit-card');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { loadClassIndex, describePlacement } = require('../student/student.utils');
const { loadSubjectNames } = require('./exam-context');
const logger = require('../logger');

// Generating one AdmitCard per student a structure's scope matches — run ONLY by the
// examination worker (admit-card-structure.md: never synchronous inside the request).
//
// Idempotent and resumable: every card is an upsert keyed (structureId, studentId) stamped
// with the structure's version, so a retried job converges on the same set — nobody gets a
// second card and nobody is skipped. Cards whose version is older than the one generated
// (students who left the scope) are removed in ONE deleteMany afterwards.

const BATCH = 500;

/** The enrollment filter for a structure's scope. */
const scopeMatch = (structure) => {
    const match = { adminId: structure.adminId, sessionId: structure.sessionId, classId: structure.classId };
    ['streamId', 'groupId', 'sectionId'].forEach((key) => { if (structure[key]) match[key] = structure[key]; });
    return match;
};

const countScope = (structure) => StudentEnrollmentModel.countDocuments(scopeMatch(structure));

/**
 * Generate (or regenerate) the cards for `structureId` at `version`. A structure that has
 * since moved on to a newer version (or been deleted) is left alone — that save queued its
 * own job.
 * @returns {Promise<{ total, generated, failed, failures: Array<{studentId, reason}> , skipped?: true }>}
 */
const generateAdmitCards = async (adminId, structureId, version) => {
    const structure = await AdmitCardStructureModel.findOne({ _id: structureId, adminId }).lean();
    if (!structure || structure.version !== version) return { total: 0, generated: 0, failed: 0, failures: [], skipped: true };

    const [enrollments, classIndex, names] = await Promise.all([
        StudentEnrollmentModel.find(scopeMatch(structure), 'studentId classId class streamId groupId sectionId rollNumber').lean(),
        loadClassIndex(adminId),
        loadSubjectNames(adminId, structure.subjects.map((s) => s.subjectId)),
    ]);
    const schedule = structure.subjects.map((s) => ({
        subjectName: names.get(String(s.subjectId)) || null,
        examDate: s.examDate,
        startTime: s.startTime,
        endTime: s.endTime,
    }));
    const scheduleBroken = schedule.some((row) => !row.subjectName);

    const failures = [];
    let generated = 0;
    for (let i = 0; i < enrollments.length; i += BATCH) {
        const chunk = enrollments.slice(i, i + BATCH);
        const profiles = new Map((await StudentProfileModel.find(
            { adminId, _id: { $in: chunk.map((e) => e.studentId) } }, 'name dob motherName fatherName'
        ).lean()).map((p) => [String(p._id), p]));

        const operations = [];
        chunk.forEach((enrollment) => {
            const profile = profiles.get(String(enrollment.studentId));
            // One student's bad data never fails the batch or produces a blank card.
            if (!profile) { failures.push({ studentId: String(enrollment.studentId), reason: 'STUDENT_NOT_FOUND' }); return; }
            if (scheduleBroken) { failures.push({ studentId: String(enrollment.studentId), reason: 'SUBJECT_NOT_FOUND' }); return; }
            const placement = describePlacement(classIndex, enrollment);
            operations.push({
                updateOne: {
                    filter: { structureId: structure._id, studentId: enrollment.studentId },
                    update: {
                        $set: {
                            adminId,
                            sessionId: structure.sessionId,
                            structureId: structure._id,
                            structureVersion: version,
                            studentId: enrollment.studentId,
                            enrollmentId: enrollment._id,
                            classId: enrollment.classId,
                            streamId: enrollment.streamId || null,
                            groupId: enrollment.groupId || null,
                            sectionId: enrollment.sectionId || null,
                            examName: structure.examName,
                            student: {
                                name: profile.name || null,
                                dob: profile.dob || null,
                                motherName: profile.motherName || null,
                                fatherName: profile.fatherName || null,
                                className: placement.className,
                                streamName: placement.streamName,
                                sectionName: placement.sectionName,
                                rollNumber: enrollment.rollNumber,
                            },
                            schedule,
                            generatedAt: new Date(),
                        },
                    },
                    upsert: true,
                },
            });
        });
        if (!operations.length) continue;
        try {
            await AdmitCardModel.bulkWrite(operations, { ordered: false });
            generated += operations.length;
        } catch (error) {
            const writeErrors = error.writeErrors || [];
            if (!writeErrors.length) throw error;
            generated += operations.length - writeErrors.length;
            writeErrors.forEach((we) => {
                const op = operations[we.index] || {};
                failures.push({ studentId: op.updateOne ? String(op.updateOne.filter.studentId) : null, reason: 'WRITE_FAILED' });
            });
        }
    }

    // Students who left the scope since the previous version.
    await AdmitCardModel.deleteMany({ structureId: structure._id, structureVersion: { $ne: version } });

    const state = failures.length ? 'partial' : 'ready';
    await AdmitCardStructureModel.updateOne(
        { _id: structure._id, adminId, version },
        { $set: {
            'generation.state': state,
            'generation.total': enrollments.length,
            'generation.generated': generated,
            'generation.failed': failures.length,
            'generation.finishedAt': new Date(),
        } }
    );
    // Invalidate when the job finishes — the structure is genuinely usable now
    // (examination/optimization.md module notes).
    await cacheService.delPattern(cacheKeys.examination.admitCardStructurePattern(adminId));
    if (failures.length) logger.warn('examination.admitCards.partial', { adminId, structureId: String(structureId), failed: failures.length });
    return { total: enrollments.length, generated, failed: failures.length, failures: failures.slice(0, 100) };
};

module.exports = { scopeMatch, countScope, generateAdmitCards };
