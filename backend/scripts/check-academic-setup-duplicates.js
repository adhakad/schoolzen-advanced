'use strict';
// Report-only pre-flight for Academic Setup's unique indexes — safe to re-run, writes nothing.
//
//   node scripts/check-academic-setup-duplicates.js [--adminId=<id>]
//
// The three unique indexes (academic-setup-critical-fixes.md P1-2) are built at startup by
// helpers/ensure-indexes.js (syncIndexes). A collection that ALREADY holds rows violating
// one makes that index build fail — it is logged under `indexes.sync.modelFailures` and the
// collection is left without its uniqueness guard. Run this first to list those rows:
//
//   academic-class          { adminId, class }                        (exact)
//   academic-subject        { adminId, name }                         (case-insensitive)
//   academic-subject-group  { adminId, classId, streamId, name }      (case-insensitive)
//
// Nothing is merged or deleted: which duplicate to keep depends on what references it
// (enrollments, groups, fee structures), so that is a human decision. Exit code 2 when any
// duplicate is found, 0 when every index can be built.
require('dotenv').config();
global.global_config = require('../config/config.js');

const mongoose = require('mongoose');
const { DbConnect } = require('../modules/helpers/database');
const AcademicClassModel = require('../modules/models/academic-setup/class');
const SubjectModel = require('../modules/models/academic-setup/subject');
const SubjectGroupModel = require('../modules/models/academic-setup/subject-group');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value === undefined ? true : value];
}));
const scope = args.adminId ? { adminId: String(args.adminId) } : {};

// The indexes on name use collation { locale: 'en', strength: 2 } (case-insensitive), so
// names are compared lower-cased and trimmed here — the same keys the index build compares.
const normalizedName = { $toLower: { $trim: { input: { $ifNull: ['$name', ''] } } } };

const findDuplicates = (Model, groupKey) => Model.collection.aggregate([
    { $match: scope },
    { $group: { _id: groupKey, count: { $sum: 1 }, ids: { $push: '$_id' }, names: { $addToSet: '$name' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
], { allowDiskUse: true }).toArray();

const closeConnections = async () => {
    await mongoose.connection.close().catch(() => {});
    const cached = require.cache[require.resolve('../modules/queues/connection')];
    const client = cached && cached.exports && cached.exports.connection;
    if (client && typeof client.quit === 'function') await client.quit().catch(() => {});
};

const main = async () => {
    await DbConnect();

    const [classes, subjects, groups] = await Promise.all([
        findDuplicates(AcademicClassModel, { adminId: '$adminId', class: '$class' }),
        findDuplicates(SubjectModel, { adminId: '$adminId', name: normalizedName }),
        findDuplicates(SubjectGroupModel, {
            adminId: '$adminId',
            classId: '$classId',
            streamId: { $ifNull: ['$streamId', null] },
            name: normalizedName,
        }),
    ]);

    const report = {
        scope: scope.adminId || 'all schools',
        classDuplicates: classes,
        subjectDuplicates: subjects,
        subjectGroupDuplicates: groups,
        total: classes.length + subjects.length + groups.length,
    };
    console.log(JSON.stringify(report, null, 2));
    await closeConnections();
    process.exit(report.total > 0 ? 2 : 0);
};

main().catch(async (error) => {
    console.error('check-academic-setup-duplicates failed:', error);
    await closeConnections();
    process.exit(1);
});
