'use strict';
const mongoose = require('mongoose');
const AcademicSessionV2Model = require('../../models/settings/academic-session');
const StudentEnrollmentModel = require('../../models/student/student-enrollment');
const FeeStructureModel = require('../../models/fees/fee-structure');
const StudentFeeRecordModel = require('../../models/fees/student-fee-record');
const MarksheetStructureV2Model = require('../../models/examination/marksheet-structure');
const { ValidationError, NotFoundError, ConflictError } = require('../../errors');
const { success } = require('../../helpers/messages/common.messages');
const messages = require('../../helpers/messages/settings.messages');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');
const { onSessionsChanged } = require('../../helpers/settings/cache-invalidation');
const { rethrowDuplicate, isDuplicateKey, sessionLabelDuplicate } = require('../../helpers/settings/duplicate-key');
const { withTransaction } = require('../../helpers/with-transaction');
const { labelFromDates, isValidSession } = require('../../helpers/academic-session-format');
const { getActiveSession } = require('../../helpers/academic-session/session-resolver');
const {
    copyForwardOptions, runCopyForward, partialWarning,
} = require('../../helpers/settings/session-copy-forward');

const MODULE = 'settings';
const ENTITY = 'Academic session';

// Settings → Academic Sessions (settings/academic-sessions.md, settings/errors.md Page 1).
//
// The school year every new record is saved against. Exactly one session is `active` per
// school: Create always makes an `upcoming` one, and Set-as-Active flips old→closed and
// new→active in ONE transaction. The label ("2026-2027") is derived from the dates here,
// never typed.
//
// Same contract as every v2 controller: typed throws from modules/errors (codes from
// errors.md, messages from settings.messages.js), success strings from helpers/messages,
// and every write invalidates Settings' session keys in the same request.

// Every collection that stores a record AGAINST a session — what SESSION_IN_USE counts.
// A module that adds a session-keyed collection adds it here.
const SESSION_DEPENDENTS = [
    { key: 'enrollments', label: 'student placement', Model: StudentEnrollmentModel },
    { key: 'feeStructures', label: 'fee structure', Model: FeeStructureModel },
    { key: 'feeRecords', label: 'student fee record', Model: StudentFeeRecordModel },
    { key: 'marksheetStructures', label: 'marksheet structure', Model: MarksheetStructureV2Model },
];

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id)) && /^[a-f\d]{24}$/i.test(String(id));
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const notFound = () => new NotFoundError(messages.sessionNotFound(), { module: MODULE, code: 'NOT_FOUND' });

/** Tenant-checked single-session read — a wrong school's id is reported exactly like a missing one. */
const findOwnSession = async (adminId, id) => {
    if (!isObjectId(id)) throw notFound();
    const session = await AcademicSessionV2Model.findOne({ _id: toObjectId(id), adminId }).lean();
    if (!session) throw notFound();
    return session;
};

/** 'YYYY-MM-DD' → a UTC-midnight Date, or null for anything that isn't a real calendar date. */
const parseIsoDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
};

/** Per-session dependent counts for many sessions — one aggregation per collection, never per row. */
const dependentCounts = async (adminId, sessionIds) => {
    const ids = sessionIds.map(toObjectId);
    const totals = new Map(sessionIds.map((id) => [String(id), { total: 0, byType: {} }]));
    if (!ids.length) return totals;
    const perCollection = await Promise.all(SESSION_DEPENDENTS.map(({ Model }) => Model.aggregate([
        { $match: { adminId, sessionId: { $in: ids } } },
        { $group: { _id: '$sessionId', count: { $sum: 1 } } },
    ])));
    perCollection.forEach((groups, index) => {
        const { key } = SESSION_DEPENDENTS[index];
        groups.forEach((group) => {
            const entry = totals.get(String(group._id));
            if (!entry) return;
            entry.byType[key] = group.count;
            entry.total += group.count;
        });
    });
    return totals;
};

const toRow = (session) => ({
    _id: String(session._id),
    label: session.label,
    startDate: session.startDate,
    endDate: session.endDate,
    status: session.status,
    isLocked: Boolean(session.isLocked),
});

