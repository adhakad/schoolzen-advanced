'use strict';

// Every v2 cache key, built in ONE place — `{adminId}:{module}:{resource}[:{qualifier}]`
// (module-optimization-guide.md §2). A reader and the writer that invalidates it must spell
// the key identically; building it here is what guarantees that, instead of two modules
// each hand-typing a string that can drift by one character and silently never invalidate.
//
// Academic Setup's keys are shared on purpose: Student's cascade filter reads the SAME
// `classes` / `subject-groups` entries Academic Setup owns, never a Student-local copy of
// the same data with its own TTL (student/optimization.md).

const keys = {
    academicSetup: {
        classes: (adminId) => `${adminId}:academic-setup:classes`,
        subjectGroups: (adminId) => `${adminId}:academic-setup:subject-groups`,
        classStats: (adminId) => `${adminId}:academic-setup:class-stats`,
        // Patterns for write-invalidation — the wildcard covers every qualifier variant.
        classesPattern: (adminId) => `${adminId}:academic-setup:classes*`,
        subjectsPattern: (adminId) => `${adminId}:academic-setup:subjects*`,
        subjectGroupsPattern: (adminId) => `${adminId}:academic-setup:subject-groups*`,
    },
    student: {
        fieldConfig: (adminId) => `${adminId}:student:field-config`,
    },
    settings: {
        sessions: (adminId) => `${adminId}:settings:sessions`,
    },
};

module.exports = keys;
