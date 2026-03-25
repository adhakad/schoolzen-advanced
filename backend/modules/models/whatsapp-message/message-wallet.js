
'use strict';
const mongoose = require('mongoose');

const WhatsappMessageWalletModel = mongoose.model('whatsapp-message-wallet', {
    adminId: {
        type: String,
        required: true,
        trim: true
    },
    totalWhatsappMessage: {
        type: Number,
        required: true,
        trim: true
    },
    usedWhatsappMessage: {
        type: Number,
        required: true,
        trim: true,
        default: 0,
    },
    remainingWhatsappMessage: {
        type: Number,
        required: true,
        trim: true
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

module.exports = WhatsappMessageWalletModel;
