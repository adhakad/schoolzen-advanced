'use strict';
const mongoose = require('mongoose');

// A REUSABLE PAY TEMPLATE, owned by one school.
//
// Schools do not pay 40 different salaries — they pay three or four scales with 40 people
// spread across them. A group is named once ("Primary Teacher Grade A") and a staff member
// is pointed at it through models/salary-structure.js, so a scale-wide raise is one edit
// rather than 40.
//
// allowances/deductions are FLEXIBLE ARRAYS, not fixed basic/hra/da/pf columns: every school
// invents its own components (uniform allowance, festival advance, society deduction) and a
// hardcoded list would be wrong for the second school that used it.
//
// NOTHING HERE IS READ AT PAYROLL TIME. controllers/payroll.js SNAPSHOTS the resolved values
// onto the Payroll record when it generates, so editing a group next April can never
// retroactively change a payslip already produced. That is the whole reason Payroll carries
// its own basic/hra/allowances copies instead of a salaryGroupId alone.
const SalaryGroupModel = mongoose.model('salary-group', {
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
    basic: {
        type: Number,
        required: true,
    },
    hra: {
        type: Number,
        default: 0,
    },
    allowances: {
        // Added to gross. [{ name: 'Transport', amount: 1000 }]
        type: [{
            name: { type: String, trim: true },
            amount: { type: Number, default: 0 },
            _id: false,
        }],
        default: [],
    },
    deductions: {
        // Subtracted from gross. [{ name: 'PF', amount: 1800 }]
        type: [{
            name: { type: String, trim: true },
            amount: { type: Number, default: 0 },
            _id: false,
        }],
        default: [],
    },
    calculationMode: {
        // How every amount above is INTERPRETED — the single most consequential field here.
        //   'perMonth' — the amounts are a FULL month's pay. Attendance only bites through
        //                an attendanceDeduction for days not covered by leave or holiday.
        //   'perDay'   — the amounts are PER-DAY rates. Gross is the rate times the days
        //                actually worked, so attendance is already baked into gross and the
        //                deductions stay flat.
        // Part-time and contract staff are the perDay case; salaried staff are perMonth.
        type: String,
        enum: ['perMonth', 'perDay'],
        default: 'perMonth',
        trim: true,
    },
    status: {
        // An inactive group stays visible on the settings table (its history still reads and
        // Payroll records still point at it) but is never offered on the assign picker.
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Two groups called "Primary Teacher" in one school make the assign dropdown unreadable and
// the Payroll snapshot unattributable. Unique per school, not globally — every school names
// its own scales. Same guarantee models/leave-type.js gives its name.
SalaryGroupModel.schema.index({ adminId: 1, name: 1 }, { unique: true });
// The assign picker: active groups for one school.
SalaryGroupModel.schema.index({ adminId: 1, status: 1 });

module.exports = SalaryGroupModel;
