'use strict';
const mongoose = require('mongoose');

const OTPModel = mongoose.model('otp', {
  mobile: {
    type: Number,
    required: true,
    trim: true,
    unique: true
  },
  secureOtp: {
    type: Number,
    required: true,
    trim: true,
  },
  count: { type: Number, required: true, default: 1 },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 5,
  },
  lastSentAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = OTPModel;