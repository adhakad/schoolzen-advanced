'use strict';
const mongoose = require('mongoose');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const SubjectModel = require('../../models/academic-setup/subject');
const AcademicClassModel = require('../../models/academic-setup/class');
const { NotFoundError, ConflictError, ValidationError } = require('../../errors');
const { getClassDisplayName } = require('../../helpers/format-class-name');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/academic-setup.messages');

const MODULE = 'academic-setup';
const ENTITY = 'Subject group';

// Subject Groups — a named bundle of subjects for one class, or for one stream of one class.
//
// The whole page is TWO reads: the list (one aggregation, below) and the form options (one
// call carrying both the classes and the subjects). No page in this app stitches two
// responses together in the browser — that was a confirmed real anti-pattern in the legacy
// codebase and database-design-principles.md rules it out explicitly.

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Collection names come from the models rather than being written out, so a pluralisation
// that mongoose decides can never silently disagree with a $lookup string here.
const CLASS_COLLECTION = AcademicClassModel.collection.name;
const SUBJECT_COLLECTION = SubjectModel.collection.name;

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const buildMatch = (req) => {
    const match = { adminId: req.query.adminId };

    // Both filters are optional and narrow independently: the toolbar shows every group by
    // default and only narrows from there.
    if (req.query.classId) match.classId = toObjectId(req.query.classId);
    if (req.query.streamId) match.streamId = toObjectId(req.query.streamId);

    const search = (req.query.search || '').trim();
    if (search) match.name = { $regex: escapeRegExp(search), $options: 'i' };

    return match;
};

// Resolves each row's Class and Stream names from the class document, and its subject tags
// from the subject documents — in the SAME aggregation as the rows themselves.
//
// This is the reason classId/streamId/subjectIds are references and not copied strings: a
// renamed subject or stream shows through here on the next read, with no migration and no
// stale duplicate to find.
const LOOKUP_STAGES = [
    {
        $lookup: {
            from: CLASS_COLLECTION,
            localField: 'classId',
            foreignField: '_id',
            as: 'classDoc',
        },
    },
    { $unwind: { path: '$classDoc', preserveNullAndEmptyArrays: true } },
    {
        $lookup: {
            from: SUBJECT_COLLECTION,
            localField: 'subjectIds',
            foreignField: '_id',
            as: 'subjectDocs',
        },
    },
    {
        $project: {
            name: 1,
            classId: 1,
            streamId: 1,
            // The raw class NUMBER, rendered through ClassSuffixPipe on the frontend —
            // the same value student.class and every other class-keyed collection holds.
            class: '$classDoc.class',
            hasStreams: '$classDoc.hasStreams',
            // The one entry of the class's streams[] this group belongs to. $filter, not a
            // second lookup: the streams live inside the class document already.
            stream: {
                $first: {
                    $filter: {
                        input: { $ifNull: ['$classDoc.streams', []] },
                        as: 'stream',
                        cond: { $eq: ['$$stream._id', '$streamId'] },
                    },
                },
            },
            subjects: {
                $map: {
                    input: '$subjectDocs',
                    as: 'subject',
                    in: { _id: '$$subject._id', name: '$$subject.name' },
                },
            },
        },
    },
];

// $lookup does not preserve the order of the localField array, so the tags would come back
// in whatever order the index handed them over. Sorting here (linear per row, on at most a
// page of rows) keeps the chips stable between reads.
const shapeRow = (row) => ({
    _id: row._id,
    name: row.name,
    classId: row.classId,
    class: row.class,
    hasStreams: !!row.hasStreams,
    streamId: row.streamId,
    streamName: row.stream ? row.stream.name : null,
    subjects: (row.subjects || []).sort((a, b) => a.name.localeCompare(b.name)),
});

