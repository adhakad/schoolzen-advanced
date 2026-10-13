'use strict';
const { SOURCES } = require('./sources');

// The inbox's two query building blocks, shared by Approvals (the full inbox) and the
// Dashboard's Pending approvals card — one union over every source, never a second copy.

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

module.exports = { unionAggregate, describeRows };
