'use strict';
const mongoose = require('mongoose');

const AdsModel = mongoose.model('ads', {
    title: {
        type: String,
        required: true,
        trim: true,
    },
    image: {
        type: String,
        required: true,
        trim:true
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = AdsModel;
