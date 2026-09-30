'use strict';
const mongoose = require('mongoose');
const AcademicSessionV2Model = require('../../models/settings/academic-session');
const LegacyAcademicSessionModel = require('../../models/academic-session');
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
// On-demand creation stands in for Settings → Academic Sessions until that module is built.
// A created session's status follows the legacy global document: the legacy current session
// is `active`, earlier ones `closed`, later ones `upcoming`.

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

const statusFor = async (label) => {
    const legacy = await LegacyAcademicSessionModel.findOne({}, 'academicSession').lean();
    const current = legacy && legacy.academicSession;
    if (!current || !isValidSession(current)) return 'active';
    if (label === current) return 'active';
    return label < current ? 'closed' : 'upcoming';
};

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

    const status = await statusFor(label);
    const session = await AcademicSessionV2Model.findOneAndUpdate(
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
                createdAt: new Date(),
            },
        },
        { upsert: true, new: true }
    ).lean();

    // Same request as the write: the next read recomputes the map with this session in it.
    await cacheService.del(cacheKeys.settings.sessions(adminId));
    return session._id;
};

/** The label for a session id (for responses), or null. */
const labelOfSessionId = async (adminId, sessionId) => {
    if (!sessionId) return null;
    const map = await loadSessionMap(adminId);
    const wanted = String(sessionId);
    return Object.keys(map).find((label) => map[label] === wanted) || null;
};

module.exports = { findSessionId, ensureSessionId, labelOfSessionId, loadSessionMap };
