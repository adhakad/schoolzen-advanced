'use strict';
const express = require('express');
const router = express.Router();
const { countRemainingWhatsappMessage } = require('../../controllers/whatsapp-message/message-wallet');

router.get('/remaining-whatsapp-message-count/:adminId', countRemainingWhatsappMessage);
module.exports = router;