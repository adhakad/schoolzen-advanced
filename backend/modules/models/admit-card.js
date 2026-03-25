'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AdmitCardSchema = new Schema({
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
  status: {
    type: String,
    required: true,
    trim: true,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const AdmitCardModel = mongoose.model('admit-card', AdmitCardSchema);

module.exports = AdmitCardModel;