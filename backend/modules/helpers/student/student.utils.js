'use strict';
const mongoose = require('mongoose');
const AcademicClassModel = require('../../models/academic-setup/class');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const AcademicSessionModel = require('../../models/academic-session');
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const BiometricMappingModel = require('../../models/biometric-mapping');
const { ValidationError } = require('../../errors');
const { getClassDisplayName } = require('../format-class-name');
const messages = require('../messages/student.messages');

// Student-module logic shared by its three controllers and its worker. Nothing here is
// used outside the module — cross-module capabilities (PDF, Excel, Cloudinary) live under
// services/ instead.

const MODULE = 'student';
const { ObjectId } = mongoose.Types;

// Terminal verify-mode codes pushed to WDMS as `verify_mode`. 4 (RF card) is what
// biometric-mapping.js already defaults to; 10 is the ZKTeco "fingerprint AND card" code.
const VERIFY_MODES = Object.freeze({ CARD_ONLY: 4, CARD_AND_FINGERPRINT: 10 });

const toObjectId = (value) => (value ? new ObjectId(String(value)) : null);
const sameId = (a, b) => String(a || '') === String(b || '');
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "•• 8821" — the list never ships a full card number to the browser. */
const maskCard = (cardNumber) => (cardNumber ? '•• ' + String(cardNumber).slice(-4) : null);

// ---------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------

