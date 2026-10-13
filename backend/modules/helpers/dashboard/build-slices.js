'use strict';
const cacheKeys = require('../../services/cache/cache-keys');
const { TTL } = require('./widgets');
const logger = require('../logger');

// Turns registry entries into response slices. Two rules from dashboard/errors.md live here:
//   - every widget fails ALONE: a throwing loader becomes that slice's own error object and
//     the response still ships every other widget (never a whole-page 500);
//   - every slice carries `generatedAt` — when its numbers were actually computed, which a
//     cached slice keeps — so the page can say "as of HH:MM" instead of implying live data.

const LOAD_FAILED = Object.freeze({ code: 'DASHBOARD_LOAD_FAILED', message: "Couldn't load this — try refreshing." });

const keyFor = (widget, ctx) => cacheKeys.dashboard.widget(
    ctx.adminId, widget.key, ctx.sessionId, widget.qualifier ? widget.qualifier(ctx) : null
);

/**
 * @param {Object} widget  a registry entry
 * @param {Object} ctx     { adminId, sessionId, todayKey, month, permissions, allows }
 * @param {Object} cache   { wrap(key, ttl, fn) } — CacheService, or a stub in tests
 * @returns {Promise<Object>} `{ ...data, generatedAt }` or `{ error }`
 */
const buildSlice = async (widget, ctx, cache) => {
    try {
        const compute = async () => ({ ...(await widget.load(ctx)), generatedAt: new Date().toISOString() });
        const slice = widget.tier === 'none' ? await compute() : await cache.wrap(keyFor(widget, ctx), TTL[widget.tier], compute);
        return widget.personalize ? widget.personalize(slice, ctx) : slice;
    } catch (error) {
        logger.error('dashboard.widgetFailed', { adminId: ctx.adminId, widget: widget.key, reason: error && error.message });
        return { error: { ...LOAD_FAILED } };
    }
};

/** Every widget in `widgets`, in parallel — one slice per key. */
const buildSlices = async (widgets, ctx, cache) => {
    const slices = await Promise.all(widgets.map((widget) => buildSlice(widget, ctx, cache)));
    return Object.fromEntries(widgets.map((widget, index) => [widget.key, slices[index]]));
};

module.exports = { buildSlice, buildSlices, keyFor, LOAD_FAILED };
