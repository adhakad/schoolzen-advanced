'use strict';
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Dashboard's write-through invalidation for its LONG-tier widgets (dashboard/optimization.md
// "Invalidation triggers"). Dashboard has no writes of its own, so every call to this comes
// from another module's existing invalidation point, in the same request as its DB write:
//   student writes  → students, fees       fee payment / concession / structure → fees
//   staff writes    → staff                holiday writes → calendar, holidays
// The SHORT tier (attendance, approvals) is deliberately not busted here — see
// services/dashboard/hint-publisher.js. NEVER throws: CacheService swallows its own failures.

const onDashboardChanged = (adminId, widgets) => Promise.all(
    widgets.map((widget) => cacheService.delPattern(cacheKeys.dashboard.widgetPattern(adminId, widget)))
);

module.exports = { onDashboardChanged };
