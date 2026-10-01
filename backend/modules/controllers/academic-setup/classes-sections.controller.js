'use strict';
const AcademicClassModel = require('../../models/academic-setup/class');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const StudentProfileModel = require('../../models/student/student');
const { withTransaction } = require('../../helpers/with-transaction');
const { findSessionId } = require('../../helpers/academic-session/session-resolver');
const { classOrderOf, byClassOrder } = require('../../helpers/academic-setup/class-order');
const { planStructure, assertFlatSectionsRemovable, syncClassGroups, classHasStreams } = require('../../helpers/academic-setup/class-structure');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { getClassDisplayName } = require('../../helpers/format-class-name');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/academic-setup.messages');
const cacheInvalidation = require('../../helpers/academic-setup/cache-invalidation');
const { classDuplicate, rethrowDuplicate } = require('../../helpers/academic-setup/duplicate-key');
const { classBlockingCounts, uniqueIds, bulkDeleteBody } = require('../../helpers/academic-setup/dependents');

const MODULE = 'academic-setup';
const ENTITY = 'Class';

// Classes & Sections — a school's own class/stream/section configuration.
//
// Error style differs from the legacy controllers on purpose. These handlers throw typed
// errors from modules/errors/ and let express-async-errors + the errorHandler shape the
// response; there is no `catch -> res.status(500).json('Internal Server Error!')` here.
// That contract is exactly what the error-handling foundation was built for, and this is
// its first consumer. Legacy controllers keep their own style.
//
// Success messages follow the same rule from the other direction: every one comes from
// helpers/messages/, never a string literal at the res.json() call site.

