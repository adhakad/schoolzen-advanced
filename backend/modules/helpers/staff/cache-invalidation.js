'use strict';
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Staff's write-through invalidation (staff/optimization.md, "Invalidation triggers").
// Manage Staff's own list is never cached, so staff writes invalidate nothing here.

/** Designation writes. */
const onDesignationsChanged = (adminId) =>
    cacheService.delPattern(cacheKeys.staff.designationsPattern(adminId));

/** Department writes — a rename/deactivate also changes what the Designation list shows. */
const onDepartmentsChanged = (adminId) => Promise.all([
    cacheService.delPattern(cacheKeys.staff.departmentsPattern(adminId)),
    onDesignationsChanged(adminId),
]);

module.exports = { onDepartmentsChanged, onDesignationsChanged };
