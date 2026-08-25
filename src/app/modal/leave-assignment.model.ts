// One cell of the entitlement grid. `null` rather than a zeroed object is what the backend
// sends for a leave type this person was never assigned — "not assigned" and "assigned zero
// days" are different states and the grid renders them differently.
export interface LeaveAssignmentCell {
    allocated: Number,
    used: Number,
}

export interface LeaveAssignmentRow {
    personId: String,
    name: String,
    code: String,
    // Department name for staff, "Class 5" for students, blank for teachers — the backend
    // resolves whichever org unit that person type actually has.
    department: String,
    balances: { [leaveTypeId: string]: LeaveAssignmentCell | null },
}

// The grid endpoint returns its columns and its rows together: a leave type created between
// two separate calls would otherwise render as a column with no cell under it.
export interface LeaveAssignmentGrid {
    leaveTypes: any[],
    rows: LeaveAssignmentRow[],
}

export interface BulkAssignResult {
    assignedCount: Number,
    // Person x type pairs that already had a row, left untouched — re-running the same
    // selection must never reset anybody's usedDays.
    skippedCount: Number,
}
