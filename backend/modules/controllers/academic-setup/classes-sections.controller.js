'use strict';
const AcademicClassModel = require('../../models/academic-setup/class');
const ClassModel = require('../../models/class');
const StudentModel = require('../../models/student');
const { NotFoundError, ConflictError } = require('../../errors');
const { getClassDisplayName } = require('../../helpers/format-class-name');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/academic-setup.messages');

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
// This is the fallback for a school whose GLOBAL `class` collection has not been seeded —
// without it the Add Class dropdown comes back empty and the page cannot be used at all,
// which is not a state the admin can fix from here.
const STANDARD_CLASSES = [200, 201, 202, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// INTERNAL — how many students sit in each class and each stream, for the whole school.
//
// ONE grouped aggregation for the entire page, never a count query per row: a school with
// fifteen classes would otherwise cost fifteen round-trips to render one screen (the same
// reasoning as holiday-template's getAssignedCounts).
//
// `session` is optional. The class/stream/section STRUCTURE is session-independent — a
// school runs 11th Science whichever year it is — but the head-counts beside it are not,
// so the header's session selector narrows this aggregation and leaves everything else
// alone. Omitting it counts every session, which is what legacy countStudent /
// GetStudentPagination do.
const getStudentCounts = async (adminId, session) => {
    const match = { adminId: adminId };
    if (session) match.session = session;

    const groups = await StudentModel.aggregate([
        { $match: match },
        { $group: { _id: { class: '$class', stream: '$stream' }, total: { $sum: 1 } } },
    ]);

    // byClass: '11' -> 98        byStream: '11::science' -> 42
    const byClass = new Map();
    const byStream = new Map();

    for (const group of groups) {
        const classKey = String(group._id.class);
        byClass.set(classKey, (byClass.get(classKey) || 0) + group.total);

        // 'n/a' is the sentinel a class below 11 stores; it is not a real stream.
        const stream = String(group._id.stream || '').toLowerCase();
        if (stream && stream !== 'n/a') {
            const streamKey = classKey + '::' + stream;
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

    const [classList, counts] = await Promise.all([
        AcademicClassModel.find({ adminId: adminId }).sort({ class: 1 }).lean(),
        getStudentCounts(adminId, session),
    ]);

    const withCounts = classList.map((item) => {
        const classKey = String(item.class);
        return {
            ...item,
            studentCount: counts.byClass.get(classKey) || 0,
            streams: (item.streams || []).map((stream) => ({
                ...stream,
                studentCount: counts.byStream.get(classKey + '::' + stream.name) || 0,
            })),
        };
    });

    return res.status(200).json(withCounts);
};

// The standard class names for the modal's dropdown, minus the ones this school has
// already configured — a class is configured once, and the unique index would reject a
// second attempt anyway.
//
// Reads the GLOBAL models/class.js collection, which is the existing master list of
// standard names every school picks from. Read-only: nothing here writes to it. When that
// collection is empty (a database where nobody has opened the legacy Class page yet) it
// falls back to STANDARD_CLASSES, so this page never hands the admin an empty dropdown and
// no legacy row has to be created to make the new page usable.
let GetClassNameOptions = async (req, res, next) => {
    const adminId = req.query.adminId;

    const [standardClasses, configured] = await Promise.all([
        ClassModel.find({}).lean(),
        AcademicClassModel.find({ adminId: adminId }, 'class').lean(),
    ]);

    const fromMaster = standardClasses
        .map((item) => Number(item.class))
        .filter((value) => Number.isFinite(value));

    const taken = new Set(configured.map((item) => Number(item.class)));

    const options = (fromMaster.length ? fromMaster : STANDARD_CLASSES)
        .filter((value) => !taken.has(value))
        .sort((a, b) => a - b)
        .map((value) => ({ class: value, label: getClassDisplayName(value) }))
        .filter((option) => option.label);

    return res.status(200).json(options);
};

let CreateClass = async (req, res, next) => {
    const { adminId, class: className } = req.body;

    const existing = await AcademicClassModel.findOne({ adminId: adminId, class: className });
    if (existing) {
        throw new ConflictError(messages.classAlreadySetUp(getClassDisplayName(className)), {
            module: MODULE,
            context: { class: className },
        });
    }

    await AcademicClassModel.create(req.body);
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

    singleClass.hasStreams = req.body.hasStreams;
    singleClass.sections = req.body.sections;
    singleClass.streams = req.body.streams;
    await singleClass.save();

    return res.status(200).json({ message: success.updated(ENTITY) });
};

// Hard delete, no soft flag and no grace period: this is configuration, not a record of
// something that happened. The class's streams and sections live in the same document and
// go with it.
//
// The students in the class are the real blast radius, so a class that has any requires an
// explicit `confirmed` — a server-side backstop for the type-to-confirm rule, so calling
// the API directly can't skip what the UI insists on. Legacy rows keyed on the same class
// number (class-subject, fees-structure, class-shift) belong to the old stack and are
// deliberately left untouched.
let DeleteClass = async (req, res, next) => {
    const adminId = req.query.adminId || req.body.adminId;

    const singleClass = await AcademicClassModel.findOne({ _id: req.params.id, adminId: adminId });
    if (!singleClass) {
        throw new NotFoundError(messages.classNotFound(), { module: MODULE, context: { id: req.params.id } });
    }

    const confirmed = req.query.confirmed === 'true' || req.body.confirmed === true;
    if (!confirmed) {
        const studentCount = await StudentModel.countDocuments({ adminId: adminId, class: singleClass.class });
        if (studentCount > 0) {
            throw new ConflictError(
                messages.classHasStudents(studentCount, getClassDisplayName(singleClass.class)),
                { module: MODULE, context: { id: req.params.id, studentCount, requiresConfirmation: true } }
            );
        }
    }

    await AcademicClassModel.deleteOne({ _id: req.params.id, adminId: adminId });
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

// "Delete Selected" — the whole selection in ONE request and ONE deleteMany, never a delete
// call per checked row (performance-principles.md).
//
// Same blast-radius rule as the single delete, asked once for the whole set: one grouped
// count tells us how many students sit in any of the selected classes, and a non-zero answer
// requires an explicit `confirmed`. The reason the count is done here rather than trusted
// from the list response is that the UI's copy of it can be minutes old by the time someone
// types DELETE.
let BulkDeleteClasses = async (req, res, next) => {
    const { adminId, ids, confirmed } = req.body;

    const classes = await AcademicClassModel
        .find({ _id: { $in: ids }, adminId: adminId }, 'class')
        .lean();

    if (classes.length !== ids.length) {
        throw new NotFoundError(messages.classNotFound(), {
            module: MODULE,
            context: { requested: ids.length, found: classes.length },
        });
    }

    if (!confirmed) {
        const studentCount = await StudentModel.countDocuments({
            adminId: adminId,
            class: { $in: classes.map((item) => item.class) },
        });

        if (studentCount > 0) {
            throw new ConflictError(messages.classesHaveStudents(studentCount), {
                module: MODULE,
                context: { studentCount: studentCount, requiresConfirmation: true },
            });
        }
    }

    await AcademicClassModel.deleteMany({ _id: { $in: ids }, adminId: adminId });

    return res.status(200).json({ message: success.bulkProcessed(ids.length, ENTITY.toLowerCase()) });
};

module.exports = {
    GetClasses,
    GetClassNameOptions,
    CreateClass,
    UpdateClass,
    DeleteClass,
    BulkDeleteClasses,
};
