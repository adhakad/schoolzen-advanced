export interface ClassShift {
    _id: String,
    adminId: String,
    class: String,
    shiftId: String,
    // Joined in by GET /v1/class-shift/:adminId for display only — not stored on the model.
    shiftName?: String,
    startTime?: String,
    endTime?: String,
}
