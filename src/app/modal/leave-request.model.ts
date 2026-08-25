export interface LeaveRequest {
    _id: String,
    adminId: String,
    // 'student' | 'teacher' | 'staff'
    personType: String,
    personId: String,
    leaveTypeId: String,
    fromDate: String,
    toDate: String,
    // The days actually GRANTED — "YYYY-MM-DD" keys, written at approval with Sundays and
    // holidays already removed. Empty while Pending.
    leaveDates: String[],
    dayCount: Number,
    year: Number,
    reason: String,
    // 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
    status: String,
    appliedByRole: String,
    actionBy: String,
    actionAt: String,
    // Set only when an approved leave is taken back. The reason is required by the endpoint.
    cancellationReason: String,
    cancelledBy: String,
    cancelledAt: String,

    // Joined by the backend's decorateRequests() — not stored on the document.
    personName: String,
    personCode: String,
    // Staff only — joined from Designation. Teachers and students have no designation, so
    // this is '' for them and the card shows the person type instead.
    personDesignation: String,
    leaveTypeName: String,
    isPaid: Boolean,

    // The approval card's balance preview, also from decorateRequests(). `workingDays` is
    // what the range would actually grant once Sundays and holidays are removed — a Pending
    // request's own dayCount is still 0, so this is the only honest count to show.
    workingDays: Number,
    balanceAllocated: Number,
    balanceUsed: Number,
    balanceRemaining: Number,
    // remaining - workingDays. NEGATIVE when approving would overdraw, which is the whole
    // point of showing it before the button is pressed.
    balanceAfterApproval: Number,
    // Whether this person was explicitly assigned the type, or is falling back to the
    // school-wide cap on the leave type itself.
    balanceAssigned: Boolean,
    // An APPROVED leave whose last day has already passed. Purely a display distinction —
    // `status` stays 'Approved' — but the row shows "Completed", offers no action, and the
    // backend refuses to cancel it.
    isCompleted: Boolean,
}

// One row of the balance strip above the apply form.
export interface LeaveBalance {
    leaveTypeId: String,
    name: String,
    isPaid: Boolean,
    // The school-wide cap on the leave type.
    maxDaysPerYear: Number,
    // What this person was actually granted — their PersonLeaveAssignment allocation when
    // one exists, maxDaysPerYear otherwise. This is the number `remaining` is measured from.
    allocated: Number,
    assigned: Boolean,
    used: Number,
    remaining: Number,
}
