'use strict';
const mongoose = require('mongoose');
const FeeStructureModel = require('../../models/fees/fee-structure');
const MarksheetStructureV2Model = require('../../models/examination/marksheet-structure');
const messages = require('../messages/settings.messages');

// "Copy forward" for Create Session (settings/academic-sessions.md): duplicate the named
// CONFIGURATION documents from the source session into the new one, with the new session's
// id — never pointing back at the old session's documents, and never student placements or
// financial records.
//
// A registry, so a module that gets built later plugs its copier in here and nothing else
// changes. `copier: null` = that module has no v2 collection yet: the option is offered as
// disabled ("available once <module> is built"), never as a copy that always fails.
//
// Each type runs independently (errors.md SESSION_COPY_FORWARD_PARTIAL, shape #7): one type
// failing is reported for that type, and the types that succeeded are never rolled back.

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/** Copy every `Model` row of `fromSessionId` into `toSessionId`, one insertMany. */
const copyRows = async (Model, adminId, fromSessionId, toSessionId, actor) => {
    const rows = await Model.find({ adminId, sessionId: toObjectId(fromSessionId) }).lean();
    if (!rows.length) return 0;
    const now = new Date();
    const hasActor = Boolean(Model.schema.path('createdBy'));
    const copies = rows.map(({ _id, __v, ...row }) => ({
        ...row,
        sessionId: toObjectId(toSessionId),
        createdAt: now,
        updatedAt: now,
        ...(hasActor ? { createdBy: actor, updatedBy: actor } : {}),
    }));
    // ordered:false — one bad row doesn't stop the rest; the count is what actually landed.
    try {
        const inserted = await Model.insertMany(copies, { ordered: false });
        return inserted.length;
    } catch (error) {
        const insertedCount = error.insertedDocs ? error.insertedDocs.length
            : (error.result && typeof error.result.nInserted === 'number' ? error.result.nInserted : 0);
        if (insertedCount === 0) throw error;
        // Partially landed: report it as a failure of this type, with what did copy.
        const partial = new Error(`${copies.length - insertedCount} of ${copies.length} rows couldn't be copied.`);
        partial.copiedCount = insertedCount;
        throw partial;
    }
};

const COPY_FORWARD_TYPES = Object.freeze([
    {
        key: 'feeStructure',
        label: 'Fee Structure (per class/stream)',
        module: 'Fees',
        copier: (adminId, from, to, actor) => copyRows(FeeStructureModel, adminId, from, to, actor),
    },
    {
        key: 'marksheetStructure',
        label: 'Marksheet Structure',
        module: 'Examination',
        copier: (adminId, from, to, actor) => copyRows(MarksheetStructureV2Model, adminId, from, to, actor),
    },
    { key: 'admitCardStructure', label: 'Admit Card Structure', module: 'Examination', copier: null },
    { key: 'salaryGroups', label: 'Salary Groups', module: 'Payroll', copier: null },
    { key: 'holidayTemplates', label: 'Holiday Templates', module: 'Holiday', copier: null },
]);

const COPY_FORWARD_KEYS = Object.freeze(COPY_FORWARD_TYPES.map((type) => type.key));

/** What the Create modal renders: every type, with whether it can be copied today. */
const copyForwardOptions = () => COPY_FORWARD_TYPES.map((type) => ({
    key: type.key,
    label: type.label,
    available: Boolean(type.copier),
    reason: type.copier ? null : `Available once the ${type.module} module is built.`,
}));

/**
 * Run the requested copiers. Never throws for a copier failure.
 * @returns {Promise<{ results: Array<{key,label,status:'copied'|'failed'|'skipped',count,message?}>,
 *                     failedCount: number }>}
 */
const runCopyForward = async ({ adminId, fromSessionId, toSessionId, keys, actor }) => {
    const wanted = new Set(keys || []);
    const selected = COPY_FORWARD_TYPES.filter((type) => wanted.has(type.key));

    const results = await Promise.all(selected.map(async (type) => {
        if (!type.copier) {
            return { key: type.key, label: type.label, status: 'skipped', count: 0,
                message: `Available once the ${type.module} module is built.` };
        }
        if (!fromSessionId) {
            return { key: type.key, label: type.label, status: 'skipped', count: 0,
                message: 'There is no active session to copy from.' };
        }
        try {
            const count = await type.copier(adminId, fromSessionId, toSessionId, actor);
            return { key: type.key, label: type.label, status: 'copied', count };
        } catch (error) {
            return { key: type.key, label: type.label, status: 'failed', count: error.copiedCount || 0,
                message: `${type.label} couldn't be copied.` };
        }
    }));

    return { results, failedCount: results.filter((result) => result.status === 'failed').length };
};

/** The SESSION_COPY_FORWARD_PARTIAL warning body, or null when nothing failed. */
const partialWarning = ({ results, failedCount }) => {
    if (!failedCount) return null;
    return {
        code: 'SESSION_COPY_FORWARD_PARTIAL',
        message: messages.sessionCopyForwardPartial(failedCount),
        rows: results
            .filter((result) => result.status === 'failed')
            .map((result) => ({ row: result.key, label: result.label, code: 'SESSION_COPY_FORWARD_PARTIAL',
                message: result.message })),
    };
};

module.exports = { COPY_FORWARD_TYPES, COPY_FORWARD_KEYS, copyForwardOptions, runCopyForward, partialWarning };
