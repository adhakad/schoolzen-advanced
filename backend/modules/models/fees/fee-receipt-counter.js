'use strict';
const mongoose = require('mongoose');

// Receipt numbering — one atomic sequence per school per calendar year
// (fees/errors.md RECEIPT_NUMBER_COLLISION: never Math.random()). Incremented with $inc
// inside the Collect transaction, so a rolled-back payment never burns a number.
const FeeReceiptCounterSchema = new mongoose.Schema({
    adminId: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    seq: { type: Number, default: 0 },
});

FeeReceiptCounterSchema.index({ adminId: 1, year: 1 }, { unique: true });

const FeeReceiptCounterModel = mongoose.model('v2-fee-receipt-counter', FeeReceiptCounterSchema);

module.exports = FeeReceiptCounterModel;
