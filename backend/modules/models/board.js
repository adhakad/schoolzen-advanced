'use strict';
const mongoose = require('mongoose');

const BoardModel = mongoose.model('board', {
    boardName: {
        type: String,
        required: true,
        trim: true,
    },
    boardNameByState: {
        type: String,
        required: true,
        trim: true,
    },
    boardShortName: {
        type: String,
        required: true,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = BoardModel;