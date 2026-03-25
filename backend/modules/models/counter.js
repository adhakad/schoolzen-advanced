
'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CounterSchema = new Schema({
  year: { type: Number, required: true,unique: true},
  count: { type: Number, required: true, default: 0 },
  schoolIdCount:{ type: Number, required: true, default: 0 },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Counter', CounterSchema);;