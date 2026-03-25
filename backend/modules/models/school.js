'use strict';
const mongoose = require('mongoose');

const SchoolModel = mongoose.model('school', {
  adminId: {
    type: String,
    required: true,
    trim: true
  },
  schoolName: {
    type: String,
    required: true,
    trim: true,
  },
  schoolLogo: {
    type: String,
    trim: true,
  },
  schoolLogoPublicId: {
    type: String,
    trim: true,
  },
  affiliationNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  schoolCode: {
    type: String,
    unique: true,
    trim: true,
  },
  foundedYear: {
    type: Number,
  },
  board: {
    type: String,
    trim: true,
  },
  medium: {
    type: String,
    trim: true,
  },
  street: {
    type: String,
    trim: true,
  },
  city: {
    type: String,
    trim: true,
  },
  district: {
    type: String,
    trim: true,
  },
  state: {
    type: String,
    trim: true,
  },
  country: {
    type: String,
    default: 'India',
    trim: true,
  },
  pinCode: {
    type: String,
    trim: true,
  },
  phoneOne: {
    type: String,
    trim: true,
  },
  phoneSecond: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});


module.exports = SchoolModel;
