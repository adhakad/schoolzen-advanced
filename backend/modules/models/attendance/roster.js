'use strict';
const mongoose = require('mongoose');

// v2 staff Roster — the monthly-snapshot shape (CLAUDE.md): one document per
// (adminId, staffId, year, month), `days: Map<"YYYY-MM-DD", shiftId>`. A cell edit is one
// $set/$unset on `days.<dateKey>`; a school-month grid is one scan. `month` is 1-12, parsed
// from the date key (helpers/date-only.js parseDateKey), never from Date arithmetic.
//
// Students are not rostered per day — their shift comes from their class/section
// (./class-shift.js). Mongoose name 'v2-roster'; the legacy 'roster' is never touched.
const RosterSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    staffId: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    days: { type: Map, of: String, default: {} },
    // Every distinct shiftId in `days` — what the Shift delete guard and the legend count
    // against, without unwinding a Map.
    shiftIds: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

RosterSchema.index({ adminId: 1, staffId: 1, year: 1, month: 1 }, { unique: true });
RosterSchema.index({ adminId: 1, year: 1, month: 1 });
RosterSchema.index({ adminId: 1, shiftIds: 1 });

const RosterV2Model = mongoose.model('v2-roster', RosterSchema);

module.exports = RosterV2Model;
