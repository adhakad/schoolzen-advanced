export interface AttendanceRule {
    _id: String,
    adminId: String,
    workStart: String,
    lateAfter: Number,
    halfDayAfter: Number,
    allowOvertime: Boolean,
}