// The page's single read: a page of rows with their class/stream/subject names resolved,
// the total behind the current filter, and the side card's three counts.
let GetSubjectGroups = async (req, res, next) => {
    const match = buildMatch(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));

    const [result] = await SubjectGroupModel.aggregate([
        { $match: { adminId: req.query.adminId } },
        {
            $facet: {
                rows: [
                    { $match: match },
                    { $sort: { createdAt: -1 } },
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                    ...LOOKUP_STAGES,
                ],
                filteredTotal: [
                    { $match: match },
                    { $count: 'value' },
                ],
                // School-wide, independent of the toolbar's filters — "Classes Covered"
                // means how many classes have a group at all, not how many match a filter.
                counts: [
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            classIds: { $addToSet: '$classId' },
                            // null is a real value here (a class with no streams), so it
                            // has to be filtered out rather than counted as a stream.
                            streamIds: { $addToSet: '$streamId' },
                        },
                    },
                ],
            },
        },
    ]);

    const counts = (result && result.counts[0]) || {};
    const streamIds = (counts.streamIds || []).filter((id) => id);

    return res.status(200).json({
        rows: ((result && result.rows) || []).map(shapeRow),
        total: (result && result.filteredTotal[0] && result.filteredTotal[0].value) || 0,
        page: page,
        limit: limit,
        summary: {
            total: counts.total || 0,
            classesCovered: (counts.classIds || []).length,
            streamsCovered: streamIds.length,
        },
    });
};

// Everything both the toolbar's filters and the Add/Edit modal need, in ONE call:
//   - the school's configured classes, each carrying its own streams, so picking a class
//     populates the Stream dropdown with no second request;
//   - every ACTIVE subject, for the modal's checklist.
//
// The checklist is therefore LIVE: deactivate a subject and it stops being offered for new
// groups immediately; rename one and the new name shows on the next open. That is exactly
// what subject-groups.md means by "this checklist must always reflect the current Subjects
// list, never a stale copy".
let GetFormOptions = async (req, res, next) => {
    const adminId = req.query.adminId;

    const [classes, subjects] = await Promise.all([
        AcademicClassModel
            // streams._id is listed EXPLICITLY. Projecting only `streams.name` returns the
            // sub-documents without their _id — MongoDB's automatic _id inclusion applies to
            // the top-level document only, never to an embedded array's elements. Dropping it
            // here left every Stream option in the UI with an undefined value, so picking
            // "Science" sent no stream at all and the save came back "12th has streams, so
            // this group must belong to one of them" while the dropdown still read Science.
            .find({ adminId: adminId }, 'class hasStreams streams.name streams._id')
            .sort({ class: 1 })
            .lean(),
        SubjectModel
            .find({ adminId: adminId, status: 'active' }, 'name type')
            .sort({ name: 1 })
            .lean(),
    ]);

    return res.status(200).json({
        classes: classes.map((item) => ({
            _id: item._id,
            class: item.class,
            label: getClassDisplayName(item.class),
            hasStreams: !!item.hasStreams,
            streams: (item.streams || []).map((stream) => ({ _id: stream._id, name: stream.name })),
        })),
        subjects: subjects,
    });
};

// The half of the stream rule Joi cannot check, because it depends on the Class document:
// a class WITH streams must have one chosen, a class without must not, and a chosen stream
// must actually belong to that class.
const resolveClassAndStream = async (adminId, classId, streamId) => {
    const classDoc = await AcademicClassModel
        .findOne({ _id: classId, adminId: adminId }, 'class hasStreams streams._id')
        .lean();

    if (!classDoc) {
        throw new NotFoundError(messages.classNotFound(), {
            module: MODULE,
            context: { classId: classId },
        });
    }

    const className = getClassDisplayName(classDoc.class);

    if (classDoc.hasStreams && !streamId) {
        throw new ValidationError(messages.streamRequired(className), {
            module: MODULE,
            fields: [{ field: 'streamId', message: messages.streamRequired(className) }],
        });
    }

    if (!classDoc.hasStreams && streamId) {
        throw new ValidationError(messages.streamNotAllowed(className), {
            module: MODULE,
            fields: [{ field: 'streamId', message: messages.streamNotAllowed(className) }],
        });
    }

    if (streamId) {
        const belongs = (classDoc.streams || []).some(
            (stream) => String(stream._id) === String(streamId)
        );
        if (!belongs) {
            throw new ValidationError(messages.streamNotInClass(), {
                module: MODULE,
                fields: [{ field: 'streamId', message: messages.streamNotInClass() }],
            });
        }
    }

    return classDoc;
};

