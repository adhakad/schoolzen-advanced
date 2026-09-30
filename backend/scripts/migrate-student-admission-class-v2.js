'use strict';
// One-off migration for v2 Student data written BEFORE `admissionClass` became a class
// reference (student-fix4.md A).
//
//   node scripts/migrate-student-admission-class-v2.js [--adminId=<id>] [--dry-run] [--null-unresolved]
//
// v2-students whose First Enrolled Class is still a raw class number (8, "8", 200 for
// Nursery…) get that school's Academic Setup class id for the same class number. A number
// the school has no class for is REPORTED and left untouched — only --null-unresolved
// clears it, after someone has looked (the same rule as the sessions migration's udise step).
//
// Idempotent: a second run finds nothing left to convert. Works on the raw collection,
// since the model now declares the field as an ObjectId.
require('dotenv').config();
global.global_config = require('../config/config.js');

const mongoose = require('mongoose');
const { DbConnect } = require('../modules/helpers/database');
const StudentProfileModel = require('../modules/models/student/student');
const AcademicClassModel = require('../modules/models/academic-setup/class');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value === undefined ? true : value];
}));
const DRY_RUN = Boolean(args['dry-run']);
const NULL_UNRESOLVED = Boolean(args['null-unresolved']);
const scope = args.adminId ? { adminId: String(args.adminId) } : {};

const closeConnections = async () => {
    await mongoose.connection.close().catch(() => {});
    const redisModule = require.cache[require.resolve('../modules/queues/connection')];
    const client = redisModule && redisModule.exports && redisModule.exports.connection;
    if (client && typeof client.quit === 'function') await client.quit().catch(() => {});
};

const main = async () => {
    await DbConnect();
    const students = StudentProfileModel.collection;
    const report = { dryRun: DRY_RUN, converted: 0, nulled: 0, unresolved: [] };

    // Per-school class number → class id, loaded once per school.
    const classMaps = new Map();
    const classIdFor = async (adminId, number) => {
        if (!classMaps.has(adminId)) {
            const classes = await AcademicClassModel.find({ adminId }, 'class').lean();
            classMaps.set(adminId, new Map(classes.map((item) => [Number(item.class), item._id])));
        }
        return classMaps.get(adminId).get(number) || null;
    };

    // A number, or a digit string — never an ObjectId (already converted) or null.
    const cursor = students.find(
        { ...scope, $or: [{ admissionClass: { $type: 'number' } }, { admissionClass: { $type: 'string', $regex: /^\s*\d+\s*$/ } }] },
        { projection: { adminId: 1, admissionClass: 1 } }
    );
    for await (const doc of cursor) {
        const number = Number(String(doc.admissionClass).trim());
        const classId = await classIdFor(doc.adminId, number);
        if (classId) {
            if (!DRY_RUN) await students.updateOne({ _id: doc._id }, { $set: { admissionClass: classId } });
            report.converted += 1;
        } else if (NULL_UNRESOLVED) {
            if (!DRY_RUN) await students.updateOne({ _id: doc._id }, { $set: { admissionClass: null } });
            report.nulled += 1;
        } else {
            report.unresolved.push({ _id: String(doc._id), adminId: doc.adminId, admissionClass: doc.admissionClass, reason: `class ${number} not set up in Academic Setup` });
        }
    }

    console.log(JSON.stringify({ ...report, unresolvedCount: report.unresolved.length, unresolved: report.unresolved.slice(0, 50) }, null, 2));
    await closeConnections();
};

main().catch(async (error) => {
    console.error('migrate-student-admission-class-v2 failed:', error);
    await closeConnections();
    process.exit(1);
});
