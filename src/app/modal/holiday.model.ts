export interface Holiday {
    _id: String,
    adminId: String,
    name: String,
    // UTC-midnight ISO strings as Mongoose serialises them. Bind the pickers to the
    // *DateKey fields below instead — these two are for display only.
    startDate: String,
    endDate: String,
    // "YYYY-MM-DD", built server-side. The form sends dates back in this shape too, never as
    // an ISO instant, so a browser east of UTC cannot shift the day.
    startDateKey?: String,
    endDateKey?: String,
    // Inclusive span, computed by the backend so the table does not recompute it per row.
    daysCount?: Number,
    createdAt?: String,
}
