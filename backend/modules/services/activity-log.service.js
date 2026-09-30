'use strict';
const ActivityLogModel = require('../models/audit/activity-log');

// logActivity() — the one way any v2 controller writes to the audit trail.
//
// It is AWAITED and it THROWS: callers log before they disclose ("log, then reveal"), so a
// failed audit write means the sensitive value is not sent — never an unlogged disclosure.

/** Who is acting, from the verified token. Only admins log in today; Staff joins later. */
const actorOf = (req) => {
    const user = req.user || {};
    const payload = user.payload || user;
    return {
        actorType: 'admin',
        actorId: String(payload.id || user.id || req.adminId || ''),
        actorName: payload.name || null,
    };
};

/**
 * @param {Object} req  the Express request (actor, IP and user agent come from it)
 * @param {Object} entry
 * @param {String} entry.module
 * @param {String} entry.action     e.g. 'student.field.reveal'
 * @param {String} [entry.targetId]
 * @param {Object} [entry.meta]     context only — never a sensitive value itself
 * @param {Object} [entry.changes]  { before, after } of changed, non-sensitive fields
 */
const logActivity = async (req, { module, action, targetId = null, meta, changes }) => {
    const adminId = req.adminId || (req.query && req.query.adminId) || (req.body && req.body.adminId);
    await ActivityLogModel.create({
        adminId: String(adminId),
        ...actorOf(req),
        module,
        action,
        targetId: targetId == null ? null : String(targetId),
        meta,
        changes,
        ipAddress: req.ip || null,
        userAgent: (req.get && req.get('user-agent')) || null,
    });
};

module.exports = { logActivity };
