'use strict';
const FeeStructureModel = require('../../models/fees/fee-structure');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const FeePaymentModel = require('../../models/fees/fee-payment');
const { ConflictError } = require('../../errors');
const messages = require('../messages/fees.messages');
const { paidByRecord, money } = require('./fee-ledger');
const { loadProfiles } = require('./fee-context');

// Keeping StudentFeeRecord in step with Fee Structure — fees/fee-structure.md: "This is what
// StudentFeeRecord.totalFee derives from when a student's fee record is created".
//
// A structure applies to an enrollment when it names the same session + class + stream and
// either the student's own Subject Group or no group (the class(+stream)-wide one); a
// group-specific structure wins over the class-wide one (helpers/fees/fee-structure-resolver.js,
// same rule Admission uses).

const MODULE = 'fees';
const sameId = (a, b) => String(a || '') === String(b || '');

// Entry types whose student was admitted fresh into this session — the only ones the
// admission fee applies to (fees/errors.md: the eligibility is derived PER STUDENT, never off
// a list). 'import' / 'migration' are students who were already here.
const FRESH_ENTRY_TYPES = new Set(['admission', 'manual']);

/** The admission fee this student owes under `structure` for this enrollment. */
const admissionFeeFor = (profile, enrollment, structure) =>
    (profile && profile.admissionType !== 'old' && FRESH_ENTRY_TYPES.has(enrollment.entryType)
        ? money(structure.admissionFee || 0) : 0);

/** The structure that applies to one enrollment, from the session's live structures. */
const pickStructure = (structures, enrollment) => {
    const candidates = structures.filter((item) => sameId(item.classId, enrollment.classId) && sameId(item.streamId, enrollment.streamId));
    return (enrollment.groupId && candidates.find((item) => sameId(item.groupId, enrollment.groupId)))
        || candidates.find((item) => item.groupId == null)
        || null;
};

/**
 * Create / revive / re-price fee records for `enrollments` (all in `sessionId`).
 *
 * @param {Object} opts
 * @param {String} [opts.onlyStructureId]  only touch enrollments this structure applies to
 * @param {Boolean} [opts.updateExisting]  re-price records that already exist (a structure
 *        edit); otherwise only missing / soft-deleted records are written
 * @throws ConflictError FEE_STRUCTURE_BELOW_PAID when re-pricing would bill someone less than
 *         they have already paid — checked for everyone before anything is written
 * @returns {Promise<{ created: Number, updated: Number }>}
 */
const syncRecords = async (adminId, sessionId, enrollments, { onlyStructureId = null, updateExisting = false, actor = 'system', dbSession = null } = {}) => {
    if (!enrollments.length) return { created: 0, updated: 0 };
    const structures = await FeeStructureModel.find({ adminId, sessionId, deletedAt: null }).session(dbSession).lean();
    const targets = enrollments
        .map((enrollment) => ({ enrollment, structure: pickStructure(structures, enrollment) }))
        .filter((item) => item.structure && (!onlyStructureId || sameId(item.structure._id, onlyStructureId)));
    if (!targets.length) return { created: 0, updated: 0 };

    const studentIds = targets.map((item) => item.enrollment.studentId);
    const [profiles, existing] = await Promise.all([
        loadProfiles(adminId, studentIds),
        StudentFeeRecordModel.find({ adminId, sessionId, studentId: { $in: studentIds } }).session(dbSession).lean(),
    ]);
    const existingByStudent = new Map(existing.map((record) => [String(record.studentId), record]));
    const liveIds = existing.filter((record) => !record.deletedAt).map((record) => record._id);
    const paid = paidByRecord(liveIds.length
        ? await FeePaymentModel.find({ adminId, studentFeeRecordId: { $in: liveIds }, deletedAt: null }).session(dbSession).lean()
        : []);

    const now = new Date();
    const ops = [];
    let created = 0;
    let updated = 0;
    let belowPaid = 0;
    for (const { enrollment, structure } of targets) {
        const profile = profiles.get(String(enrollment.studentId));
        const totalFee = FeeStructureModel.totalOf(structure);
        const admissionFee = admissionFeeFor(profile, enrollment, structure);
        const record = existingByStudent.get(String(enrollment.studentId));

        if (!record || record.deletedAt) {
            // A fresh admission's concession is the one fixed on the admission form.
            const concession = FRESH_ENTRY_TYPES.has(enrollment.entryType)
                ? Math.min(money((profile && profile.feesConcession) || 0), totalFee + admissionFee) : 0;
            const fields = {
                feeStructureId: structure._id, totalFee, admissionFee, concession, arrears: [],
                deletedAt: null, updatedAt: now,
            };
            ops.push(record
                ? { updateOne: { filter: { _id: record._id, adminId }, update: { $set: fields } } }
                : { updateOne: {
                    filter: { adminId, studentId: enrollment.studentId, sessionId },
                    update: { $setOnInsert: { ...fields, adminId, studentId: enrollment.studentId, sessionId, createdBy: actor, createdAt: now } },
                    upsert: true,
                } });
            created += 1;
            continue;
        }
        if (!updateExisting) continue;
        if (sameId(record.feeStructureId, structure._id) && record.totalFee === totalFee && record.admissionFee === admissionFee) continue;
        const charge = Math.max(0, totalFee + admissionFee - (record.concession || 0));
        if (charge < (paid.get(String(record._id)) || 0)) {
            belowPaid += 1;
            continue;
        }
        ops.push({ updateOne: {
            filter: { _id: record._id, adminId },
            update: { $set: { feeStructureId: structure._id, totalFee, admissionFee, updatedAt: now } },
        } });
        updated += 1;
    }

    if (belowPaid) {
        throw new ConflictError(messages.structureBelowPaid(belowPaid), {
            module: MODULE, code: 'FEE_STRUCTURE_BELOW_PAID', context: { count: belowPaid },
        });
    }
    if (ops.length) await StudentFeeRecordModel.bulkWrite(ops, { ordered: false, session: dbSession });
    return { created, updated };
};

/** Every enrollment a structure could apply to (same session + class + stream, + group). */
const enrollmentsForStructure = (adminId, structure, dbSession = null) => {
    const filter = { adminId, sessionId: structure.sessionId, classId: structure.classId, streamId: structure.streamId || null };
    if (structure.groupId) filter.groupId = structure.groupId;
    return StudentEnrollmentModel.find(filter, 'studentId sessionId classId streamId groupId entryType').session(dbSession).lean();
};

/** After a structure is created or edited: bring every student it applies to in line. */
const syncRecordsForStructure = async (adminId, structure, { actor, dbSession = null } = {}) => {
    const enrollments = await enrollmentsForStructure(adminId, structure, dbSession);
    return syncRecords(adminId, structure.sessionId, enrollments, {
        onlyStructureId: structure._id, updateExisting: true, actor, dbSession,
    });
};

/** Safety net for a list/collect: create any record a structure now covers but that is missing. */
const ensureRecords = (adminId, sessionId, enrollments, actor) =>
    syncRecords(adminId, sessionId, enrollments, { updateExisting: false, actor });

module.exports = {
    FRESH_ENTRY_TYPES,
    admissionFeeFor,
    pickStructure,
    syncRecords,
    syncRecordsForStructure,
    ensureRecords,
};