// The standard class names every school picks from: Nursery/LKG/UKG (the 200/201/202
// sentinels the whole codebase uses) followed by 1-12.
//
// This is THE master list for the Add Class dropdown. It used to be read from the legacy
// GLOBAL `class` collection (models/class.js), falling back to this list when that was
// empty — but a v2 page must never read a legacy school-management collection
// (database-design-principles.md §0), so the list lives here instead.
const STANDARD_CLASSES = [200, 201, 202, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// INTERNAL — how many students sit in each class and each stream, for the whole school.
//
// ONE grouped aggregation for the entire page, never a count query per row: a school with
// fifteen classes would otherwise cost fifteen round-trips to render one screen (the same
// reasoning as holiday-template's getAssignedCounts).
//
// Counts v2 StudentEnrollment placements ONLY — never the legacy `student` collection
// (database-design-principles.md §0). Keyed on the ids the enrollment stores (classId,
// streamId), not a class number or stream name, so a renamed stream keeps its count.
//
// The class/stream/section STRUCTURE is session-independent — a school runs 11th Science
// whichever year it is — but the head-counts beside it are not: a student has one
// enrollment per session, so the header's session label is resolved to this school's
// AcademicSession id and the counts are for that session alone. A label this school has no
// session for (or no label at all) has no enrollments against it — every count is 0.
const getStudentCounts = async (adminId, session) => {
    // byClass: '<classId>' -> 98        byStream: '<streamId>' -> 42
    const byClass = new Map();
    const byStream = new Map();

    const sessionId = session ? await findSessionId(adminId, session) : null;
    if (!sessionId) return { byClass, byStream };

    const groups = await StudentEnrollmentModel.aggregate([
        { $match: { adminId: adminId, sessionId: sessionId } },
        { $group: { _id: { classId: '$classId', streamId: '$streamId' }, total: { $sum: 1 } } },
    ]);

    for (const group of groups) {
        const classKey = String(group._id.classId);
        byClass.set(classKey, (byClass.get(classKey) || 0) + group.total);

        if (group._id.streamId) {
            const streamKey = String(group._id.streamId);
            byStream.set(streamKey, (byStream.get(streamKey) || 0) + group.total);
        }
    }

    return { byClass, byStream };
};

// The page's single read: every configured class, each carrying the student counts the
// table column, the delete confirmation and the modal's removal guard all need. Nothing
// else has to ask the server how many students an edit would strand.
let GetClasses = async (req, res, next) => {
    const adminId = req.query.adminId;
    const session = req.query.session;

    const [classList, counts, groups] = await Promise.all([
        AcademicClassModel.find({ adminId: adminId }).lean(),
        getStudentCounts(adminId, session),
        SubjectGroupModel.find({ adminId: adminId }, 'classId streamId name subjectIds isSystemGroup').sort({ createdAt: 1 }).lean(),
    ]);

    // Each stream's groups ride along: the Edit modal pre-fills its inline Groups sub-block
    // from them, and a stream with none gets the "No group — Admission blocked" badge.
    const groupsByStream = new Map();
    groups.filter((group) => group.streamId).forEach((group) => {
        const key = String(group.streamId);
        if (!groupsByStream.has(key)) groupsByStream.set(key, []);
        groupsByStream.get(key).push({ _id: group._id, name: group.name, subjectIds: group.subjectIds || [] });
    });

    // Each row's delete-blocking count — students placed in the class in ANY session plus
    // students first enrolled in it, exactly what the delete guard (CLASS_HAS_STUDENTS)
    // counts. Unlike `studentCount` (this session only), so the confirmation can show the
    // real number before anyone types DELETE. One grouped aggregation per collection.
    const blocking = await classBlockingCounts(adminId, classList.map((item) => item._id));

    // Class.order — Nursery → 12th — never insertion order or alphabetical.
    const withCounts = classList.sort(byClassOrder).map((item) => {
        return {
            ...item,
            studentCount: counts.byClass.get(String(item._id)) || 0,
            blockingCount: blocking.get(String(item._id)) || 0,
            streams: (item.streams || []).map((stream) => {
                const streamGroups = groupsByStream.get(String(stream._id)) || [];
                return {
                    ...stream,
                    groups: streamGroups,
                    groupCount: streamGroups.length,
                    studentCount: counts.byStream.get(String(stream._id)) || 0,
                };
            }),
        };
    });

    return res.status(200).json(withCounts);
};

// The standard class names for the modal's dropdown, minus the ones this school has
// already configured — a class is configured once, and the unique index would reject a
// second attempt anyway.
//
// The master list is STANDARD_CLASSES — never the legacy global `class` collection.
let GetClassNameOptions = async (req, res, next) => {
    const adminId = req.query.adminId;

    const configured = await AcademicClassModel.find({ adminId: adminId }, 'class').lean();

    const taken = new Set(configured.map((item) => Number(item.class)));

    const options = STANDARD_CLASSES
        .filter((value) => !taken.has(value))
        .sort((a, b) => classOrderOf(a) - classOrderOf(b))
        .map((value) => ({ class: value, label: getClassDisplayName(value) }))
        .filter((option) => option.label);

    return res.status(200).json(options);
};

// hasStreams is DERIVED from the class number — On for 11th/12th, Off for everything else
// (classes-sections.md) — never taken from the client. A payload that disagrees is rejected
// rather than silently reshaped, since its sections/streams were built for the wrong half.
const resolveHasStreams = (className, body) => {
    const hasStreams = classHasStreams(className);
    if (Boolean(body.hasStreams) !== hasStreams) {
        const message = hasStreams
            ? `${getClassDisplayName(className)} always has streams — add its streams and their sections.`
            : 'Streams apply only to 11th and 12th — add sections to this class directly.';
        throw new ValidationError(message, {
            module: MODULE,
            code: 'CLASS_STRUCTURE_MISMATCH',
            fields: [{ field: 'streams', message }],
        });
    }
    return hasStreams;
};

let CreateClass = async (req, res, next) => {
    const { adminId, class: className } = req.body;
    const hasStreams = resolveHasStreams(className, req.body);

    // Fast-path message only — the (adminId, class) unique index is the real guard, and a
    // concurrent create that slips past this comes back from the write below as E11000.
    const existing = await AcademicClassModel.findOne({ adminId: adminId, class: className });
    if (existing) throw classDuplicate(className);

    // The class and its subject groups in ONE transaction: a streamed class never exists
    // without its (mandatory) groups, a non-streamed one never without its "General" group.
    const plan = planStructure(null, req.body);
    await withTransaction(async (dbSession) => {
        const [created] = await AcademicClassModel.create([{
            adminId,
            class: className,
            order: classOrderOf(className),
            hasStreams,
            sections: plan.sections,
            streams: plan.streams,
        }], { session: dbSession });
        await syncClassGroups({ dbSession, adminId, classId: created._id, hasStreams: created.hasStreams, groupsByStream: plan.groupsByStream });
    }).catch((error) => rethrowDuplicate(error, () => classDuplicate(className)));
    // Write-through: other modules read this school's classes and groups from the cache.
    await Promise.all([cacheInvalidation.onClassesChanged(adminId), cacheInvalidation.onSubjectGroupsChanged(adminId)]);
    return res.status(200).json({ message: success.created(ENTITY) });
};

// The modal always submits the class's whole configuration, so this replaces the
// stream/section tree outright rather than patching into it — a stream the admin removed
// has to actually disappear, which a merge would never do.
let UpdateClass = async (req, res, next) => {
    const singleClass = await AcademicClassModel.findOne({
        _id: req.params.id,
        adminId: req.body.adminId,
    });
    // "Exists but belongs to another school" is reported as not-found, never as forbidden.
    if (!singleClass) {
        throw new NotFoundError(messages.classNotFound(), { module: MODULE, context: { id: req.params.id } });
    }

    // The class number can't change on edit, so neither can whether it has streams.
    const hasStreams = resolveHasStreams(singleClass.class, req.body);
    // An 11th/12th saved before streams were mandatory would lose its flat sections here.
    await assertFlatSectionsRemovable(req.body.adminId, singleClass, hasStreams, req.body.confirmRemoveSections);

    // Existing sections/streams KEEP their ids (helpers/academic-setup/class-structure.js):
    // every enrollment, subject group and fee structure points at them.
    const plan = planStructure(singleClass.toObject(), req.body);
    await withTransaction(async (dbSession) => {
        await AcademicClassModel.updateOne({ _id: singleClass._id, adminId: req.body.adminId }, {
            $set: {
                hasStreams,
                order: classOrderOf(singleClass.class),
                sections: plan.sections,
                streams: plan.streams,
            },
        }, { session: dbSession });
        await syncClassGroups({ dbSession, adminId: req.body.adminId, classId: singleClass._id, hasStreams, groupsByStream: plan.groupsByStream });
        // The class number never changes here, so an E11000 can only be a duplicate group
        // name within one stream — rethrowDuplicate reads which index fired.
    }).catch((error) => rethrowDuplicate(error));
    await Promise.all([cacheInvalidation.onClassesChanged(req.body.adminId), cacheInvalidation.onSubjectGroupsChanged(req.body.adminId)]);

    return res.status(200).json({ message: success.updated(ENTITY) });
};

// Hard delete, no soft flag and no grace period: this is configuration, not a record of
// something that happened. The class's streams and sections live in the same document and
// go with it.
//
// HARD BLOCK when any student depends on the class (classes-sections.md): a StudentEnrollment
// (any session) or a Student.admissionClass (First Enrolled Class) holds this class's id,
// and the app has no "unknown class" state to show for a dangling one. No `confirmed`
// override — the students have to be moved first. A class with no dependents deletes with
// its subject groups (streamed ones and the automatic "General") in one transaction.
// Legacy rows keyed on the class number belong to the old stack and are left untouched.
const countDependents = (adminId, classIds) => Promise.all([
    StudentEnrollmentModel.countDocuments({ adminId, classId: { $in: classIds } }),
    StudentProfileModel.countDocuments({ adminId, admissionClass: { $in: classIds } }),
]).then(([placed, firstEnrolled]) => placed + firstEnrolled);

const deleteClassesWithGroups = (adminId, classIds) => withTransaction(async (dbSession) => {
    await SubjectGroupModel.deleteMany({ adminId, classId: { $in: classIds } }, { session: dbSession });
    await AcademicClassModel.deleteMany({ adminId, _id: { $in: classIds } }, { session: dbSession });
});

let DeleteClass = async (req, res, next) => {
    const adminId = req.query.adminId || req.body.adminId;

    const singleClass = await AcademicClassModel.findOne({ _id: req.params.id, adminId: adminId });
    if (!singleClass) {
        throw new NotFoundError(messages.classNotFound(), { module: MODULE, context: { id: req.params.id } });
    }

    const studentCount = await countDependents(adminId, [singleClass._id]);
    if (studentCount > 0) {
        throw new ConflictError(messages.classBlockedByStudents(studentCount, getClassDisplayName(singleClass.class)), {
            module: MODULE,
            code: 'CLASS_HAS_STUDENTS',
            context: { id: req.params.id, studentCount },
        });
    }

    await deleteClassesWithGroups(adminId, [singleClass._id]);
    await Promise.all([cacheInvalidation.onClassesChanged(adminId), cacheInvalidation.onSubjectGroupsChanged(adminId)]);
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

// "Delete Selected" — the whole selection in ONE request and ONE deleteMany, never a delete
// call per checked row (performance-principles.md).
//
// Same hard block as the single delete, asked once for the whole set with ONE grouped count
// per dependent collection. The count is done here rather than trusted from the list
// response because the UI's copy of it can be minutes old by the time someone types DELETE.
//
// Per-row outcome, never one pass/fail for the whole selection: each requested id comes
// back deleted / blocked (CLASS_HAS_STUDENTS, with its count) / not_found (missing or
// another school's — reported identically). The free classes go in one transaction.
let BulkDeleteClasses = async (req, res, next) => {
    const adminId = req.body.adminId;
    const ids = uniqueIds(req.body.ids);

    const [classes, blocking] = await Promise.all([
        AcademicClassModel.find({ _id: { $in: ids }, adminId: adminId }, '_id').lean(),
        classBlockingCounts(adminId, ids),
    ]);
    const foundIds = new Set(classes.map((item) => String(item._id)));

    const results = ids.map((id) => {
        if (!foundIds.has(id)) return { id, status: 'not_found', code: 'NOT_FOUND' };
        const blockingCount = blocking.get(id) || 0;
        if (blockingCount > 0) return { id, status: 'blocked', code: 'CLASS_HAS_STUDENTS', blockingCount };
        return { id, status: 'deleted', blockingCount: 0 };
    });

    const deletable = results.filter((row) => row.status === 'deleted').map((row) => row.id);
    if (deletable.length) {
        await deleteClassesWithGroups(adminId, deletable);
        await Promise.all([cacheInvalidation.onClassesChanged(adminId), cacheInvalidation.onSubjectGroupsChanged(adminId)]);
    }

    return res.status(200).json(bulkDeleteBody(results, ENTITY.toLowerCase()));
};

module.exports = {
    GetClasses,
    GetClassNameOptions,
    CreateClass,
    UpdateClass,
    DeleteClass,
    BulkDeleteClasses,
};
