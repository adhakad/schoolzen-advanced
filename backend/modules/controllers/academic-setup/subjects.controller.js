'use strict';
const SubjectModel = require('../../models/academic-setup/subject');
const SubjectGroupModel = require('../../models/academic-setup/subject-group');
const { NotFoundError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/academic-setup.messages');
const cacheInvalidation = require('../../helpers/academic-setup/cache-invalidation');
const { withTransaction } = require('../../helpers/with-transaction');
const { subjectDuplicate, rethrowDuplicate } = require('../../helpers/academic-setup/duplicate-key');
const { subjectBlockingCounts, uniqueIds, bulkDeleteBody } = require('../../helpers/academic-setup/dependents');

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
    const rows = (result && result.rows) || [];

    // Each row's dependents (the Subject Groups that include it), shown in the delete
    // confirmation BEFORE the attempt — one grouped aggregation for the page, never per row.
    const blocking = await subjectBlockingCounts(adminId, rows.map((row) => row._id));

    return res.status(200).json({
        rows: rows.map((row) => ({ ...row, blockingCount: blocking.get(String(row._id)) || 0 })),
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

    if (existing) throw subjectDuplicate(name);
};

let CreateSubject = async (req, res, next) => {
    const { adminId, name } = req.body;

    await assertNameFree(adminId, name);
    // A concurrent create that passed the pre-check hits the unique index -> SUBJECT_DUPLICATE.
    await SubjectModel.create(req.body).catch((error) => rethrowDuplicate(error, () => subjectDuplicate(name)));
    await cacheInvalidation.onSubjectsChanged(adminId);

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
    await subject.save().catch((error) => rethrowDuplicate(error, () => subjectDuplicate(name)));
    await cacheInvalidation.onSubjectsChanged(adminId);

    return res.status(200).json({ message: success.updated(ENTITY) });
};

// One request for the whole selection, one deleteMany — never a delete call per checked row
// (performance-principles.md).
//
// Hard delete: a Subject is configuration, not a record of something that happened
// (database-design-principles.md). Deactivating is the soft option and it already exists as
// a status, which is why there is no `deletedAt` here.
//
// The blast radius is the Subject Groups that include any of these subjects (SUBJECT_IN_USE),
// so deleting one that is in a group requires an explicit `confirmed` — the server-side
// backstop behind the UI's type-to-DELETE gate, so calling the API directly can't skip it.
// Unconfirmed, an in-use subject is reported `blocked` (with its group count) and the free
// ones still go; confirmed, every found subject goes and is $pull-ed out of its groups.
//
// Per-row outcome: each requested id comes back deleted / blocked / not_found (missing or
// another school's — reported identically). Every step is ONE grouped query over the set.
let BulkDeleteSubjects = async (req, res, next) => {
    const { adminId, confirmed } = req.body;
    const ids = uniqueIds(req.body.ids);

    const [found, blocking] = await Promise.all([
        SubjectModel.find({ _id: { $in: ids }, adminId: adminId }, '_id').lean(),
        subjectBlockingCounts(adminId, ids),
    ]);
    const foundIds = new Set(found.map((subject) => String(subject._id)));

    const results = ids.map((id) => {
        if (!foundIds.has(id)) return { id, status: 'not_found', code: 'NOT_FOUND' };
        const blockingCount = blocking.get(id) || 0;
        if (blockingCount > 0 && !confirmed) return { id, status: 'blocked', code: 'SUBJECT_IN_USE', blockingCount };
        return { id, status: 'deleted', blockingCount };
    });

    const deletable = results.filter((row) => row.status === 'deleted').map((row) => row.id);
    let emptiedGroups = 0;
    if (deletable.length) {
        // ONE transaction: the delete and the $pull commit together or not at all, so a group
        // can never be left pointing at a subject that no longer exists — the one thing
        // referencing (rather than copying) subject names cannot protect against on its own.
        // Sequential inside the session: one transaction cannot run two operations at once.
        emptiedGroups = await withTransaction(async (dbSession) => {
            const touched = await SubjectGroupModel
                .find({ adminId: adminId, subjectIds: { $in: deletable } }, '_id')
                .session(dbSession)
                .lean();
            await SubjectModel.deleteMany({ _id: { $in: deletable }, adminId: adminId }, { session: dbSession });
            if (!touched.length) return 0;
            const touchedIds = touched.map((group) => group._id);
            await SubjectGroupModel.updateMany(
                { _id: { $in: touchedIds }, adminId: adminId },
                { $pull: { subjectIds: { $in: deletable } } },
                { session: dbSession }
            );
            return SubjectGroupModel
                .countDocuments({ _id: { $in: touchedIds }, adminId: adminId, subjectIds: { $size: 0 } })
                .session(dbSession);
        });
        // The $pull changed groups too — their cached subject lists go with the subjects'.
        await cacheInvalidation.onSubjectsChanged(adminId, { groupsTouched: true });
    }

    const body = bulkDeleteBody(results, ENTITY.toLowerCase());
    // Non-blocking (errors.md shape 6): the delete already happened, so a group it left with
    // no subjects is a warning to act on, not an error.
    if (emptiedGroups > 0) {
        body.warnings = [{
            code: 'SUBJECT_GROUP_EMPTIED',
            count: emptiedGroups,
            message: `${emptiedGroups} subject ${emptiedGroups === 1 ? 'group now has' : 'groups now have'} no subjects.`,
        }];
    }
    return res.status(200).json(body);
};

module.exports = {
    GetSubjects,
    CreateSubject,
    UpdateSubject,
    BulkDeleteSubjects,
};
