'use strict';
const mongoose = require('mongoose');

const AdminPlanModel = mongoose.model('admin-plan', {
  adminId: {
    type: String,
    required: true,
    trim: true
  },
  activePlan: {
    type: String,
    required: true,
    trim: true
  },
  subscriptionType: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: Number,
    required: true,
    trim: true
  },
  planModulesName: {
    type: [String],
    default: []
  },
  planModulesStatus: {
    type: [String],
    default: []
  },
  teacherLimit: {
    type: Number,
    required: true,
    trim: true
  },
  studentLimit: {
    type: Number,
    required: true,
    trim: true
  },
  paymentStatus: {
    type: Boolean,
    trim: true,
    default: false
  },
  expiryStatus: {
    type: Boolean,
    trim: true,
  },
  expirationDate: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
});

module.exports = AdminPlanModel;