// The whole school's sessions — a handful per school, ever — cached near-static. Counts are
// NOT in the cached value: other modules write enrollments/fees without touching Settings'
// keys, so the per-row blocking counts are computed live on every read.
const loadSessionList = (adminId) => cacheService.wrap(
    cacheKeys.settings.sessionsList(adminId),
    cacheService.TTL.NEAR_STATIC_45,
    async () => {
        const sessions = await AcademicSessionV2Model
            .find({ adminId }, 'label startDate endDate status isLocked')
            .sort({ startDate: -1 })
            .lean();
        return sessions.map(toRow);
    }
);

/**
 * GET /academic-sessions — the page's table (offset-paged), the side card, and for each
 * Upcoming row its live blocking count, so the delete confirmation can say upfront what
 * will be refused rather than only after the attempt.
 */
let GetSessions = async (req, res) => {
    const adminId = req.query.adminId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    // First-ever visit: a school with no sessions gets today's calendar year as active.
    const active = await getActiveSession(adminId);
    const all = await loadSessionList(adminId);
    const rows = all.slice((page - 1) * limit, page * limit);

    const upcomingIds = rows.filter((row) => row.status === 'upcoming').map((row) => row._id);
    const counts = await dependentCounts(adminId, upcomingIds);

    return res.status(200).json({
        rows: rows.map((row) => ({
            ...row,
            blockingCount: counts.has(row._id) ? counts.get(row._id).total : 0,
        })),
        total: all.length,
        page,
        limit,
        summary: { total: all.length, activeLabel: active ? active.label : null },
    });
};

/**
 * GET /academic-sessions/options — every session's label + status, for the shell header's
 * session selector. Auth + tenant only (not Settings' own permission): every person in the
 * school needs to know which year they're looking at.
 */
let GetSessionOptions = async (req, res) => {
    const adminId = req.query.adminId;
    const active = await getActiveSession(adminId);
    const all = await loadSessionList(adminId);
    return res.status(200).json({
        sessions: all.map((row) => ({ _id: row._id, label: row.label, status: row.status })),
        activeLabel: active ? active.label : null,
    });
};

/** GET /academic-sessions/active — the one session every new record is saved against. */
let GetActiveSession = async (req, res) => {
    const active = await getActiveSession(req.query.adminId);
    return res.status(200).json({ session: active });
};

/** GET /academic-sessions/copy-forward-options — the Create modal's checklist. */
let GetCopyForwardOptions = async (req, res) => {
    const active = await getActiveSession(req.query.adminId);
    return res.status(200).json({
        sourceLabel: active ? active.label : null,
        options: copyForwardOptions(),
    });
};

/**
 * POST /academic-sessions — create an UPCOMING session from a date range, then copy forward.
 *
 * Response:
 *   201 { message, session, copyForward: [{ key, label, status, count, message? }] }
 *       — the session was created and every selected type copied (or was skipped as unbuilt).
 *   200 { message, session, copyForward: [...], warning: { code: 'SESSION_COPY_FORWARD_PARTIAL',
 *         message, rows: [{ row: <type key>, label, code, message }] } }
 *       — the session WAS created; one or more selected types failed to copy. The types that
 *         copied are kept (never rolled back), and `rows` lists only the failed types
 *         (errors.md shape #7, one row per failed item type rather than per document).
 */
