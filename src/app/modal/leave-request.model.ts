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
    // 'Pending' | 'Approved' | 'Rejected'
    status: String,
    appliedByRole: String,
    actionBy: String,
    actionAt: String,

    // Joined by the backend's decorateRequests() — not stored on the document.
    personName: String,
    personCode: String,
    leaveTypeName: String,
    isPaid: Boolean,
}

// One row of the balance strip above the apply form.
export interface LeaveBalance {
    leaveTypeId: String,
    name: String,
    isPaid: Boolean,
    maxDaysPerYear: Number,
    used: Number,
    remaining: Number,
}
