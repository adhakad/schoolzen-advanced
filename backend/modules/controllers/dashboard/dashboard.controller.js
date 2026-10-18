'use strict';
const { NotFoundError, PermissionError } = require('../../errors');
const { resolveRequestSessionId } = require('../../helpers/academic-session/session-resolver');
const { toDateKey } = require('../../helpers/date-only');
const { nowWallClock } = require('../../helpers/attendance-time');
const { allows } = require('../../middleware/require-permission');
const cacheService = require('../../services/cache/cache.service');
const { WIDGETS, widgetFor, canSee } = require('../../helpers/dashboard/widgets');
const { buildSlices, buildSlice } = require('../../helpers/dashboard/build-slices');
const { monthOf } = require('../../helpers/dashboard/dashboard-rules');

// Dashboard (dashboard.md) — no model of its own, read-only. Every card is a registry entry
// (helpers/dashboard/widgets.js); this file only resolves the request context, filters the
// registry down to what THIS viewer's Roles & Permissions allow, and builds the slices.
//
// A widget the viewer can't see is OMITTED from the response — never sent empty, never
// sent and hidden by the UI. adminId is req.adminId (set from the token by assertAdminScope).

const MODULE = 'dashboard';

// The header's session wins; an unknown label is a 404, never a silent switch (shared-fix1.md S2).
const resolveSession = (adminId, label) => resolveRequestSessionId(adminId, label, MODULE);

const contextOf = async (req) => {
    const todayKey = toDateKey(nowWallClock());
    return {
        adminId: req.adminId,
        sessionId: await resolveSession(req.adminId, req.query.session),
        todayKey,
        month: req.query.month || monthOf(todayKey),
        permissions: req.permissions,
        allows,
    };
};

/** GET / — every widget this viewer may see, in one response. */
let GetDashboard = async (req, res) => {
    const ctx = await contextOf(req);
    const visible = WIDGETS.filter((widget) => canSee(widget, ctx.permissions, allows));
    const widgets = await buildSlices(visible, ctx, cacheService);
    return res.status(200).json({ todayKey: ctx.todayKey, widgets });
};

/** GET /widgets/:key — one widget: live-hint refetch, a card's Retry, calendar paging. */
let GetWidget = async (req, res) => {
    const widget = widgetFor(req.params.key);
    if (!widget) {
        throw new NotFoundError('This dashboard card does not exist.', { module: MODULE, code: 'DASHBOARD_WIDGET_NOT_FOUND', context: { key: req.params.key } });
    }
    if (!canSee(widget, req.permissions, allows)) {
        throw new PermissionError("You don't have permission to do this.", { module: MODULE, context: { widget: widget.key } });
    }
    const ctx = await contextOf(req);
    return res.status(200).json({ todayKey: ctx.todayKey, key: widget.key, widget: await buildSlice(widget, ctx, cacheService) });
};

module.exports = {
    GetDashboard,
    GetWidget,
};
