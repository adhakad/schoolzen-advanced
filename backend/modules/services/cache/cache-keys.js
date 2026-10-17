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
        // The last finished device sync (time + counts) — Overview's "Last sync" line.
        lastSync: (adminId) => `${adminId}:attendance:last-sync`,
    },
    // Leave (leave/optimization.md). Only the Leave Type list — never a LeaveLimit, request
    // or the assign grid (balances change on every approval).
    leave: {
        types: (adminId) => `${adminId}:leave:types`,
        typesApplicable: (adminId, personType) => `${adminId}:leave:types:applicable:${personType}`,
        typesPattern: (adminId) => `${adminId}:leave:types*`,
    },
    // Holiday (holiday/optimization.md). Near-static lists plus one calendar per template —
    // the per-template key is invalidated in the same request as any edit to it.
    holiday: {
        list: (adminId) => `${adminId}:holiday:list`,
        listPattern: (adminId) => `${adminId}:holiday:list*`,
        templates: (adminId) => `${adminId}:holiday:templates`,
        template: (adminId, templateId) => `${adminId}:holiday:templates:${templateId}`,
        templatesPattern: (adminId) => `${adminId}:holiday:templates*`,
        // The one non-tenant key: SystemHoliday is shared, Compass-maintained data.
        system: (state, year) => `system:holiday:${state}:${year}`,
        systemStates: () => 'system:holiday:states',
    },
    // Payroll (payroll/optimization.md). Only the Salary Group list — never a PayrollRun,
    // payment, or the assign grid (lock state and paid/due are never cached).
    payroll: {
        salaryGroups: (adminId) => `${adminId}:payroll:salary-groups`,
        salaryGroupsPattern: (adminId) => `${adminId}:payroll:salary-groups*`,
    },
    // Fees (fees/optimization.md). Only Fee Structures and saved reminder filters — never a
    // balance: the Fees table, Fee Statement and reminder previews always read live.
    fees: {
        structures: (adminId, sessionId) => `${adminId}:fees:structure:list:${sessionId}`,
        structure: (adminId, structureId) => `${adminId}:fees:structure:${structureId}`,
        structurePattern: (adminId) => `${adminId}:fees:structure*`,
        reminderFilters: (adminId) => `${adminId}:fees:reminder-filters`,
        reminderFiltersPattern: (adminId) => `${adminId}:fees:reminder-filters*`,
    },
    // Examination (examination/optimization.md). Only the two structure pages' near-static
    // reads — never a mark, an ExamResult or an AdmitCard (they change on every save).
    examination: {
        marksheetStructure: (adminId, sessionId) => `${adminId}:examination:marksheet-structure:${sessionId}`,
        marksheetStructureFor: (adminId, sessionId, classId, streamId) =>
            `${adminId}:examination:marksheet-structure:${sessionId}:${classId}:${streamId || 'none'}`,
        marksheetStructurePattern: (adminId) => `${adminId}:examination:marksheet-structure*`,
        admitCardStructureList: (adminId, sessionId) => `${adminId}:examination:admit-card-structure:list:${sessionId}`,
        admitCardStructurePattern: (adminId) => `${adminId}:examination:admit-card-structure*`,
    },
    // Dashboard (dashboard/optimization.md). One key per WIDGET, so a write elsewhere busts
    // only the card it changes. `qualifier` is the day or month the slice was computed for,
    // so a day rollover can never serve yesterday's numbers as today's.
    dashboard: {
        widget: (adminId, widget, sessionId, qualifier) =>
            `${adminId}:dashboard:${widget}:${sessionId || 'none'}${qualifier ? `:${qualifier}` : ''}`,
        widgetPattern: (adminId, widget) => `${adminId}:dashboard:${widget}:*`,
        pattern: (adminId) => `${adminId}:dashboard:*`,
        // The live-hint throttle gate — not cached data.
        hintGate: (adminId, widget) => `${adminId}:dashboard-hint:${widget}`,
    },
};

// Student's FieldConfig read IS Settings' FieldConfig — the same key, so Settings' write
// invalidation reaches the Admission form and the Excel import with no second key to miss.
keys.student = { fieldConfig: keys.settings.fieldConfig };

module.exports = keys;
