'use strict';
const cacheService = require('../cache/cache.service');
const cacheKeys = require('../cache/cache-keys');
const logger = require('../../helpers/logger');

// Live "something changed" hints for the Dashboard's SHORT-tier widgets (attendance,
// approvals). Same worker/API seam as services/attendance-v2/publisher.js: publish onto Redis,
// sockets/punch-subscriber.js re-emits into `school:<adminId>`.
//
// Rules (user-specified, on top of dashboard/optimization.md):
//   - the payload is ONLY `{ widget }` — never data. The client refetches that one widget
//     through GET /api/v2/dashboard/widgets/:key, where its permission is checked again;
//   - throttled to one hint per widget per school per HINT_GATE_MS, however many writes land;
//   - when a hint IS sent, that widget's short cache is dropped with it, so the refetch it
//     triggers sees the change. That is at most one drop per gate window, never one per write.
// No Redis → no hint (the page's polling fallback covers it). NEVER throws.

const CHANNEL = 'dashboard:widget-changed';
const HINT_GATE_MS = 8000;

/** Whether this call won the throttle window for (school, widget). */
const takeGate = async (adminId, widget) => {
    const client = cacheService.getClient();
    if (!client) return false;
    return (await client.set(cacheKeys.dashboard.hintGate(adminId, widget), '1', 'PX', HINT_GATE_MS, 'NX')) === 'OK';
};

const hintWidget = async (adminId, widget) => {
    try {
        if (!adminId || !(await takeGate(adminId, widget))) return;
        await cacheService.delPattern(cacheKeys.dashboard.widgetPattern(adminId, widget));
        await cacheService.getClient().publish(CHANNEL, JSON.stringify({ adminId, widget }));
    } catch (error) {
        logger.warn('dashboard.hintFailed', { adminId, widget, reason: error.message });
    }
};

module.exports = { CHANNEL, HINT_GATE_MS, hintWidget };
