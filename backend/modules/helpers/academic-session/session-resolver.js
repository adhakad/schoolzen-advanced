'use strict';
const mongoose = require('mongoose');
const AcademicSessionV2Model = require('../../models/settings/academic-session');
const { parseSession, isValidSession } = require('../academic-session-format');
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Label ⇄ AcademicSession._id, per school.
//
// The shell header, the API and every page still speak in labels ("2026-2027"); every v2
// collection STORES the session as a reference (settings/academic-sessions.md). This is the
// one place that translates, at the API edge:
//   findSessionId    — reads: a label with no session yet simply matches nothing
//   ensureSessionId  — writes: the session is created on first use, from the label
//
// Settings → Academic Sessions owns create / Set-as-Active. On-demand creation remains for a
// write path that names a session label no document exists for yet (Class Promotion's next
// session, an import for a given year) — but it NEVER creates a second `active` session:
// exactly-one-active is the activation transaction's job. A created session's status comes
// from the calendar — the academic year runs 1 April to 31 March, so an earlier year is
// `closed`, a later one `upcoming`, and today's year is `active` only while the school has no
// active session at all (its very first one). Never from the legacy global academic-session
// document (database-design-principles.md §0).

// The whole school's label→id map, cached near-static (sessions change a few times a year).
const loadSessionMap = (adminId) => cacheService.wrap(
    cacheKeys.settings.sessions(adminId),
    cacheService.TTL.NEAR_STATIC_30,
    async () => {
        const sessions = await AcademicSessionV2Model.find({ adminId }, 'label').lean();
        return Object.fromEntries(sessions.map((session) => [session.label, String(session._id)]));
    }
);

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(String(id)) : null);

/** The session's _id for a label, or null when this school has no such session yet. */
const findSessionId = async (adminId, label) => {
    if (!isValidSession(label)) return null;
    const map = await loadSessionMap(adminId);
    return toObjectId(map[label]);
};

/** "2026-2027" for any date from 1 Apr 2026 to 31 Mar 2027. */
const currentSessionLabel = (now = new Date()) => {
    const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}-${start + 1}`;
};

const isDuplicateKey = (error) => Boolean(error)
    && (error.code === 11000 || /E11000/.test(String(error.message || '')));

const statusFor = async (adminId, label) => {
    const current = currentSessionLabel();
    if (label < current) return 'closed';
    if (label > current) return 'upcoming';
    const hasActive = await AcademicSessionV2Model.exists({ adminId, status: 'active' });
    return hasActive ? 'upcoming' : 'active';
};

const upsertSession = (adminId, label, parsed, status) => AcademicSessionV2Model.findOneAndUpdate(
    { adminId, label },
    {
        $setOnInsert: {
            adminId,
            label,
            // Indian school year: 1 April → 31 March, at UTC midnight (date-only values).
            startDate: new Date(Date.UTC(parsed.startYear, 3, 1)),
            endDate: new Date(Date.UTC(parsed.endYear, 2, 31)),
            status,
            createdBy: 'system',
            updatedBy: 'system',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    },
    { upsert: true, new: true }
).lean();

/**
 * The session's _id for a label, creating the session on first use. Race-safe: the upsert
 * on the unique (adminId, label) index means two concurrent first calls end with one
 * document, and both get its id.
 * @throws Error for a label that isn't a valid "YYYY-YYYY+1" — callers validate first.
 */
const ensureSessionId = async (adminId, label) => {
    const existing = await findSessionId(adminId, label);
    if (existing) return existing;

    const parsed = parseSession(label);
    if (!parsed) throw new Error(`Invalid session label: ${label}`);

    const status = await statusFor(adminId, label);
    let session;
    try {
        session = await upsertSession(adminId, label, parsed, status);
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // Either a concurrent first call created this label (the (adminId, label) index) or
        // another session became active in between (the one-active index). Re-read; if the
        // label still doesn't exist, it can only be created as non-active.
        session = await AcademicSessionV2Model.findOne({ adminId, label }).lean()
            || await upsertSession(adminId, label, parsed, status === 'active' ? 'upcoming' : status);
    }

    // Same request as the write: every cached session read (the label map, Settings' list
    // and its active-session key) recomputes with this session in it.
    await invalidateSessions(adminId);
    return session._id;
};

const invalidateSessions = (adminId) => cacheService.del(
    cacheKeys.settings.sessions(adminId),
    cacheKeys.settings.sessionsList(adminId),
    cacheKeys.settings.activeSession(adminId)
);

/**
 * Flip `isLocked` the first time another collection writes a record against this session
 * (settings/academic-sessions.md) — after that its date range is immutable. A conditional
 * update, so the steady state (already locked) is one indexed no-op write, never a scan.
 * Call it from a write path right after it saves a record carrying `sessionId`.
 */
const markSessionLocked = async (adminId, sessionId) => {
    if (!sessionId) return;
    const result = await AcademicSessionV2Model.updateOne(
        { _id: toObjectId(sessionId), adminId, isLocked: false },
        { $set: { isLocked: true, updatedAt: new Date() } }
    );
    if (result.modifiedCount) await invalidateSessions(adminId);
};

/**
 * The school's active session — `{ _id, label, startDate, endDate, status, isLocked }`, or
 * null. Cached near-static under `{adminId}:settings:academic-session:active`
 * (settings/optimization.md): it is read on nearly every write path in the app, and
 * Set-as-Active invalidates it in the same request, so the long TTL is safe.
 *
 * A school with NO sessions at all (first-ever visit) gets today's calendar session created
 * as active, so the app always has a current year. A school whose sessions are all
 * closed/upcoming gets null — choosing which one is active is the admin's decision.
 */
const getActiveSession = async (adminId) => {
    const read = () => cacheService.wrap(
        cacheKeys.settings.activeSession(adminId),
        cacheService.TTL.NEAR_STATIC_45,
        async () => {
            const active = await AcademicSessionV2Model
                .findOne({ adminId, status: 'active' }, 'label startDate endDate status isLocked')
                .lean();
            return active ? { ...active, _id: String(active._id) } : null;
        }
    );
    const active = await read();
    if (active) return active;
    const any = await AcademicSessionV2Model.exists({ adminId });
    if (any) return null;
    await ensureSessionId(adminId, currentSessionLabel());
    return read();
};

/** The label for a session id (for responses), or null. */
const labelOfSessionId = async (adminId, sessionId) => {
    if (!sessionId) return null;
    const map = await loadSessionMap(adminId);
    const wanted = String(sessionId);
    return Object.keys(map).find((label) => map[label] === wanted) || null;
};

module.exports = {
    findSessionId,
    ensureSessionId,
    labelOfSessionId,
    loadSessionMap,
    markSessionLocked,
    getActiveSession,
    currentSessionLabel,
};
