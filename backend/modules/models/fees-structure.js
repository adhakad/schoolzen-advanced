'use strict';
const mongoose = require('mongoose');
const FeesModel = mongoose.model('fees-structure', {
  adminId: {
    type: String,
    required: true,
    trim: true
  },
  session: {
    type: String,
    required: true,
    trim: true,
  },
  class: {
    type: Number,
    required: true,
    trim: true,
  },
  stream: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  admissionFees: {
    type: Number,
    required: true,
    trim: true,
  },
  totalFees: {
    type: Number,
    required: true,
    trim: true,
  },
  feesType: {},
  createdAt: {
    type: Date,
    default: Date.now,
  },

});

module.exports = FeesModel;