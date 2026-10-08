'use strict';
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Settings' write-through invalidation (settings/optimization.md, "Invalidation triggers").
// Each is awaited in the SAME request as the DB write it follows. Settings' data is read on
// the hot path of nearly every other module, so a missed call here shows the whole app stale
// data, not just this page.

/** Create / Set as Active / Delete session — active key, list key, and the label→id map. */
const onSessionsChanged = (adminId) => Promise.all([
    cacheService.del(
        cacheKeys.settings.activeSession(adminId),
        cacheKeys.settings.sessionsList(adminId),
        cacheKeys.settings.sessions(adminId)
    ),
    cacheService.delPattern(cacheKeys.settings.sessionsPattern(adminId)),
]);

/** Any FieldConfig save / add / delete. */
const onFieldConfigChanged = (adminId) =>
    cacheService.delPattern(cacheKeys.settings.fieldConfigPattern(adminId));

/**
 * A role's own definition changed (create/edit/delete) — every staff holding it may now
 * resolve differently, so every cached permission set goes (delPattern, per optimization.md).
 */
const onRolesChanged = (adminId) => Promise.all([
    cacheService.del(cacheKeys.settings.roles(adminId)),
    cacheService.delPattern(cacheKeys.settings.permissionsPattern(adminId)),
]);

/** A RoleAssignment chip added/removed — only those staff members' permission sets. */
const onAssignmentChanged = (adminId, staffIds) => {
    const ids = [].concat(staffIds).filter(Boolean).map(String);
    if (!ids.length) return Promise.resolve();
    return cacheService.del(...ids.map((id) => cacheKeys.settings.staffPermissions(adminId, id)));
};

module.exports = { onSessionsChanged, onFieldConfigChanged, onRolesChanged, onAssignmentChanged };
