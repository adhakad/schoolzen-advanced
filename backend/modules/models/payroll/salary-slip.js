'use strict';
const mongoose = require('mongoose');

// v2 SalarySlip (salary-payouts.md) — the issued payslip's identity. Its content is
// assembled from the PayrollRun + its confirmed payments on every read, so this holds only
// what must never change once issued: the number and who issued it.
const SalarySlipSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    payrollRunId: { type: String, required: true, trim: true },
    staffId: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    // SLP-{school}-{YYYYMM}-{sequence}; unique so a concurrent issue retries, never doubles.
    slipNumber: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: String, default: null },
});

SalarySlipSchema.index({ slipNumber: 1 }, { unique: true });
SalarySlipSchema.index({ adminId: 1, payrollRunId: 1 }, { unique: true });
SalarySlipSchema.index({ adminId: 1, year: 1, month: 1 });

const SalarySlipV2Model = mongoose.model('v2-salary-slip', SalarySlipSchema);

module.exports = SalarySlipV2Model;
