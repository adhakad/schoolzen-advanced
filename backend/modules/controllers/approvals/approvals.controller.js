'use strict';
const mongoose = require('mongoose');
const { ValidationError, NotFoundError, ConflictError, PermissionError } = require('../../errors');
const messages = require('../../helpers/messages/approvals.messages');
const { resolveSessionId, findPeople } = require('../../helpers/leave/context');
const { SOURCES, sourceFor } = require('../../helpers/approvals/sources');
const {
    INBOX_STATUSES, isObjectId, encodeCursor, decodeCursor, cursorMatch, mapSourceCode,
} = require('../../helpers/approvals/approval-rules');
const { allows } = require('../../middleware/require-permission');
const { logActivity } = require('../../services/activity-log.service');

// Approvals — one inbox over every module's approvable requests (approvals.md).
//
// No model of its own: the list is a $unionWith over each source's own collection, and
// Approve/Reject call each source's OWN action (sources.js) — this file adds the union, the
// keyset cursor, the inbox's two error codes and its own audit line, nothing else.
// Nothing is cached (optimization.md): counts come from the same union match at read time.

const MODULE = 'approvals';

const requestNotFound = (context) => new NotFoundError(messages.requestNotFound(), { module: MODULE, code: 'REQUEST_NOT_FOUND', context });
const requestNotPending = () => new ConflictError(messages.requestNotPending(), { module: MODULE, code: 'REQUEST_NOT_PENDING' });

const hasPersonFilter = (q) => Boolean(q.search || q.departmentId || q.designationId || q.classId || q.streamId || q.sectionId);

/**
 * The person ids a toolbar filter narrows to, per person type, or null when no person filter
 * is set. "All Applicants" with a search looks up both staff and students.
 */
const peopleFor = async (adminId, sessionId, q) => {
    if (!hasPersonFilter(q)) return { ids: null, truncated: false };
    const types = q.personType ? [q.personType] : ['staff', 'student'];
    const results = await Promise.all(types.map((personType) => findPeople(adminId, sessionId, {
        personType,
        departmentId: q.departmentId,
        designationId: q.designationId,
        classId: q.classId,
        streamId: q.streamId,
        sectionId: q.sectionId,
        search: q.search,
    })));
    return {
        ids: results.flatMap((result) => result.rows.map((row) => row._id)),
        truncated: results.some((result) => result.truncated),
    };
};

/** One union pipeline over `sources`: per-source $match + $project, then `tail`. */
const unionAggregate = (sources, matchFor, tail) => {
    const branch = (source) => [{ $match: matchFor(source) }, { $project: source.project }];
    const [first, ...rest] = sources;
    return first.model.aggregate([
        ...branch(first),
        ...rest.map((source) => ({ $unionWith: { coll: source.model.collection.name, pipeline: branch(source) } })),
        ...tail,
    ]);
};

/** Rows of mixed types → table rows, each described by its own source, order kept. */
const describeRows = async (adminId, sessionId, rows) => {
    const described = new Map();
    await Promise.all(SOURCES.map(async (source) => {
        const own = rows.filter((row) => row.type === source.type);
        if (!own.length) return;
        (await source.describe(adminId, sessionId, own)).forEach((row) => described.set(`${row.type}|${row._id}`, row));
    }));
    return rows.map((row) => described.get(`${row.type}|${row._id}`)).filter(Boolean);
};

/** GET /requests — one keyset page of the union, plus total and the Overview counts. */
let ListRequests = async (req, res) => {
    const q = req.query;
    const { adminId, limit } = q;
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    if (q.cursor && !cursor) {
        throw new ValidationError(messages.cursorInvalid(), { module: MODULE, code: 'CURSOR_INVALID' });
    }
    const sessionId = await resolveSessionId(adminId, q.session);
    const people = await peopleFor(adminId, sessionId, q);
    const sources = q.type ? SOURCES.filter((source) => source.type === q.type) : SOURCES;

    const base = { adminId, sessionId, personType: q.personType || null, personIds: people.ids };
    const matchWith = (status) => (source) => source.match({ ...base, status });

    const pageTail = [
        ...(cursor ? [{ $match: cursorMatch(cursor) }] : []),
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: limit + 1 },
    ];
    const [pageRows, totals, summaryRows] = await Promise.all([
        unionAggregate(sources, matchWith(q.status || null), pageTail),
        unionAggregate(sources, matchWith(q.status || null), [{ $count: 'total' }]),
        unionAggregate(sources, matchWith(null), [{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const page = pageRows.slice(0, limit);
    const summary = Object.fromEntries(INBOX_STATUSES.map((status) => [status, 0]));
    summaryRows.forEach((row) => { if (row._id in summary) summary[row._id] = row.count; });

    return res.status(200).json({
        rows: await describeRows(adminId, sessionId, page),
        nextCursor: pageRows.length > limit ? encodeCursor(page[page.length - 1]) : null,
        total: totals.length ? totals[0].total : 0,
        summary,
        truncated: people.truncated,
    });
};

/** Approve / Reject through the source's own action, under both grants. */
const decide = (decision) => async (req, res) => {
    const { adminId } = req.body;
    const { type, id } = req.params;
    const source = sourceFor(type);
    if (!source || !isObjectId(id)) throw requestNotFound({ type, id });
    // The inbox is never a way around a module's own grant ('leave' edit for Leave).
    if (!allows(req.permissions, source.permission, 'edit')) {
        throw new PermissionError("You don't have permission to do this.", { module: MODULE, context: { type, decision } });
    }

    let result;
    try {
        result = await source[decision](req, { adminId, id });
    } catch (error) {
        const code = mapSourceCode(error && error.code, source.codeMap);
        if (code === 'REQUEST_NOT_FOUND') throw requestNotFound({ type, id });
        if (code === 'REQUEST_NOT_PENDING') throw requestNotPending();
        throw error;
    }

    await logActivity(req, {
        module: MODULE,
        action: `approvals.request.${decision}`,
        targetId: id,
        meta: { type },
        changes: { before: { status: 'pending' }, after: { status: decision === 'approve' ? 'approved' : 'rejected' } },
    });

    // The fresh row, in the inbox's own shape, so the page updates it in place.
    const [fresh] = await source.model.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id), adminId } },
        { $project: source.project },
    ]);
    const [row] = fresh ? await describeRows(adminId, fresh.sessionId, [fresh]) : [];
    return res.status(200).json({ message: result.message, row: row || null });
};

let ApproveRequest = decide('approve');
let RejectRequest = decide('reject');

module.exports = {
    ListRequests,
    ApproveRequest,
    RejectRequest,
};