let CreateSession = async (req, res) => {
    const { adminId, startDate: rawStart, endDate: rawEnd, copyForward } = req.body;
    const actor = req.staffId || 'system';

    const startDate = parseIsoDate(rawStart);
    const endDate = parseIsoDate(rawEnd);
    if (!startDate || !endDate || endDate <= startDate) {
        const message = messages.sessionDateRangeInvalid();
        const fields = [];
        if (!startDate) fields.push({ field: 'startDate', message, code: 'SESSION_DATE_RANGE_INVALID' });
        if (!endDate || (startDate && endDate <= startDate)) {
            fields.push({ field: 'endDate', message, code: 'SESSION_DATE_RANGE_INVALID' });
        }
        throw new ValidationError(message, { module: MODULE, code: 'SESSION_DATE_RANGE_INVALID', fields });
    }

    // Server-computed label; a range that doesn't span exactly one start→end year can't be
    // written as "2026-2027", so it isn't a session.
    const label = labelFromDates(rawStart, rawEnd);
    if (!isValidSession(label)) {
        const message = messages.sessionLabelFormatInvalid();
        throw new ValidationError(message, {
            module: MODULE,
            code: 'SESSION_LABEL_FORMAT_INVALID',
            fields: [{ field: 'endDate', message, code: 'SESSION_LABEL_FORMAT_INVALID' }],
        });
    }

    // Fast path for the friendlier inline message; the unique (adminId, label) index is the
    // real guard and a concurrent duplicate is translated from E11000 below.
    if (await AcademicSessionV2Model.exists({ adminId, label })) throw sessionLabelDuplicate();

    let created;
    try {
        created = await AcademicSessionV2Model.create({
            adminId, label, startDate, endDate,
            status: 'upcoming',
            isLocked: false,
            createdBy: actor,
            updatedBy: actor,
        });
    } catch (error) {
        rethrowDuplicate(error, (keys) => (keys.includes('label') ? sessionLabelDuplicate() : null));
    }

    // Source = the school's active session (the year being copied from).
    const active = await getActiveSession(adminId);
    const outcome = await runCopyForward({
        adminId,
        fromSessionId: active ? active._id : null,
        toSessionId: created._id,
        keys: copyForward,
        actor,
    });

    await onSessionsChanged(adminId);

    const warning = partialWarning(outcome);
    const body = {
        message: success.created(ENTITY),
        session: toRow(created.toObject()),
        copyForward: outcome.results,
        ...(warning ? { warning } : {}),
    };
    return res.status(warning ? 200 : 201).json(body);
};

class ActivationRaceLost extends Error {
    constructor(winnerLabel) {
        super('activation race lost');
        this.winnerLabel = winnerLabel;
    }
}

/**
 * POST /academic-sessions/:id/activate { confirmLabel } — make an Upcoming session THE active
 * one. Old active → closed and this → active commit together in one transaction, or not at
 * all (database-design-principles.md, Transactions).
 *
 * Race (errors.md shape 9): the transaction re-reads the current active session INSIDE the
 * transaction and requires it to still be the one this request saw before starting. If two
 * admins activate two different sessions at once, Mongo's write-conflict retry re-runs the
 * loser's transaction, which then finds a DIFFERENT session active and stops with
 * SESSION_ALREADY_ACTIVE naming the winner — the loser re-confirms; it never silently
 * overrides. The partial unique index on one active session per school is the backstop.
 */
