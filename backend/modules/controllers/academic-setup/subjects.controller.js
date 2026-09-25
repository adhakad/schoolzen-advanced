'use strict';
const SubjectModel = require('../../models/academic-setup/subject');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const { NotFoundError, ConflictError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/academic-setup.messages');

const MODULE = 'academic-setup';
const ENTITY = 'Subject';

// Subjects — the school-wide master list the Subject Groups checklist is built from.
//
// Same contract as classes-sections.controller.js: typed throws from modules/errors/, every
// success string from helpers/messages/, no `catch -> res.status(500).json(...)`.

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Escape before a value the admin typed goes into a RegExp, or a search for "C++" throws
// and a search for ".*" scans the whole collection.
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildMatch = (adminId, search) => {
    const match = { adminId: adminId };
    if (search) match.name = { $regex: escapeRegExp(search.trim()), $options: 'i' };
    return match;
};

// The page's single read: one page of rows, the total behind it, AND the side card's four
// counts — in ONE aggregation.
//
// $facet is what makes that one round-trip. The counts deliberately ignore the search box:
// "Total Subjects" means the school's total, not "total matching what I just typed", so
// that branch runs off its own unfiltered $match.
let GetSubjects = async (req, res, next) => {
    const adminId = req.query.adminId;
    const search = req.query.search || '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));

    // The same collation the (adminId, name) unique index carries — without it the
    // sort cannot use that index, and "hindi" would sort away from "Hindi".
    const [result] = await SubjectModel.aggregate([
        { $match: { adminId: adminId } },
        {
            $facet: {
                // The table. Projected down to the fields the row actually shows, never the
                // whole document (performance-principles.md).
                rows: [
                    { $match: buildMatch(adminId, search) },
                    { $sort: { name: 1 } },
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                    { $project: { name: 1, type: 1, status: 1 } },
                ],
                // How many rows the current filter has, for the pagination bar.
                filteredTotal: [
                    { $match: buildMatch(adminId, search) },
                    { $count: 'value' },
                ],
                // The side card. School-wide, independent of the search box.
                counts: [
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            core: { $sum: { $cond: [{ $eq: ['$type', 'core'] }, 1, 0] } },
                            elective: { $sum: { $cond: [{ $eq: ['$type', 'elective'] }, 1, 0] } },
                            inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
                        },
                    },
                ],
            },
        },
    ]).collation({ locale: 'en', strength: 2 });

    const counts = (result && result.counts[0]) || {};

    return res.status(200).json({
        rows: (result && result.rows) || [],
        total: (result && result.filteredTotal[0] && result.filteredTotal[0].value) || 0,
        page: page,
        limit: limit,
        summary: {
            total: counts.total || 0,
            core: counts.core || 0,
            elective: counts.elective || 0,
            inactive: counts.inactive || 0,
        },
    });
};

// The unique index is the real guard; this pre-check exists only so the message can name the
// subject that collided instead of surfacing a driver-level duplicate-key error. The
// collation has to match the index's, or "hindi" would pass here and then be rejected by
// the write.
const assertNameFree = async (adminId, name, excludeId) => {
    const query = { adminId: adminId, name: name };
    if (excludeId) query._id = { $ne: excludeId };

    const existing = await SubjectModel
        .findOne(query)
        .collation({ locale: 'en', strength: 2 })
        .lean();

    if (existing) {
        throw new ConflictError(messages.subjectAlreadyExists(name), {
            module: MODULE,
            context: { name: name },
        });
    }
};

let CreateSubject = async (req, res, next) => {
    const { adminId, name } = req.body;

    await assertNameFree(adminId, name);
    await SubjectModel.create(req.body);

    return res.status(200).json({ message: success.created(ENTITY) });
};

let UpdateSubject = async (req, res, next) => {
    const { adminId, name, type, status } = req.body;

    const subject = await SubjectModel.findOne({ _id: req.params.id, adminId: adminId });
    // "Exists but belongs to another school" is reported as not-found, never as forbidden.
    if (!subject) {
        throw new NotFoundError(messages.subjectNotFound(), {
            module: MODULE,
            context: { id: req.params.id },
        });
    }

    await assertNameFree(adminId, name, subject._id);

    subject.name = name;
    subject.type = type;
    subject.status = status;
    await subject.save();

    return res.status(200).json({ message: success.updated(ENTITY) });
};

// One request for the whole selection, one deleteMany — never a delete call per checked row
// (performance-principles.md).
//
// Hard delete: a Subject is configuration, not a record of something that happened
// (database-design-principles.md). Deactivating is the soft option and it already exists as
// a status, which is why there is no `deletedAt` here.
//
// The blast radius is the Subject Groups that include any of these subjects, so a delete
// that would leave a group short requires an explicit `confirmed` — the server-side backstop
// behind the UI's type-to-DELETE gate, so calling the API directly can't skip it.
let BulkDeleteSubjects = async (req, res, next) => {
    const { adminId, ids, confirmed } = req.body;

    const found = await SubjectModel.find({ _id: { $in: ids }, adminId: adminId }, '_id').lean();
    if (found.length !== ids.length) {
        throw new NotFoundError(messages.subjectsNotFound(ids.length - found.length), {
            module: MODULE,
            context: { requested: ids.length, found: found.length },
        });
    }

    if (!confirmed) {
        // ONE query for the whole selection, not one per subject.
        const groupCount = await SubjectGroupModel.countDocuments({
            adminId: adminId,
            subjectIds: { $in: ids },
        });

        if (groupCount > 0) {
            throw new ConflictError(messages.subjectsInGroups(groupCount, ids.length), {
                module: MODULE,
                context: { groupCount: groupCount, requiresConfirmation: true },
            });
        }
    }

    // $pull in the same breath as the delete: a group must never be left pointing at a
    // subject that no longer exists, which is the one thing referencing (rather than
    // copying) subject names cannot protect against on its own.
    await Promise.all([
        SubjectModel.deleteMany({ _id: { $in: ids }, adminId: adminId }),
        SubjectGroupModel.updateMany(
            { adminId: adminId, subjectIds: { $in: ids } },
            { $pull: { subjectIds: { $in: ids } } }
        ),
    ]);

    return res.status(200).json({
        message: success.bulkProcessed(ids.length, ENTITY.toLowerCase()),
    });
};

module.exports = {
    GetSubjects,
    CreateSubject,
    UpdateSubject,
    BulkDeleteSubjects,
};
