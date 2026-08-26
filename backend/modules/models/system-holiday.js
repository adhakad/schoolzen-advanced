'use strict';
const mongoose = require('mongoose');

// THE STATE-WISE PUBLIC HOLIDAY PRESET — system-level data, NOT owned by any school.
//
// Indian school holidays vary by state: every state shares the national gazetted holidays
// and then adds its own (state formation day, regional festivals). Rather than making every
// school type its year in by hand, an admin picks their state on the Templates tab and the
// matching list is CLONED into normal, editable Holiday documents of their own.
//
// DATA IS ENTERED BY HAND IN MONGODB COMPASS, never by application code and never from an
// external API. Adding next year's dates or a new state is an insert into this collection —
// no deployment. That is why the shape is deliberately flat: one document per state + year,
// holidays inline. backend/docs/system-holidays-sample.json is a ready-to-import example.
//
// NOTHING REFERENCES THIS AFTER A CLONE. Generation is a one-time copy: correcting a date
// here next year never retroactively edits a school's already-generated template.
const SystemHolidayModel = mongoose.model('system-holiday', {
    state: {
        // 'NATIONAL' for the holidays common to all of India, otherwise a state key —
        // 'MP', 'MH', and so on. Uppercased so a Compass entry cannot miss by case.
        type: String,
        required: true,
        trim: true,
        uppercase: true,
    },
    year: {
        type: Number,
        required: true,
    },
    holidays: {
        // date is a STRING "YYYY-MM-DD", not a Date. A Compass paste of an ISO Date would
        // be interpreted in the server's zone and could land a day out; a plain date key
        // goes through helpers/date-only.js toUtcMidnight at clone time instead, the same
        // path every other date in this module takes.
        type: [{
            name: { type: String, required: true, trim: true },
            date: { type: String, required: true, trim: true },
        }],
        default: [],
    },
});

// One document per state + year — the shape the whole feature is specified around, and what
// makes the read on the Templates tab a single findOne.
SystemHolidayModel.schema.index({ state: 1, year: 1 }, { unique: true });

module.exports = SystemHolidayModel;
