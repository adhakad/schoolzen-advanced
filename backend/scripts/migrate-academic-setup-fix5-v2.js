'use strict';
// One-off backfill for student-fix5.md (#5, #6, #8) — safe to re-run.
//
//   node scripts/migrate-academic-setup-fix5-v2.js [--adminId=<id>] [--dry-run] [--repair]
//
// Always (idempotent fills):
//   1. Class.order set on every class that lacks it (Nursery=0 … 12th=14).
//   2. Every class WITHOUT streams gets its automatic "General" SubjectGroup
//      (isSystemGroup: true) if it has none.
//   3. Every enrollment in a non-streamed class with no group gets that "General" group.
// Reported:
//   4. Streams with zero groups ("No group — Admission blocked until one is added").
//   5. Dangling references left by the old UpdateClass bug, which re-minted every section and
//      stream id on each class edit: enrollments whose sectionId / streamId / groupId no
//      longer exists, and subject groups / fee structures whose streamId no longer exists.
//      The original names are gone, so nothing is guessed.
// Only with --repair:
//   6. Those enrollments' dangling ids are cleared; one missing its stream or group is marked
//      placementIncomplete, which is exactly what unlocks Stream + Group on Manage Students'
//      edit form so someone can re-pick them.
require('dotenv').config();
global.global_config = require('../config/config.js');

const mongoose = require('mongoose');
const { DbConnect } = require('../modules/helpers/database');
const AcademicClassModel = require('../modules/models/academic-setup/class');
const SubjectGroupModel = require('../modules/models/academic-setup/subject-group');
const StudentEnrollmentModel = require('../modules/models/student/student-enrollment');
const FeeStructureModel = require('../modules/models/fees/fee-structure');
const { classOrderOf } = require('../modules/helpers/academic-setup/class-order');
const { GENERAL_GROUP_NAME } = require('../modules/helpers/academic-setup/class-structure');
const cacheInvalidation = require('../modules/helpers/academic-setup/cache-invalidation');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value === undefined ? true : value];
}));
const DRY_RUN = Boolean(args['dry-run']);
const REPAIR = Boolean(args.repair);
const scope = args.adminId ? { adminId: String(args.adminId) } : {};

const closeConnections = async () => {
    await mongoose.connection.close().catch(() => {});
    const redisModule = require.cache[require.resolve('../modules/queues/connection')];
    const client = redisModule && redisModule.exports && redisModule.exports.connection;
    if (client && typeof client.quit === 'function') await client.quit().catch(() => {});
};

