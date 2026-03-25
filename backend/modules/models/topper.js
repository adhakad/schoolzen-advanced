'use strict';
const mongoose = require('mongoose');

const TopperModel = mongoose.model('topper', {
    name: {
        type: String,
        required: true,
        trim: true,
    },
    class: {
        type: Number,
        required: true,
        trim: true,
    },
    percentile: {
        type: Number,
        required: true,
        trim: true,
    },
    year: {
        type: Number,
        required: true,
        trim: true,
    },
    image: {
        type: String,
        required: true,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = TopperModel;
