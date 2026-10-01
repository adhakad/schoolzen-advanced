'use strict';
const mongoose = require('mongoose');
const AcademicClassModel = require('../../models/academic-setup/class');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const AcademicSessionV2Model = require('../../models/settings/academic-session');
const StudentProfileModel = require('../../models/student/student');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const BiometricMappingModel = require('../../models/biometric-mapping');
// Admission writes a student's first fee ledger entry (student-write.js), so a delete removes it.
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const FeePaymentModel = require('../../models/fees/fee-payment');
const { ValidationError, ConflictError } = require('../../errors');
const { getClassDisplayName } = require('../format-class-name');
const { isValidSession, nextSessionLabel } = require('../academic-session-format');
const { findSessionId } = require('../academic-session/session-resolver');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { imageUrl } = require('../../services/media/cloudinary.service');
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

// ---------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------

/**
 * The session after `session` — what Class Promotion creates placements in.
 *
 * Sessions are still the legacy global strings ("2026-2027", models/academic-session.js)
 * until Settings → Academic Sessions is rebuilt. If the legacy list already holds a later
 * session, that one wins; otherwise the label is computed in the same full format
 * (helpers/academic-session-format.js) — read-only, nothing is written to the legacy
 * collection.
 */
// The school's own next v2 session after `session` (it may skip a year), else the next
// label — never the legacy global academic-session document (database-design-principles.md §0).
const getNextSession = async (adminId, session) => {
    const later = await AcademicSessionV2Model
        .find({ adminId, label: { $gt: session } }, 'label')
        .sort({ label: 1 })
        .limit(1)
        .lean();
    const next = later.find((item) => isValidSession(item.label));
    return next ? next.label : nextSessionLabel(session);
};

// --------------------------------------------------------------------------------------
// Academic Setup lookups — one small read per request, then O(1) Map lookups per row
// ---------------------------------------------------------------------------------------

/**
 * A school's raw class documents, through Academic Setup's OWN cache key — the same entry
 * Academic Setup writes and invalidates, never a Student-local copy with its own TTL
 * (student/optimization.md). Ids come back as strings from the cache; every reader below
 * compares them with String(...).
 */
