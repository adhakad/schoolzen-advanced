import { Holiday } from './holiday.model';

export interface HolidayTemplate {
    _id: String,
    adminId: String,
    name: String,
    holidayIds: String[],
    createdAt?: String,
    // Joined in by the list endpoints for display only — not stored on the model.
    holidayCount?: Number,
    // Staff/teacher assignments plus class assignments, summed: the admin is asking "is
    // anybody still on this?", which is also what the delete guard checks.
    assignedCount?: Number,
    // Only GetSingleHolidayTemplate resolves these.
    holidays?: Holiday[],
}

// GET /public-states/:year — which states the hand-maintained preset actually has data for.
// holidayCount is what makes the dropdown honest: it distinguishes a filled-in state from an
// empty placeholder document.
export interface PublicHolidayState {
    state: String,
    year: Number,
    holidayCount: Number,
}
