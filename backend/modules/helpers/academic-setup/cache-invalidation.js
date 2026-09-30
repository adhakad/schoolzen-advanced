'use strict';
const cacheService = require('../../services/cache/cache.service');
const cacheKeys = require('../../services/cache/cache-keys');

// Academic Setup's write-through invalidation (academic-setup/optimization.md, "Invalidation
// triggers"). Every Class / Subject / Subject Group write calls one of these in the SAME
// request as its DB write — the keys are read by other modules too (Student's cascade filter
// and placement checks), so a missed invalidation here would serve them stale structure.
// Patterns (`…:classes*`) cover every qualifier variant, never just the one a request used.

/** Add/Edit/Delete Class, Bulk Delete Classes. */
const onClassesChanged = (adminId) => Promise.all([
    cacheService.delPattern(cacheKeys.academicSetup.classesPattern(adminId)),
    cacheService.del(cacheKeys.academicSetup.classStats(adminId)),
]);

/** Add/Edit/Delete Subject Group. */
const onSubjectGroupsChanged = (adminId) =>
    cacheService.delPattern(cacheKeys.academicSetup.subjectGroupsPattern(adminId));

/**
 * Add/Edit/Delete Subject. A subject delete also $pulls it out of every group, so the
 * groups' cached subject lists go too.
 */
const onSubjectsChanged = (adminId, { groupsTouched = false } = {}) => Promise.all([
    cacheService.delPattern(cacheKeys.academicSetup.subjectsPattern(adminId)),
    groupsTouched ? onSubjectGroupsChanged(adminId) : null,
]);

module.exports = { onClassesChanged, onSubjectGroupsChanged, onSubjectsChanged };
