'use strict';
const mongoose = require('mongoose');
const FeesCollectionModel = mongoose.model('fees-collection', {
  adminId: {
    type: String,
    required: true,
    trim: true
  },
  studentId: {
    type: String,
    required: true,
    trim: true,
  },
  session: {
    type: String,
    required: true,
    trim: true,
  },
  currentSession: {
    type: String,
    required: true,
    trim: true,
  },
  previousSessionFeesStatus:{
    type: Boolean,
    required: true,
    trim: true,
  },
  previousSessionClass: {
    type: Number,
    required: true,
    trim: true,
  },
  previousSessionStream: {
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
    default: 0
  },
  admissionFeesPayable: {
    type: Boolean,
    required: true,
    trim: true,
  },
  admissionFeesReceiptNo: {
    type: Number,
    required: true,
    trim: true,
    default: 0
  },
  admissionFeesPaymentDate: {
    type: String,
    required: true,
    trim: true,
    default: 'empty'
  },
  feesConcession: {
    type: Number,
    required: true,
    trim: true,
  },
  allFeesConcession: {
    type: Number,
    required: true,
    trim: true,
  },
  totalFees: {
    type: Number,
    required: true,
    trim: true,
  },
  paidFees: {
    type: Number,
    required: true,
    trim: true,
  },
  dueFees: {
    type: Number,
    required: true,
    trim: true,
  },
  AllTotalFees: {
    type: Number,
    required: true,
    trim: true,
  },
  AllPaidFees: {
    type: Number,
    required: true,
    trim: true,
  },
  AllDueFees: {
    type: Number,
    required: true,
    trim: true,
  },
  installment: {
    type: [Number],
    default: []
  },
  receipt: {
    type: [Number],
    default: []
  },
  paymentDate: {
    type: [String],
    default: []
  },
  createdBy: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = FeesCollectionModel;