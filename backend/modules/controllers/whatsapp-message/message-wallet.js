'use strict';
const WhatsappMessageWalletModel = require('../../models/whatsapp-message/message-wallet');

let countRemainingWhatsappMessage = async (req, res, next) => {
    let adminId = req.params.adminId;
    let getWhatsappMessage = await WhatsappMessageWalletModel.findOne({ adminId: adminId });
    if (!getWhatsappMessage) {
        return res.status(404).json({ errorMsg: 'Whatsapp messages not found!' });
    }
    return res.status(200).json({ countRemainingWhatsappMessage: getWhatsappMessage.remainingWhatsappMessage });
}
module.exports = {
    countRemainingWhatsappMessage
}