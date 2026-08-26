export interface HolidayAssignmentRow {
    // For staff and teachers this is the person's _id. For students it is the CLASS value —
    // students are assigned by class, so a class IS the row. Named the same either way so
    // the page can drive all three scopes with one selection Set.
    personId: String,
    name: String,
    code: String,
    // Department name for staff, "24 students" for a class row, blank for teachers — the
    // backend fills in whichever org unit that scope actually has.
    department: String,
    assignmentId: String | null,
    // null, not an empty string: "not assigned" and "assigned to a template" are different
    // states and the grid renders them differently.
    templateId: String | null,
    templateName: String | null,
}

// The grid endpoint returns its dropdown options and its rows together: a template created
// between two separate calls would otherwise render as a name the dropdown cannot offer.
export interface HolidayAssignmentGrid {
    templates: any[],
    rows: HolidayAssignmentRow[],
}

// assignedCount is people newly given a template; updatedCount is people whose template was
// REPLACED. Unlike leave, re-assigning a holiday template overwrites rather than skips —
// that is exactly what the Edit flow submits.
export interface BulkAssignResult {
    assignedCount: Number,
    updatedCount: Number,
}
