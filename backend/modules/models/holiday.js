'use strict';
const mongoose = require('mongoose');

// ONE DECLARED HOLIDAY, owned by one school.
//
// A holiday is a RANGE, not a day: Diwali is a three-day break and Independence Day is one
// day, and both are the same shape here (a single day is simply startDate === endDate).
// Storing it as a range rather than a row per date is what keeps a month's lookup to one
// query — services/holiday-lookup.js expands the range into date keys in memory.
//
// Both dates are UTC midnight, built through helpers/date-only.js toUtcMidnight, for the
// same reason models/daily-attendance.js stores its date that way: these are calendar days,
// never instants, and a timezone conversion anywhere in the chain would drift them a day.
const HolidayModel = mongoose.model('holiday', {
    adminId: {
        type: String,
        required: true,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        // >= startDate. Enforced in controllers/holiday.js rather than here — Mongoose
        // cannot compare two fields in a validator without losing the specific message,
        // and this codebase reports business-rule conflicts as specific strings.
        type: Date,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// The month-overlap read every lookup runs: startDate <= monthEnd AND endDate >= monthStart.
// adminId first because every query is scoped to one school, so this stays narrow however
// many schools' holidays share the collection.
HolidayModel.schema.index({ adminId: 1, startDate: 1, endDate: 1 });

module.exports = HolidayModel;
