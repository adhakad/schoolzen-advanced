'use strict';
const express = require('express');
const router = express.Router();
const {CreatePayment,ValidatePayment} = require('../controllers/payment');


router.post('/create',CreatePayment);
router.post('/validate',ValidatePayment);

module.exports = router;