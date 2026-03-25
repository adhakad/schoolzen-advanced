'use strict';
const WhatsappMessageWalletModel = require('../models/whatsapp-message/message-wallet');

/**
 * Check WhatsApp Message Limit for an Admin
 * @param {String} adminId 
 * @param {Number} messagesToSend 
 * @returns {Object} { isAllowed, wallet }
 */
async function checkWhatsappLimit(adminId, messagesToSend) {
    const wallet = await WhatsappMessageWalletModel.findOne({ adminId });

    if (!wallet) {
        throw new Error("WhatsApp message wallet not found for this admin.");
    }

    if (wallet.remainingWhatsappMessage < messagesToSend) {
        return {
            isAllowed: false,
            wallet,
            message: `You have ${wallet.remainingWhatsappMessage} whatsapp message remaining. Please recharge your account to send more.`
        };
    }

    return { isAllowed: true, wallet };
}

/**
 * Update WhatsApp Message Usage After Sending
 * @param {String} adminId 
 * @param {Number} messagesSent 
 */
async function updateWhatsappUsage(adminId, messagesSent) {
    const wallet = await WhatsappMessageWalletModel.findOne({ adminId });

    if (!wallet) {
        throw new Error("WhatsApp message wallet not found for this admin.");
    }

    wallet.usedWhatsappMessage += messagesSent;
    wallet.remainingWhatsappMessage = Math.max(0, wallet.remainingWhatsappMessage - messagesSent);
    wallet.updatedAt = new Date();

    await wallet.save();
}

module.exports = {
    checkWhatsappLimit,
    updateWhatsappUsage
};
