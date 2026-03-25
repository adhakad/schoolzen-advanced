'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const paymentSchema = new Schema({
  orderId: {
    type: String,
    required: true,
    trim: true
  },
  paymentId: {
    type: String,
    trim: true
  },
  adminId: {
    type: String,
    required: true,
    trim: true
  },
  activePlan:{
    type:String,
    required:true,
    trim:true
  },
  amount: {
    type: Number,
    required: true,
    trim: true
  },
  currency: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    trim: true,
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
},
});

module.exports = mongoose.model('Payment', paymentSchema);