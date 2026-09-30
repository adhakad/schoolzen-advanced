'use strict';
// One-off migration for v2 Student data written BEFORE sessions became references
// (student-fix2.md, items 5–6).
//
//   node scripts/migrate-student-sessions-v2.js [--adminId=<id>] [--dry-run] [--drop-udise]
//
// 1. student-enrollments: every document still carrying a `session` LABEL gets `sessionId`
//    (this school's AcademicSession, created on first use from the label) and loses the label.
// 2. v2-students: every document still carrying `admissionSession` is checked — the student
//    must have an enrollment for that session (the Admission form always created one) — then
//    the field is removed. A label that doesn't resolve, or a student with no matching
//    enrollment, is REPORTED and left untouched, never silently dropped.
// 3. v2-students still carrying `udiseNumber` (now `penNumber`, a different identifier) are
//    reported; the field is only removed with --drop-udise, after someone has looked.
//
// Run it BEFORE starting the API on the new code: the API's startup index sync builds the
// new unique (adminId, studentId, sessionId) index, which can't build while two of one
// student's enrollments still lack a sessionId.
//
// Idempotent: a second run finds nothing left to convert. Works on raw collections, since
// the current models no longer declare the old fields.
require('dotenv').config();
global.global_config = require('../config/config.js');

const mongoose = require('mongoose');
const { DbConnect } = require('../modules/helpers/database');
const { ensureSessionId, findSessionId } = require('../modules/helpers/academic-session/session-resolver');
const { isValidSession } = require('../modules/helpers/academic-session-format');
const StudentProfileModel = require('../modules/models/student/student');
const StudentEnrollmentModel = require('../modules/models/student/student-enrollment');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value === undefined ? true : value];
}));
const DRY_RUN = Boolean(args['dry-run']);
const DROP_UDISE = Boolean(args['drop-udise']);
const scope = args.adminId ? { adminId: String(args.adminId) } : {};

const closeConnections = async () => {
    await mongoose.connection.close().catch(() => {});
    const redisModule = require.cache[require.resolve('../modules/queues/connection')];
    const client = redisModule && redisModule.exports && redisModule.exports.connection;
    if (client && typeof client.quit === 'function') await client.quit().catch(() => {});
};

const main = async () => {
    await DbConnect();
    const enrollments = StudentEnrollmentModel.collection;
    const students = StudentProfileModel.collection;
    const report = {
        dryRun: DRY_RUN,
        enrollmentsConverted: 0,
        admissionSessionRemoved: 0,
        udiseFound: 0,
        udiseDropped: 0,
        unresolved: [],
    };

    // Per-school label → id, resolved once per (adminId, label). A dry run creates nothing:
    // it uses the existing session if there is one, else a placeholder id.
    const ids = new Map();
    const sessionIdFor = async (adminId, label) => {
        if (!isValidSession(label)) return null;
        const key = `${adminId}|${label}`;
        if (!ids.has(key)) {
            ids.set(key, DRY_RUN
                ? (await findSessionId(adminId, label)) || new mongoose.Types.ObjectId()
                : await ensureSessionId(adminId, label));
        }
        return ids.get(key);
    };

    // 1. enrollments: label → reference
    const labelled = enrollments.find({ ...scope, session: { $exists: true }, sessionId: { $exists: false } });
    for await (const doc of labelled) {
        const sessionId = await sessionIdFor(doc.adminId, doc.session);
        if (!sessionId) {
            report.unresolved.push({ collection: 'student-enrollments', _id: String(doc._id), session: doc.session, reason: 'not a valid YYYY-YYYY label' });
            continue;
        }
        if (!DRY_RUN) await enrollments.updateOne({ _id: doc._id }, { $set: { sessionId }, $unset: { session: '' } });
        report.enrollmentsConverted += 1;
    }

    // 2. students: admissionSession off the profile, once its enrollment is confirmed
    const withAdmissionSession = students.find({ ...scope, admissionSession: { $exists: true } }, { projection: { adminId: 1, admissionSession: 1 } });
    for await (const doc of withAdmissionSession) {
        const sessionId = await sessionIdFor(doc.adminId, doc.admissionSession);
        if (!sessionId) {
            report.unresolved.push({ collection: 'v2-students', _id: String(doc._id), admissionSession: doc.admissionSession, reason: 'not a valid YYYY-YYYY label' });
            continue;
        }
        // Matched by id, or — in a dry run, where step 1 converted nothing — by the label a
        // not-yet-converted enrollment still carries. Same answer the real run would give.
        const placed = await enrollments.findOne(
            { adminId: doc.adminId, studentId: doc._id, $or: [{ sessionId }, { session: doc.admissionSession }] },
            { projection: { _id: 1 } }
        );
        if (!placed) {
            report.unresolved.push({ collection: 'v2-students', _id: String(doc._id), admissionSession: doc.admissionSession, reason: 'no enrollment for that session — needs a placement before the field can go' });
            continue;
        }
        if (!DRY_RUN) await students.updateOne({ _id: doc._id }, { $unset: { admissionSession: '' } });
        report.admissionSessionRemoved += 1;
    }

    // 3. udiseNumber → reported (and dropped only on request)
    const udiseFilter = { ...scope, udiseNumber: { $exists: true } };
    report.udiseFound = await students.countDocuments(udiseFilter);
    if (DROP_UDISE && !DRY_RUN && report.udiseFound) {
        report.udiseDropped = (await students.updateMany(udiseFilter, { $unset: { udiseNumber: '' } })).modifiedCount;
    }

    console.log(JSON.stringify({ ...report, unresolvedCount: report.unresolved.length, unresolved: report.unresolved.slice(0, 50) }, null, 2));
    await closeConnections();
};

main().catch(async (error) => {
    console.error('migrate-student-sessions-v2 failed:', error);
    await closeConnections();
    process.exit(1);
});
