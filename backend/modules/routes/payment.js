'use strict';
const express = require('express');
const router = express.Router();
const { CreatePayment, ValidatePayment, ValidateUpgradePlanPayment } = require('../controllers/payment');


router.post('/create', CreatePayment);
router.post('/validate', ValidatePayment);
router.post('/validate-upgrade-plan', ValidateUpgradePlanPayment);

module.exports = router;