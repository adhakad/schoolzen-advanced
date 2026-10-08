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
    // Settings owns these; other modules READ them (settings/optimization.md). One key per
    // piece of data, so the one write path that changes it is the one place that invalidates.
    settings: {
        // label → id map (session-resolver) — rebuilt whenever any session changes.
        sessions: (adminId) => `${adminId}:settings:sessions`,
        activeSession: (adminId) => `${adminId}:settings:academic-session:active`,
        sessionsList: (adminId) => `${adminId}:settings:academic-sessions:list`,
        sessionsPattern: (adminId) => `${adminId}:settings:academic-session*`,
        fieldConfig: (adminId) => `${adminId}:settings:field-config`,
        fieldConfigPattern: (adminId) => `${adminId}:settings:field-config*`,
        roles: (adminId) => `${adminId}:settings:roles`,
        staffPermissions: (adminId, staffId) => `${adminId}:settings:role:${staffId}:permissions`,
        permissionsPattern: (adminId) => `${adminId}:settings:role:*:permissions`,
        ownerStaff: (adminId) => `${adminId}:settings:owner-staff`,
        // The seeded catalog is identical for every school — one global key, invalidated
        // only by a seed deploy (settings/optimization.md, module notes).
        marksheetCatalog: () => 'global:settings:marksheet-templates',
    },
    // Staff's two near-static lookup lists (staff/optimization.md). Manage Staff's dependent
    // Department → Designation dropdown reads these SAME keys, never its own copy.
    staff: {
        departments: (adminId) => `${adminId}:staff:departments`,
        designations: (adminId) => `${adminId}:staff:designations`,
        departmentsPattern: (adminId) => `${adminId}:staff:departments*`,
        designationsPattern: (adminId) => `${adminId}:staff:designations*`,
    },
    // Attendance (attendance/optimization.md). Only the Shift list (near-static) and the
    // day's precomputed live counts — never an AttendanceRecord or PunchLog document.
    attendance: {
        shifts: (adminId) => `${adminId}:attendance:shifts`,
        shiftsPattern: (adminId) => `${adminId}:attendance:shifts*`,
        liveStatus: (adminId, dateKey) => `${adminId}:attendance:live-status:${dateKey}`,
    },
};

// Student's FieldConfig read IS Settings' FieldConfig — the same key, so Settings' write
// invalidation reaches the Admission form and the Excel import with no second key to miss.
keys.student = { fieldConfig: keys.settings.fieldConfig };

module.exports = keys;