const loadClasses = (adminId) => cacheService.wrap(
    cacheKeys.academicSetup.classes(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    () => AcademicClassModel.find({ adminId }).lean()
);

/** A school's subject groups (name + class/stream), through Academic Setup's cache key. */
const loadSubjectGroups = (adminId) => cacheService.wrap(
    cacheKeys.academicSetup.subjectGroups(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    () => SubjectGroupModel.find({ adminId }, 'name classId streamId isSystemGroup').sort({ name: 1 }).lean()
);

/**
 * A school's configured classes, indexed by _id with their streams and sections indexed
 * too. A school has at most ~15 class documents, so one (cached) read serves any list
 * page's labels without a per-row lookup.
 */
const loadClassIndex = async (adminId) => {
    const classes = await loadClasses(adminId);
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
    const fail = (field, message, code) => {
        throw new ValidationError('Please fix the highlighted fields', {
            module: MODULE, ...(code ? { code } : {}), fields: [{ field, message, ...(code ? { code } : {}) }],
        });
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

    // Group (student/errors.md field table; student-fix5.md #9):
    //   - streamed class: REQUIRED, and must be one of the groups that exist for this exact
    //     (classId, streamId). A stream with no group at all is SUBJECT_GROUP_MISSING —
    //     the admin has to add one in Academic Setup first.
    //   - non-streamed class: never asked; resolves to the class's automatic "General"
    //     group, whatever (if anything) was sent.
    if (entry.doc.hasStreams) {
        const groups = await SubjectGroupModel
            .find({ adminId, classId: result.classId, streamId: result.streamId, isSystemGroup: { $ne: true } }, '_id')
            .lean();
        if (!groups.length) {
            if (opts.allowIncomplete) { result.placementIncomplete = true; return result; }
            fail('groupId', messages.subjectGroupMissing(), 'SUBJECT_GROUP_MISSING');
        }
        if (groupId) {
            if (!groups.some((group) => String(group._id) === String(groupId))) fail('groupId', messages.groupNotInPlacement());
            result.groupId = toObjectId(groupId);
        } else if (opts.allowIncomplete) {
            // Class Promotion into 11th/12th: the group is picked later on the edit form.
            result.placementIncomplete = true;
        } else {
            fail('groupId', messages.groupRequired(), 'GROUP_REQUIRED');
        }
    } else {
        const general = await SubjectGroupModel.findOne({ adminId, classId: result.classId, isSystemGroup: true }, '_id').lean();
        // A class saved before "General" existed has none until the backfill runs (or the
        // class is next saved) — the placement is still valid without it.
        result.groupId = general ? general._id : null;
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

/**
 * The enrollment-side $match for a list: school + session (the AcademicSession _id, never a
 * label) + whatever filters are set.
 */
const buildEnrollmentMatch = (adminId, sessionId, filters = {}) => {
    const match = { adminId, sessionId: toObjectId(sessionId) };
    ['classId', 'streamId', 'groupId', 'sectionId'].forEach((key) => {
        if (filters[key]) match[key] = toObjectId(filters[key]);
    });
    return match;
};

// Field projection (module-optimization-guide.md §4): the page's service passes
// `?fields=` naming exactly the columns its table shows, and only those student fields are
// read — never the 30-field profile to paint a 10-column row. Whitelisted: a client can't
// project a field this map doesn't name (so never a sensitive one like aadharNumber).
const LIST_FIELD_MAP = {
    name: ['name'],
    admissionNo: ['admissionNo'],
    status: ['status'],
    photo: ['photoUrl', 'photoPublicId'],
    father: ['fatherName'],
    mother: ['motherName'],
    contact: ['parentsContact'],
    card: ['cardNumber', 'verifyMode'],
};
const DEFAULT_LIST_FIELDS = Object.keys(LIST_FIELD_MAP);

/** `"name,photo,card"` → the student-document projection for those columns. */
const studentProjectionFor = (fields) => {
    const wanted = String(fields || '').split(',').map((field) => field.trim()).filter((field) => LIST_FIELD_MAP[field]);
    const chosen = new Set(['name', 'admissionNo', 'status', ...(wanted.length ? wanted : DEFAULT_LIST_FIELDS)]);
    const projection = {};
    chosen.forEach((field) => LIST_FIELD_MAP[field].forEach((docField) => { projection[docField] = 1; }));
    return projection;
};

// Row thumbnails are requested at the size the table renders them (f_auto,q_auto, 64px) —
// never the full-size profile image shrunk with CSS (student-fix3.md).
const ROW_PHOTO_WIDTH = 64;
const rowPhoto = (student) => (student.photoPublicId
    ? imageUrl(student.photoPublicId, ROW_PHOTO_WIDTH)
    : student.photoUrl || null);

/**
 * One keyset page of enrollments joined to their students in ONE aggregation (no
 * client-side join, no per-row query). `_id > cursor` on the enrollment index keeps every
 * page constant-time however deep it is.
 *
 * @returns {{ rows: Array, nextCursor: String|null }}
 */
const listEnrollmentPage = async ({ match, studentIds, cursor, limit, projection }) => {
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
                rollNumber: 1, sessionId: 1, entryType: 1, placementIncomplete: 1,
                // A dotted projection keeps only the named sub-fields — the student's own
                // _id has to be asked for explicitly or every row loses its studentId.
                'student._id': 1,
                ...Object.fromEntries(Object.keys(projection || studentProjectionFor()).map((key) => ['student.' + key, 1])),
            },
        },
    ]);

    const hasMore = docs.length > limit;
    const rows = hasMore ? docs.slice(0, limit) : docs;
    return { rows, nextCursor: hasMore ? String(rows[rows.length - 1]._id) : null };
};

/**
 * One table row — exactly the columns the page renders, nothing else. `sessionLabel` is
 * the label the request asked for (the enrollment itself stores only the session's id).
 */
const toListRow = (classIndex, sessionLabel) => (row) => {
    const placement = describePlacement(classIndex, row);
    return {
        enrollmentId: String(row._id),
        studentId: String(row.student._id),
        name: row.student.name,
        admissionNo: row.student.admissionNo,
        status: row.student.status,
        photoUrl: rowPhoto(row.student),
        fatherName: row.student.fatherName || null,
        motherName: row.student.motherName || null,
        contact: row.student.parentsContact || null,
        // In full (student-fix4.md C) — an operational identifier, not regulated PII.
        card: row.student.cardNumber || null,
        rollNumber: row.rollNumber,
        session: sessionLabel,
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
    // The header's label → this school's AcademicSession id. A label with no session yet has
    // no enrollments against it, so the answer is simply an empty list.
    const [sessionId, studentIds] = await Promise.all([
        findSessionId(adminId, query.session),
        resolveSearchStudentIds(adminId, query.search),
    ]);
    const empty = { rows: [], nextCursor: null, total: 0 };
    if (!sessionId || (studentIds && studentIds.length === 0)) return empty;

    const match = { ...buildEnrollmentMatch(adminId, sessionId, query), ...extraMatch };
    const countMatch = studentIds ? { ...match, studentId: { $in: studentIds } } : match;

    const [page, total, classIndex] = await Promise.all([
        listEnrollmentPage({ match, studentIds, cursor: query.cursor, limit: query.limit, projection: studentProjectionFor(query.fields) }),
        StudentEnrollmentModel.countDocuments(countMatch),
        loadClassIndex(adminId),
    ]);

    return { rows: page.rows.map(toListRow(classIndex, query.session)), nextCursor: page.nextCursor, total };
};

/** One enrollment + its student as a list row — the fresh document a write responds with. */
const loadListRow = async (adminId, enrollmentId, sessionLabel) => {
    const page = await listEnrollmentPage({ match: { adminId, _id: toObjectId(enrollmentId) }, limit: 1 });
    if (!page.rows.length) return null;
    return toListRow(await loadClassIndex(adminId), sessionLabel)(page.rows[0]);
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
registerStudentDeleteStep('fee-records', async ({ dbSession, adminId, studentIds }) => {
    // Payments first (an 'old' admission's opening balance), then the records they hang off.
    const records = await StudentFeeRecordModel.find({ adminId, studentId: { $in: studentIds } }, '_id').session(dbSession).lean();
    if (records.length) {
        await FeePaymentModel.deleteMany({ adminId, studentFeeRecordId: { $in: records.map((record) => record._id) } }, { session: dbSession });
    }
    await StudentFeeRecordModel.deleteMany({ adminId, studentId: { $in: studentIds } }, { session: dbSession });
});
registerStudentDeleteStep('students', async ({ dbSession, adminId, studentIds }) => {
    await StudentProfileModel.deleteMany({ adminId, _id: { $in: studentIds } }, { session: dbSession });
});

// ---------------------------------------------------------------------------------------
// Uniqueness — the unique indexes are the guard; this turns their error into the catalog
// ---------------------------------------------------------------------------------------

// Index key field → the form field it traces to + its errors.md code.
const DUPLICATE_RULES = {
    admissionNo: { field: 'admissionNo', code: 'ADMISSION_NO_DUPLICATE' },
    rollNumber: { field: 'rollNumber', code: 'ROLL_NUMBER_DUPLICATE' },
    aadharNumber: { field: 'aadharNumber', code: 'AADHAR_DUPLICATE' },
    samagraId: { field: 'samagraId', code: 'SAMAGRA_ID_DUPLICATE' },
    penNumber: { field: 'penNumber', code: 'PEN_DUPLICATE' },
    cardNumber: { field: 'cardNumber', code: 'CARD_ALREADY_ASSIGNED' },
};

/** The DUPLICATE_RULES entry a Mongo duplicate-key error collided on, or null. */
const duplicateRuleOf = (error) => {
    if (!error || error.code !== 11000) return null;
    const keys = Object.keys(error.keyPattern || error.keyValue || {});
    const key = keys.find((name) => DUPLICATE_RULES[name]);
    return key ? DUPLICATE_RULES[key] : null;
};

/**
 * Rethrow a duplicate-key error as the catalog's ConflictError — code + message, and the
 * field it traces to so a form shows it inline (error-catalog-conventions.md, shape #2).
 * Two concurrent saves can't both pass a unique index, so this is the real race guard;
 * anything that isn't a known duplicate is rethrown untouched.
 */
const rethrowAsDuplicate = (error) => {
    const rule = duplicateRuleOf(error);
    if (!rule) throw error;
    const message = messages.duplicate[rule.code]();
    throw new ConflictError(message, {
        module: MODULE,
        code: rule.code,
        fields: [{ field: rule.field, code: rule.code, message }],
    });
};

/** Run `work(dbSession)` in a transaction and always end the session. */
// Shared with Academic Setup (helpers/with-transaction.js); re-exported for this module's callers.
const { withTransaction } = require('../with-transaction');

module.exports = {
    MODULE,
    VERIFY_MODES,
    toObjectId,
    sameId,
    escapeRegex,
    titleCase,
    getNextSession,
    loadClasses,
    loadSubjectGroups,
    loadClassIndex,
    describePlacement,
    resolvePlacement,
    resolveSearchStudentIds,
    buildEnrollmentMatch,
    listEnrollmentPage,
    listStudentRows,
    loadListRow,
    studentProjectionFor,
    registerStudentDeleteStep,
    registerPromotionStep,
    promotionLookups,
    setPromotionLookup,
    runStudentDeleteCascade,
    runPromotionSteps,
    withTransaction,
    DUPLICATE_RULES,
    duplicateRuleOf,
    rethrowAsDuplicate,
};