const bumpSessionLabel = (session) => {
    const match = /^(\d{4})-(\d{2})$/.exec(String(session || ''));
    if (!match) return null;
    const start = Number(match[1]) + 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

/**
 * The session after `session` — what Class Promotion creates placements in.
 *
 * Sessions are still the legacy global strings ("2026-27", models/academic-session.js)
 * until Settings → Academic Sessions is rebuilt. If the legacy list already holds a later
 * session, that one wins; otherwise the label is computed (read-only — nothing is written
 * to the legacy collection).
 */
const getNextSession = async (session) => {
    const doc = await AcademicSessionModel.findOne({}, 'allSession').lean();
    const known = (doc && doc.allSession) || [];
    const later = known.filter((label) => label > session).sort();
    return later[0] || bumpSessionLabel(session);
};

// ---------------------------------------------------------------------------------------
// Academic Setup lookups — one small read per request, then O(1) Map lookups per row
// ---------------------------------------------------------------------------------------

/**
 * A school's configured classes, indexed by _id with their streams and sections indexed
 * too. A school has at most ~15 class documents, so one read serves any list page's
 * labels without a per-row lookup.
 */
const loadClassIndex = async (adminId) => {
    const classes = await AcademicClassModel.find({ adminId }).lean();
    const byId = new Map();
    for (const item of classes) {
        const streams = new Map();
        const sections = new Map();
        (item.sections || []).forEach((section) => sections.set(String(section._id), section.name));
        (item.streams || []).forEach((stream) => {
            streams.set(String(stream._id), stream);
            (stream.sections || []).forEach((section) => sections.set(String(section._id), section.name));
        });
        byId.set(String(item._id), {
            doc: item,
            label: getClassDisplayName(item.class),
            streams,
            sections,
        });
    }
    return byId;
};

const titleCase = (text) => String(text || '').replace(/\b\w/g, (c) => c.toUpperCase());

/** Display names for one enrollment: "8th", "Science", "A", and the "8th · A" tag. */
const describePlacement = (classIndex, enrollment) => {
    const entry = enrollment && classIndex.get(String(enrollment.classId));
    if (!entry) {
        const fallback = enrollment ? getClassDisplayName(enrollment.class) : '';
        return { className: fallback, streamName: null, sectionName: null, tag: fallback };
    }
    const stream = enrollment.streamId ? entry.streams.get(String(enrollment.streamId)) : null;
    const streamName = stream ? titleCase(stream.name) : null;
    const sectionName = enrollment.sectionId ? entry.sections.get(String(enrollment.sectionId)) || null : null;
    const tag = [entry.label, streamName, sectionName].filter(Boolean).join(' · ');
    return { className: entry.label, streamName, sectionName, tag };
};

/**
 * Check a class/stream/group/section combination against what Academic Setup actually has
 * for this school, and return it normalized to ObjectIds.
 *
 * `allowIncomplete` lets a streamed class go through without stream/group — only Class
 * Promotion uses it, and it marks the result `placementIncomplete` so the gap is surfaced
 * rather than silent.
 *
 * @throws ValidationError with field-level messages
 */
const resolvePlacement = async (adminId, placement, opts = {}) => {
    const { classId, streamId, groupId, sectionId } = placement || {};
    const fail = (field, message) => {
        throw new ValidationError('Please fix the highlighted fields', { module: MODULE, fields: [{ field, message }] });
    };

    if (!classId || !ObjectId.isValid(String(classId))) fail('classId', 'Class is required');
    const classIndex = opts.classIndex || await loadClassIndex(adminId);
    const entry = classIndex.get(String(classId));
    if (!entry) fail('classId', messages.classNotConfigured());

    const result = {
        classId: toObjectId(classId),
        class: entry.doc.class,
        streamId: null,
        groupId: null,
        sectionId: null,
        placementIncomplete: false,
    };

    let sectionPool;
    if (entry.doc.hasStreams) {
        if (!streamId) {
            if (!opts.allowIncomplete) fail('streamId', messages.streamRequired(entry.label));
            result.placementIncomplete = true;
            return result;
        }
        const stream = entry.streams.get(String(streamId));
        if (!stream) fail('streamId', messages.streamNotInClass());
        result.streamId = toObjectId(streamId);
        sectionPool = (stream.sections || []).map((section) => String(section._id));
    } else {
        if (streamId) fail('streamId', messages.streamNotAllowed(entry.label));
        sectionPool = (entry.doc.sections || []).map((section) => String(section._id));
    }

    if (sectionId) {
        if (!sectionPool.includes(String(sectionId))) fail('sectionId', messages.sectionNotInPlacement());
        result.sectionId = toObjectId(sectionId);
    }

    if (groupId) {
        const group = await SubjectGroupModel.findOne(
            { _id: groupId, adminId, classId: result.classId, streamId: result.streamId },
            '_id'
        ).lean();
        if (!group) fail('groupId', messages.groupNotInPlacement());
        result.groupId = toObjectId(groupId);
    } else if (entry.doc.hasStreams && opts.allowIncomplete) {
        // A streamed class needs a Subject Group too before the placement is complete.
        result.placementIncomplete = true;
    }

    return result;
};

// ---------------------------------------------------------------------------------------
// The list query — shared by Manage Students and Admission
// ---------------------------------------------------------------------------------------

// Cap on how many students a search term may resolve to before the enrollment page query.
// A search is meant to find someone, not to enumerate a school; past this the user refines.
const SEARCH_ID_CAP = 1000;

/**
 * Student ids matching "Search by name or admission no.": a case-folded, ANCHORED prefix
 * on nameLower (an index range scan on {adminId, nameLower}) plus an exact admissionNo
 * when the term is numeric. Returns null when there is no search, so callers can tell
 * "no filter" from "matched nobody".
 */
const resolveSearchStudentIds = async (adminId, search) => {
    const term = String(search || '').trim().toLowerCase();
    if (!term) return null;

    const or = [{ nameLower: { $regex: '^' + escapeRegex(term) } }];
    if (/^\d+$/.test(term)) or.push({ admissionNo: Number(term) });

    const matches = await StudentProfileModel
        .find({ adminId, $or: or }, '_id')
        .limit(SEARCH_ID_CAP)
        .lean();
    return matches.map((item) => item._id);
};

/** The enrollment-side $match for a list: school + session + whatever filters are set. */
const buildEnrollmentMatch = (adminId, session, filters = {}) => {
    const match = { adminId, session };
    ['classId', 'streamId', 'groupId', 'sectionId'].forEach((key) => {
        if (filters[key]) match[key] = toObjectId(filters[key]);
    });
    return match;
};

// Only the columns the tables render — never the 30-field profile (performance-principles.md).
const LIST_STUDENT_PROJECTION = {
    name: 1, admissionNo: 1, status: 1, photoUrl: 1, fatherName: 1, motherName: 1,
    parentsContact: 1, cardNumber: 1, verifyMode: 1, admissionSession: 1,
};

/**
 * One keyset page of enrollments joined to their students in ONE aggregation (no
 * client-side join, no per-row query). `_id > cursor` on the enrollment index keeps every
 * page constant-time however deep it is.
 *
 * @returns {{ rows: Array, nextCursor: String|null }}
 */
const listEnrollmentPage = async ({ match, studentIds, cursor, limit }) => {
    const pageMatch = { ...match };
    if (studentIds) pageMatch.studentId = { $in: studentIds };
    if (cursor) pageMatch._id = { $gt: toObjectId(cursor) };

    const docs = await StudentEnrollmentModel.aggregate([
        { $match: pageMatch },
        { $sort: { _id: 1 } },
        { $limit: limit + 1 },
        // Classic localField/foreignField form (not the 5.0+ combined pipeline form) so this
        // runs on any MongoDB the app is deployed against; the page is already cut to
        // `limit` rows, so the projection after the unwind costs nothing.
        {
            $lookup: {
                from: StudentProfileModel.collection.name,
                localField: 'studentId',
                foreignField: '_id',
                as: 'student',
            },
        },
        { $unwind: '$student' },
        {
            $project: {
                classId: 1, class: 1, streamId: 1, groupId: 1, sectionId: 1,
                rollNumber: 1, session: 1, entryType: 1, placementIncomplete: 1,
                // A dotted projection keeps only the named sub-fields — the student's own
                // _id has to be asked for explicitly or every row loses its studentId.
                'student._id': 1,
                ...Object.fromEntries(Object.keys(LIST_STUDENT_PROJECTION).map((key) => ['student.' + key, 1])),
            },
        },
    ]);

    const hasMore = docs.length > limit;
    const rows = hasMore ? docs.slice(0, limit) : docs;
    return { rows, nextCursor: hasMore ? String(rows[rows.length - 1]._id) : null };
};

/** One table row — exactly the columns the page renders, nothing else. */
const toListRow = (classIndex) => (row) => {
    const placement = describePlacement(classIndex, row);
    return {
        enrollmentId: String(row._id),
        studentId: String(row.student._id),
        name: row.student.name,
        admissionNo: row.student.admissionNo,
        status: row.student.status,
        photoUrl: row.student.photoUrl || null,
        fatherName: row.student.fatherName || null,
        motherName: row.student.motherName || null,
        contact: row.student.parentsContact || null,
        card: maskCard(row.student.cardNumber),
        rollNumber: row.rollNumber,
        session: row.session,
        classId: String(row.classId),
        streamId: row.streamId ? String(row.streamId) : null,
        groupId: row.groupId ? String(row.groupId) : null,
        sectionId: row.sectionId ? String(row.sectionId) : null,
        className: placement.className,
        streamName: placement.streamName,
        sectionName: placement.sectionName,
        classTag: placement.tag,
        placementIncomplete: Boolean(row.placementIncomplete),
    };
};

/**
 * Shared by Manage Students and Admission: resolve the search, run one keyset page, count the
 * filtered total, and label the rows — three queries total regardless of page size.
 */
const listStudentRows = async ({ adminId, query, extraMatch = {} }) => {
    const studentIds = await resolveSearchStudentIds(adminId, query.search);
    if (studentIds && studentIds.length === 0) return { rows: [], nextCursor: null, total: 0 };

    const match = { ...buildEnrollmentMatch(adminId, query.session, query), ...extraMatch };
    const countMatch = studentIds ? { ...match, studentId: { $in: studentIds } } : match;

    const [page, total, classIndex] = await Promise.all([
        listEnrollmentPage({ match, studentIds, cursor: query.cursor, limit: query.limit }),
        StudentEnrollmentModel.countDocuments(countMatch),
        loadClassIndex(adminId),
    ]);

    return { rows: page.rows.map(toListRow(classIndex)), nextCursor: page.nextCursor, total };
};

// ---------------------------------------------------------------------------------------
// Cascade registries
// ---------------------------------------------------------------------------------------
//
// Deleting a student must also remove their login, fee records, admit cards and results;
// promoting one must carry fee arrears forward and reset leave balances. Those collections
// belong to modules that have not been rebuilt yet (Fees, Examination, Leave, Roles). Rather
// than this module reaching into their future schemas — or into the legacy ones, which the
// v2 rebuild never touches — each module registers its own step here when it is built:
//
//   // in the Fees module, once:
//   registerStudentDeleteStep('fees', async ({ dbSession, adminId, studentIds }) => {
//       await StudentFeeRecordModel.deleteMany({ adminId, studentId: { $in: studentIds } }, { session: dbSession });
//   });
//
// Every step runs INSIDE the caller's transaction, so a failure in any one rolls the whole
// delete/promotion back — never a partial cascade.

const deleteSteps = [];
const promotionSteps = [];

const registerStudentDeleteStep = (name, fn) => deleteSteps.push({ name, fn });
const registerPromotionStep = (name, fn) => promotionSteps.push({ name, fn });

/**
 * Lookups Class Promotion needs from modules that do not exist in v2 yet. Defaults are
 * honest rather than optimistic: no exam result is "Not Set", and no Fee Structure module
 * means the "no Fee Structure" warning shows — it must never be silently skipped.
 */
const promotionLookups = {
    // (adminId, session, studentIds) -> Map<studentId, 'pass'|'fail'|'not-set'>
    examResultFor: async () => new Map(),
    // (adminId, classId, session) -> Boolean
    hasFeeStructure: async () => false,
};

const setPromotionLookup = (name, fn) => {
    if (!Object.prototype.hasOwnProperty.call(promotionLookups, name)) {
        throw new Error(`Unknown promotion lookup: ${name}`);
    }
    promotionLookups[name] = fn;
};

/**
 * Run every registered delete step for these students inside `dbSession`'s transaction.
 * @returns {Promise<{ photoPublicIds: String[] }>} work to do AFTER commit (never inside
 *          the transaction: an external call can't be rolled back)
 */
const runStudentDeleteCascade = async ({ dbSession, adminId, studentIds }) => {
    const students = await StudentProfileModel
        .find({ adminId, _id: { $in: studentIds } }, 'photoPublicId')
        .session(dbSession)
        .lean();

    for (const step of deleteSteps) {
        await step.fn({ dbSession, adminId, studentIds });
    }

    return { photoPublicIds: students.map((item) => item.photoPublicId).filter(Boolean) };
};

/** Run every registered promotion step for one chunk inside its transaction. */
const runPromotionSteps = async (context) => {
    for (const step of promotionSteps) {
        await step.fn(context);
    }
};

// Built-in steps — what exists in v2 today. Order matters only for readability; all of
// them commit or none do.
registerStudentDeleteStep('biometric-mapping', async ({ dbSession, adminId, studentIds }) => {
    // Removing the mapping is what stops a deleted student's punches resolving to anyone.
    await BiometricMappingModel.deleteMany(
        { adminId, personType: 'student', personId: { $in: studentIds.map(String) } },
        { session: dbSession }
    );
});
registerStudentDeleteStep('enrollments', async ({ dbSession, adminId, studentIds }) => {
    await StudentEnrollmentModel.deleteMany({ adminId, studentId: { $in: studentIds } }, { session: dbSession });
});
registerStudentDeleteStep('students', async ({ dbSession, adminId, studentIds }) => {
    await StudentProfileModel.deleteMany({ adminId, _id: { $in: studentIds } }, { session: dbSession });
});

/** Run `work(dbSession)` in a transaction and always end the session. */
const withTransaction = async (work) => {
    const dbSession = await mongoose.startSession();
    try {
        let result;
        await dbSession.withTransaction(async () => {
            result = await work(dbSession);
        });
        return result;
    } finally {
        await dbSession.endSession();
    }
};

module.exports = {
    MODULE,
    VERIFY_MODES,
    toObjectId,
    sameId,
    escapeRegex,
    maskCard,
    titleCase,
    getNextSession,
    loadClassIndex,
    describePlacement,
    resolvePlacement,
    resolveSearchStudentIds,
    buildEnrollmentMatch,
    listEnrollmentPage,
    listStudentRows,
    registerStudentDeleteStep,
    registerPromotionStep,
    promotionLookups,
    setPromotionLookup,
    runStudentDeleteCascade,
    runPromotionSteps,
    withTransaction,
};
