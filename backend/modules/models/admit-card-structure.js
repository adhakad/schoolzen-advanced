'use strict';
const mongoose = require('mongoose');
const AdmitCardStructureModel = mongoose.model('admit-card-structure', {
  adminId: {
    type: String,
    required: true,
    trim: true
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
  examType: {
    type: String,
    required: true,
    trim: true,
  },
  examDate: {},
  examStartTime: {},
  examEndTime: {},
  lastAcceptFees: { type: String },
  admitCardPublishStatus: {
    type: Boolean,
    required: true,
    trim: true,
    enum: [true, false],
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = AdmitCardStructureModel;