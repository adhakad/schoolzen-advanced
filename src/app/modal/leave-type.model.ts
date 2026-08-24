export interface LeaveType {
    _id: String,
    adminId: String,
    name: String,
    isPaid: Boolean,
    maxDaysPerYear: Number,
    // 'all' | 'staff' | 'teacher' | 'student'
    applicableTo: String,
    status: String,
}
