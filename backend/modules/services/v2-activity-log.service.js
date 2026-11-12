'use strict';
const ActivityLogModel = require('../models/audit/activity-log');
const StaffV2Model = require('../models/staff/staff');
const { OWNER_DEFAULT_NAME } = require('../helpers/settings/v2-owner-bootstrap');

// logActivityV2() — the one way any v2 controller writes to the audit trail.
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
 * The acting person's name. The admin token carries only `id` + `mobile`, so the name comes
 * from the v2 Staff row: the staff requirePermission resolved (req.staffId), else the school's
 * owner row (an admin login IS the owner). Cached on the request — one read per request.
 */
const resolveActorName = async (req, adminId, fromToken) => {
    if (fromToken) return fromToken;
    if (req._actorName !== undefined) return req._actorName;
    if (req.staffId) {
        const staff = await StaffV2Model.findOne({ _id: req.staffId, adminId: String(adminId) }, 'name').lean();
        req._actorName = (staff && staff.name) || null;
        return req._actorName;
    }
    // An admin login IS the owner. Routes without requirePermission (Academic Setup, Staff,
    // Student) never bootstrap the owner row, so on a new school it may not exist yet and the
    // entry used to store actorName: null. Read-only: fall back to the exact name
    // ensureOwner() gives that row when it is created (the admin token carries no name).
    const owner = await StaffV2Model.findOne({ adminId: String(adminId), isOwner: true }, 'name').lean();
    req._actorName = (owner && owner.name) || OWNER_DEFAULT_NAME;
    return req._actorName;
};

/**
 * @param {Object} req  the Express request (actor, IP and user agent come from it)
 * @param {Object} entry
 * @param {String} entry.module
 * @param {String} entry.action     e.g. 'student.field.reveal'
 * @param {String} [entry.targetId]
 * @param {Object} [entry.meta]     context only — never a sensitive value itself
 * @param {Object} [entry.changes]  { before, after } of changed, non-sensitive fields
 * @param {ClientSession} [dbSession] write inside the caller's transaction, so the change and
 *                                    its log entry commit or roll back together
 */
const logActivityV2 = async (req, { module, action, targetId = null, meta, changes }, dbSession = null) => {
    const adminId = req.adminId || (req.query && req.query.adminId) || (req.body && req.body.adminId);
    const actor = actorOf(req);
    actor.actorName = await resolveActorName(req, adminId, actor.actorName);
    const entry = {
        adminId: String(adminId),
        ...actor,
        module,
        action,
        targetId: targetId == null ? null : String(targetId),
        meta,
        changes,
        ipAddress: req.ip || null,
        userAgent: (req.get && req.get('user-agent')) || null,
    };
    if (dbSession) await ActivityLogModel.create([entry], { session: dbSession });
    else await ActivityLogModel.create(entry);
};

/** The acting person's display name — the same name logActivityV2() stores (cached per request). */
const actorNameV2 = async (req, adminId) => resolveActorName(req, adminId, actorOf(req).actorName);

module.exports = { logActivityV2, actorNameV2 };
