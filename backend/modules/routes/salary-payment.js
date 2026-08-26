'use strict';
const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { recordPaymentSchema } = require('../validators/salary-payment');
const {
    RecordPayment,
    GetPaymentsForPayroll,
    GetPaymentHistory,
} = require('../controllers/salary-payment');

router.post('/payment-history', GetPaymentHistory);
router.get('/payroll/:payrollId', GetPaymentsForPayroll);
router.post('/', validate(recordPaymentSchema), RecordPayment);

module.exports = router;