const main = async () => {
    await DbConnect();
    const report = {
        dryRun: DRY_RUN,
        repair: REPAIR,
        classOrderSet: 0,
        generalGroupsCreated: 0,
        enrollmentsGivenGeneral: 0,
        streamsWithoutGroups: [],
        danglingEnrollments: 0,
        danglingSamples: [],
        danglingGroups: [],
        danglingFeeStructures: 0,
        repairedEnrollments: 0,
    };

    const classes = await AcademicClassModel.collection.find(scope).toArray();
    const groups = await SubjectGroupModel.collection.find(scope).toArray();

    for (const item of classes) {
        // 1. order
        if (item.order == null) {
            if (!DRY_RUN) await AcademicClassModel.collection.updateOne({ _id: item._id }, { $set: { order: classOrderOf(item.class) } });
            report.classOrderSet += 1;
        }
        const classGroups = groups.filter((group) => String(group.classId) === String(item._id));
        if (!item.hasStreams) {
            // 2. "General"
            let general = classGroups.find((group) => group.isSystemGroup);
            if (!general) {
                general = { _id: new mongoose.Types.ObjectId(), adminId: item.adminId, classId: item._id, streamId: null, name: GENERAL_GROUP_NAME, subjectIds: [], isSystemGroup: true, createdAt: new Date() };
                if (!DRY_RUN) await SubjectGroupModel.collection.insertOne(general);
                report.generalGroupsCreated += 1;
            }
            // 3. its enrollments without a group
            const filter = { adminId: item.adminId, classId: item._id, $or: [{ groupId: null }, { groupId: { $exists: false } }] };
            report.enrollmentsGivenGeneral += await StudentEnrollmentModel.collection.countDocuments(filter);
            if (!DRY_RUN) await StudentEnrollmentModel.collection.updateMany(filter, { $set: { groupId: general._id } });
        } else {
            // 4. streams with no group
            (item.streams || []).forEach((stream) => {
                if (!classGroups.some((group) => String(group.streamId) === String(stream._id))) {
                    report.streamsWithoutGroups.push({ adminId: item.adminId, class: item.class, stream: stream.name });
                }
            });
        }
    }

    // 5. dangling references
    const classById = new Map(classes.map((item) => [String(item._id), item]));
    const streamIdsOf = (item) => new Set((item.streams || []).map((stream) => String(stream._id)));
    const sectionIdsOf = (item) => new Set([
        ...(item.sections || []).map((section) => String(section._id)),
        ...(item.streams || []).flatMap((stream) => (stream.sections || []).map((section) => String(section._id))),
    ]);
    const groupIds = new Set(groups.map((group) => String(group._id)));
    groups.forEach((group) => {
        const owner = classById.get(String(group.classId));
        if (group.streamId && (!owner || !streamIdsOf(owner).has(String(group.streamId)))) {
            report.danglingGroups.push({ _id: String(group._id), name: group.name, class: owner ? owner.class : null });
        }
    });
    const feeStructures = await FeeStructureModel.collection.find({ ...scope, streamId: { $ne: null } }).toArray();
    report.danglingFeeStructures = feeStructures.filter((structure) => {
        const owner = classById.get(String(structure.classId));
        return !owner || !streamIdsOf(owner).has(String(structure.streamId));
    }).length;

    const cursor = StudentEnrollmentModel.collection.find(scope, { projection: { classId: 1, streamId: 1, sectionId: 1, groupId: 1 } });
    for await (const enrollment of cursor) {
        const owner = classById.get(String(enrollment.classId));
        if (!owner) continue;   // class itself gone — a different problem, left alone here
        const set = {};
        if (enrollment.sectionId && !sectionIdsOf(owner).has(String(enrollment.sectionId))) set.sectionId = null;
        if (enrollment.streamId && !streamIdsOf(owner).has(String(enrollment.streamId))) {
            Object.assign(set, { streamId: null, groupId: null, sectionId: null, placementIncomplete: true });
        }
        if (enrollment.groupId && !groupIds.has(String(enrollment.groupId))) {
            set.groupId = null;
            if (owner.hasStreams) set.placementIncomplete = true;
        }
        if (!Object.keys(set).length) continue;
        report.danglingEnrollments += 1;
        if (report.danglingSamples.length < 50) report.danglingSamples.push({ _id: String(enrollment._id), class: owner.class, clears: Object.keys(set) });
        if (REPAIR && !DRY_RUN) {
            await StudentEnrollmentModel.collection.updateOne({ _id: enrollment._id }, { $set: { ...set, updatedAt: new Date() } });
            report.repairedEnrollments += 1;
        }
    }

    // Written straight to the collections, so the API's cached class/group structure is
    // dropped for every school touched — otherwise it would be served stale until its TTL.
    if (!DRY_RUN) {
        const schools = [...new Set(classes.map((item) => item.adminId))];
        await Promise.all(schools.map((adminId) => Promise.all([
            cacheInvalidation.onClassesChanged(adminId),
            cacheInvalidation.onSubjectGroupsChanged(adminId),
        ])));
        report.cachesCleared = schools.length;
    }

    console.log(JSON.stringify(report, null, 2));
    await closeConnections();
};

main().catch(async (error) => {
    console.error('migrate-academic-setup-fix5-v2 failed:', error);
    await closeConnections();
    process.exit(1);
});
