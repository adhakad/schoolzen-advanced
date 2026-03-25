'use strict';
const mongoose = require('mongoose');

const ClassModel = mongoose.model('class', {
    class: {
        type: Number,
        required: true,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = ClassModel;
