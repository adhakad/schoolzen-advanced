export interface Shift {
    _id: String,
    adminId: String,
    name: String,
    startTime: String,
    endTime: String,
    // Punch-in settings
    earlyPunchMinutes: Number,
    graceMinutes: Number,
    halfDayAfterMinutes: Number,
    // Punch-out settings
    earlyCheckoutMinutes: Number,
    lateCheckoutMinutes: Number,
    status: String,
}
