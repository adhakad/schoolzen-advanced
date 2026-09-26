'use strict';
// Copy legacy students into the v2 Student + StudentEnrollment collections.
//
//   node scripts/migrate-students-v2.js --adminId=<id> [--dry-run]
//   node scripts/migrate-students-v2.js --all [--dry-run]
//
// READ-ONLY on the legacy `student` collection — it is never modified (the v2 rebuild never
// touches live legacy data). Idempotent: students upsert on (adminId, legacyStudentId) and
// enrollments on (adminId, studentId, session), so running it again changes nothing new.
//
// Legacy students have no section (the old schema never had one), so enrollments are
// created without a sectionId; the school assigns sections via Manage Students. A student
// whose class is not configured in v2 Academic Setup (or whose stream isn't) is REPORTED and
// skipped — never guessed.
require('dotenv').config();
global.global_config = require('../config/config.js');

const mongoose = require('mongoose');
const { DbConnect } = require('../modules/helpers/database');
const LegacyStudentModel = require('../modules/models/student');
const StudentProfileModel = require('../modules/models/student/student');
const StudentEnrollmentModel = require('../modules/models/student/student-enrollment');
const { loadClassIndex } = require('../modules/helpers/student/student.utils');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value === undefined ? true : value];
}));
const DRY_RUN = Boolean(args['dry-run']);
const BATCH = 500;

const clean = (value) => (value === undefined || value === null || value === '' ? null : value);
const title = (text) => (text ? String(text).replace(/\b\w/g, (c) => c.toUpperCase()) : null);
const asString = (value) => (value == null ? null : String(value));
const legacyDate = (text) => {
    if (!text) return null;
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(text).trim());
    if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
};

const toProfile = (legacy) => ({
    admissionNo: clean(legacy.admissionNo),
    status: legacy.admissionNo != null ? 'admitted' : 'pending',
    admissionSession: legacy.session,
    name: title(legacy.name),
    nameLower: String(legacy.name || '').toLowerCase(),
    photoUrl: clean(legacy.studentImage),
    photoPublicId: clean(legacy.studentImagePublicId),
    medium: title(legacy.medium),
    admissionClass: clean(legacy.admissionClass),
    doa: legacyDate(legacy.doa),
    feesConcession: legacy.feesConcession || 0,
    lastSchool: title(legacy.lastSchool),
    dob: legacyDate(legacy.dob),
    gender: title(legacy.gender),
    category: legacy.category ? String(legacy.category).toUpperCase().replace('GENERAL', 'General') : null,
    religion: title(legacy.religion),
    nationality: title(legacy.nationality),
    aadharNumber: asString(legacy.aadharNumber),
    samagraId: asString(legacy.samagraId),
    udiseNumber: asString(legacy.udiseNumber),
    bankAccountNo: asString(legacy.bankAccountNo),
    bankIfscCode: clean(legacy.bankIfscCode),
    address: title(legacy.address),
    fatherName: title(legacy.fatherName),
    fatherQualification: title(legacy.fatherQualification),
    fatherOccupation: title(legacy.fatherOccupation),
    motherName: title(legacy.motherName),
    motherQualification: title(legacy.motherQualification),
    motherOccupation: title(legacy.motherOccupation),
    familyAnnualIncome: Number(String(legacy.familyAnnualIncome || '').replace(/[^\d.]/g, '')) || null,
    parentsContact: asString(legacy.parentsContact),
    updatedAt: new Date(),
});

const migrateSchool = async (adminId, report) => {
    const classIndex = await loadClassIndex(adminId);
    const byClassNumber = new Map([...classIndex.values()].map((entry) => [entry.doc.class, entry]));

    const cursor = LegacyStudentModel.find({ adminId }).lean().cursor();
    let batch = [];

    const flush = async () => {
        if (batch.length === 0) return;
        const plans = [];
        for (const legacy of batch) {
            const entry = byClassNumber.get(Number(legacy.class));
            if (!entry) {
                report.skipped.push({ adminId, legacyId: String(legacy._id), reason: `class ${legacy.class} not set up in v2 Academic Setup` });
                continue;
            }
            let streamId = null;
            const streamName = String(legacy.stream || '').toLowerCase();
            if (entry.doc.hasStreams) {
                const stream = (entry.doc.streams || []).find((item) => item.name === streamName);
                if (!stream) {
                    report.skipped.push({ adminId, legacyId: String(legacy._id), reason: `stream "${legacy.stream}" not set up for class ${legacy.class}` });
                    continue;
                }
                streamId = stream._id;
            }
            plans.push({ legacy, entry, streamId });
        }

        if (!DRY_RUN && plans.length) {
            const now = new Date();
            await StudentProfileModel.bulkWrite(plans.map(({ legacy }) => ({
                updateOne: {
                    filter: { adminId, legacyStudentId: String(legacy._id) },
                    update: { $set: toProfile(legacy), $setOnInsert: { adminId, legacyStudentId: String(legacy._id), createdAt: legacy.createdAt || now } },
                    upsert: true,
                },
            })), { ordered: false });

            const saved = await StudentProfileModel
                .find({ adminId, legacyStudentId: { $in: plans.map(({ legacy }) => String(legacy._id)) } }, '_id legacyStudentId')
                .lean();
            const idByLegacy = new Map(saved.map((item) => [item.legacyStudentId, item._id]));

            await StudentEnrollmentModel.bulkWrite(plans.map(({ legacy, entry, streamId }) => ({
                updateOne: {
                    filter: { adminId, studentId: idByLegacy.get(String(legacy._id)), session: legacy.session },
                    update: {
                        // $setOnInsert only: a placement the school has since edited in v2
                        // (section, roll number) is never overwritten by a re-run.
                        $setOnInsert: {
                            adminId,
                            studentId: idByLegacy.get(String(legacy._id)),
                            session: legacy.session,
                            classId: entry.doc._id,
                            class: entry.doc.class,
                            streamId,
                            groupId: null,
                            sectionId: null,
                            rollNumber: clean(legacy.rollNumber),
                            entryType: 'migration',
                            placementIncomplete: Boolean(entry.doc.hasStreams),
                            createdAt: now,
                            updatedAt: now,
                        },
                    },
                    upsert: true,
                },
            })), { ordered: false }).catch((error) => {
                // A duplicate roll number within a class is reported, not fatal.
                (error.writeErrors || []).forEach((writeError) => report.errors.push({ adminId, reason: writeError.errmsg }));
                if (!error.writeErrors) throw error;
            });
        }
        report.migrated += plans.length;
        batch = [];
    };

    for await (const legacy of cursor) {
        batch.push(legacy);
        if (batch.length >= BATCH) await flush();
    }
    await flush();
};

const main = async () => {
    if (!args.adminId && !args.all) {
        console.error('Usage: node scripts/migrate-students-v2.js --adminId=<id> | --all [--dry-run]');
        process.exit(1);
    }
    await DbConnect();
    const adminIds = args.all ? await LegacyStudentModel.distinct('adminId') : [String(args.adminId)];
    const report = { dryRun: DRY_RUN, schools: adminIds.length, migrated: 0, skipped: [], errors: [] };

    for (const adminId of adminIds) {
        await migrateSchool(adminId, report);
    }

    console.log(JSON.stringify({ ...report, skippedCount: report.skipped.length, skipped: report.skipped.slice(0, 50) }, null, 2));
    await mongoose.connection.close();
};

main().catch(async (error) => {
    console.error('migrate-students-v2 failed:', error);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
});