let ActivateSession = async (req, res) => {
    const { adminId, confirmLabel } = req.body;
    const actor = req.staffId || 'system';
    const target = await findOwnSession(adminId, req.params.id);

    if (String(confirmLabel || '').trim() !== target.label) {
        const message = messages.sessionConfirmMismatch();
        throw new ValidationError(message, {
            module: MODULE,
            code: 'SESSION_CONFIRM_MISMATCH',
            fields: [{ field: 'confirmLabel', message, code: 'SESSION_CONFIRM_MISMATCH' }],
        });
    }
    if (target.status === 'active') {
        throw new ConflictError(messages.sessionAlreadyActive(), { module: MODULE, code: 'SESSION_ALREADY_ACTIVE' });
    }
    if (target.status === 'closed') {
        throw new ConflictError(messages.sessionReactivationBlocked(), {
            module: MODULE, code: 'SESSION_REACTIVATION_BLOCKED',
        });
    }

    // What this admin saw as "the current session" when they confirmed.
    const seenActive = await AcademicSessionV2Model.findOne({ adminId, status: 'active' }, 'label').lean();
    const seenActiveId = seenActive ? String(seenActive._id) : null;

    try {
        await withTransaction(async (dbSession) => {
            const now = new Date();
            const current = await AcademicSessionV2Model
                .findOne({ adminId, status: 'active' }, 'label')
                .session(dbSession)
                .lean();
            if ((current ? String(current._id) : null) !== seenActiveId) {
                throw new ActivationRaceLost(current ? current.label : null);
            }
            if (current) {
                const closed = await AcademicSessionV2Model.updateOne(
                    { _id: current._id, adminId, status: 'active' },
                    { $set: { status: 'closed', updatedBy: actor, updatedAt: now } },
                    { session: dbSession }
                );
                if (closed.modifiedCount !== 1) throw new ActivationRaceLost(null);
            }
            const activated = await AcademicSessionV2Model.updateOne(
                { _id: target._id, adminId, status: 'upcoming' },
                { $set: { status: 'active', updatedBy: actor, updatedAt: now } },
                { session: dbSession }
            );
            if (activated.modifiedCount !== 1) throw new ActivationRaceLost(null);
        });
    } catch (error) {
        if (!(error instanceof ActivationRaceLost) && !isDuplicateKey(error)) throw error;
        // Lost the race. Invalidate anyway — whoever won changed what the keys should say.
        await onSessionsChanged(adminId);
        const now = await AcademicSessionV2Model.findOne({ adminId, status: 'active' }, 'label').lean();
        const message = now && String(now._id) !== String(target._id)
            ? messages.sessionOtherNowActive(now.label)
            : messages.sessionAlreadyActive();
        throw new ConflictError(message, {
            module: MODULE,
            code: 'SESSION_ALREADY_ACTIVE',
            context: { targetId: String(target._id), activeLabel: now ? now.label : null },
        });
    }

    // Same request as the commit: the highest-blast-radius cache key in the app.
    await onSessionsChanged(adminId);

    return res.status(200).json({
        message: `${target.label} is now the active session.`,
        session: { ...toRow(target), status: 'active' },
        previousLabel: seenActive ? seenActive.label : null,
    });
};

/**
 * DELETE /academic-sessions/:id?confirm=DELETE — only an Upcoming session, and only when no
 * record anywhere has been saved against it (errors.md SESSION_IN_USE, shape #6: the count
 * travels in `context`, and the list already showed it before the attempt).
 */
let DeleteSession = async (req, res) => {
    const adminId = req.query.adminId;
    // The UI's type-DELETE gate is the first check; this is the backstop behind it.
    if (req.query.confirm !== 'DELETE') {
        const message = messages.deleteConfirmRequired();
        throw new ValidationError(message, { module: MODULE, fields: [{ field: 'confirm', message }] });
    }
    const session = await findOwnSession(adminId, req.params.id);

    if (session.status !== 'upcoming') {
        throw new ConflictError(messages.sessionDeleteNotUpcoming(), {
            module: MODULE, code: 'SESSION_IN_USE', context: { status: session.status },
        });
    }

    const counts = (await dependentCounts(adminId, [String(session._id)])).get(String(session._id));
    if (session.isLocked || counts.total > 0) {
        throw new ConflictError(messages.sessionInUse(), {
            module: MODULE,
            code: 'SESSION_IN_USE',
            context: { count: counts.total, byType: counts.byType, isLocked: Boolean(session.isLocked) },
        });
    }

    // Conditional: if it was activated (or locked) a moment ago, nothing is deleted.
    const result = await AcademicSessionV2Model.deleteOne({
        _id: session._id, adminId, status: 'upcoming', isLocked: { $ne: true },
    });
    if (result.deletedCount !== 1) {
        const now = await AcademicSessionV2Model.findOne({ _id: session._id, adminId }, 'status').lean();
        if (!now) throw notFound();
        throw new ConflictError(
            now.status === 'upcoming' ? messages.sessionInUse() : messages.sessionDeleteNotUpcoming(),
            { module: MODULE, code: 'SESSION_IN_USE' }
        );
    }

    await onSessionsChanged(adminId);
    return res.status(200).json({ message: success.deleted(ENTITY) });
};

module.exports = {
    GetSessions,
    GetSessionOptions,
    GetActiveSession,
    GetCopyForwardOptions,
    CreateSession,
    ActivateSession,
    DeleteSession,
};