// Every selected subject must still exist and belong to this school — a checklist held open
// while someone else deletes a subject would otherwise write a dangling reference.
const assertSubjectsExist = async (adminId, subjectIds) => {
    if (!subjectIds.length) return;

    const found = await SubjectModel
        .countDocuments({ _id: { $in: subjectIds }, adminId: adminId });

    if (found !== subjectIds.length) {
        throw new ValidationError(messages.subjectsNotFound(subjectIds.length - found), {
            module: MODULE,
            fields: [{ field: 'subjectIds', message: messages.subjectsNotFound(subjectIds.length - found) }],
        });
    }
};

// As on Subjects, the unique index is the real guard and this only exists so the message can
// name the group. Same collation as the index, or a differently-cased duplicate would pass
// here and be rejected by the write.
const assertNameFree = async (adminId, classId, streamId, name, excludeId) => {
    const query = { adminId: adminId, classId: classId, streamId: streamId || null, name: name };
    if (excludeId) query._id = { $ne: excludeId };

    const existing = await SubjectGroupModel
        .findOne(query)
        .collation({ locale: 'en', strength: 2 })
        .lean();

    if (existing) {
        throw new ConflictError(messages.groupAlreadyExists(name), {
            module: MODULE,
            context: { name: name, classId: classId },
        });
    }
};

let CreateSubjectGroup = async (req, res, next) => {
    const { adminId, classId, streamId, name, subjectIds } = req.body;

    await resolveClassAndStream(adminId, classId, streamId);
    await assertSubjectsExist(adminId, subjectIds);
    await assertNameFree(adminId, classId, streamId, name);

    await SubjectGroupModel.create({
        adminId: adminId,
        classId: classId,
        streamId: streamId || null,
        name: name,
        subjectIds: subjectIds,
    });

    return res.status(200).json({ message: success.created(ENTITY) });
};

// The modal always submits the group's whole state, so this replaces the subject list
// outright rather than merging into it — a subject the admin unchecked has to actually go,
// which a merge would never do.
let UpdateSubjectGroup = async (req, res, next) => {
    const { adminId, classId, streamId, name, subjectIds } = req.body;

    const group = await SubjectGroupModel.findOne({ _id: req.params.id, adminId: adminId });
    if (!group) {
        throw new NotFoundError(messages.groupNotFound(), {
            module: MODULE,
            context: { id: req.params.id },
        });
    }

    await resolveClassAndStream(adminId, classId, streamId);
    await assertSubjectsExist(adminId, subjectIds);
    await assertNameFree(adminId, classId, streamId, name, group._id);

    group.classId = classId;
    group.streamId = streamId || null;
    group.name = name;
    group.subjectIds = subjectIds;
    await group.save();

    return res.status(200).json({ message: success.updated(ENTITY) });
};

// Hard delete, one deleteMany for the whole selection. A group is configuration, and the
// students on it are the blast radius the confirmation names — nothing in this collection
// is a record of something that happened, so there is no soft-delete flag.
let BulkDeleteSubjectGroups = async (req, res, next) => {
    const { adminId, ids } = req.body;

    const found = await SubjectGroupModel
        .countDocuments({ _id: { $in: ids }, adminId: adminId });

    if (found !== ids.length) {
        throw new NotFoundError(messages.groupNotFound(), {
            module: MODULE,
            context: { requested: ids.length, found: found },
        });
    }

    await SubjectGroupModel.deleteMany({ _id: { $in: ids }, adminId: adminId });

    return res.status(200).json({
        message: success.bulkProcessed(ids.length, 'subject group'),
    });
};

module.exports = {
    GetSubjectGroups,
    GetFormOptions,
    CreateSubjectGroup,
    UpdateSubjectGroup,
    BulkDeleteSubjectGroups,
};
